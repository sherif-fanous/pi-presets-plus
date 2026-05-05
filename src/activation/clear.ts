/**
 * Active-preset clear flow.
 *
 * Owns restoring pi state from the baseline overlay (with user-override
 * protection) and rendering a user-visible summary; it does NOT own apply,
 * picker UI, or status formatting beyond its own summary.
 */
import type { ActivePresetState, ThinkingLevel } from "../types.js";
import { updateStatus } from "../ui/status.js";
import { clearActive, getActive } from "./active-state.js";
import { withSelfTriggeredModelSet } from "./apply.js";
import { sameSet } from "./same-set.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";

export interface ClearDecision {
  readonly parts: readonly ClearPart[];
  readonly writes: ClearWrites;
}

export interface ClearPart {
  readonly action: ClearAction;
  /** Tools that were dropped because they no longer exist (restored-partial only). */
  readonly dropped?: readonly string[];
  readonly field: ClearField;
  /**
   * The value to render after the field label.
   *
   * - For `restored` / `already-baseline` / `restored-partial`: the baseline
   *   value (which is what the row reports as the post-clear state).
   * - For `user-override` / `not-owned` / `baseline-null` / `unknown`: the
   *   user's *current* value (which the clear left untouched).
   * - For `restore-failed`: the baseline value we tried (and failed) to
   *   reach; the renderer wraps it as "could not switch back to …".
   */
  readonly value: string;
}

export interface ClearSnapshot {
  readonly active: ActivePresetState;
  readonly allTools: readonly string[];
  readonly currentModel: { provider: string; id: string } | null;
  readonly currentThinking: ThinkingLevel;
  readonly currentTools: readonly string[];
}

export interface ClearWrites {
  readonly model?: { provider: string; id: string };
  readonly thinkingLevel?: ThinkingLevel;
  readonly tools?: readonly string[];
}

export type ClearAction =
  | "already-baseline"
  | "baseline-null"
  | "not-owned"
  | "restore-failed"
  | "restored"
  | "restored-partial"
  | "unknown"
  | "user-override";

export type ClearField = "model" | "thinking" | "tools";

interface Styler {
  bold(text: string): string;
  fg(color: Parameters<Theme["fg"]>[0], text: string): string;
}

const FIELD_LABELS: Record<ClearField, string> = {
  model: "model",
  thinking: "thinking level",
  tools: "tools",
};

const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};

/**
 * Choose the plain-English lead sentence that sits under the title.
 *
 * The sentence describes the overall disposition so the per-row values
 * underneath can stay short. Decision priority (most specific first):
 *
 *   1. Every field is `unknown` (priorUnknown branch) — no baseline saved.
 *   2. Any field failed to restore — surface the problem in the lead.
 *   3. Every field already matched baseline — nothing was actually written.
 *   4. Every field is restore-like (restored / restored-partial /
 *      already-baseline) — the happy path; mention unavailable tools if any.
 *   5. Every field was kept (user-override / not-owned / baseline-null) —
 *      preset turned off but no baseline values were applicable.
 *   6. Otherwise it's a mixed result.
 */
export function chooseClearLead(parts: readonly ClearPart[]): string {
  if (parts.every((part) => part.action === "unknown")) {
    return "no saved baseline. current settings were left as-is.";
  }

  if (parts.some((part) => part.action === "restore-failed")) {
    return "tried to restore your previous settings but ran into a problem.";
  }

  if (parts.every((part) => part.action === "already-baseline")) {
    return "your settings already matched the saved baseline.";
  }

  if (parts.every((part) => isRestoreLike(part.action))) {
    return parts.some((part) => part.action === "restored-partial")
      ? "restored your previous settings. some tools are no longer available."
      : "restored your previous settings.";
  }

  if (parts.every((part) => isKeptLike(part.action))) {
    return "kept all your manual changes. nothing to restore.";
  }

  return "restored some settings. kept your manual changes for others.";
}

export async function clear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const active = getActive();

  if (!active) {
    ctx.ui.notify("no preset is active.", "info");

    return;
  }

  const currentModel = ctx.model
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const decision = decideClear({
    active,
    allTools: pi.getAllTools().map((tool) => tool.name),
    currentModel,
    currentThinking: pi.getThinkingLevel(),
    currentTools: pi.getActiveTools(),
  });
  const finalParts = await executeClear(decision, ctx, pi);

  clearActive();
  pi.appendEntry("presets-plus:active", { name: null });
  updateStatus(ctx, getActive(), () => undefined);
  ctx.ui.notify(
    renderClearSummary(active.name, finalParts, ctx.ui.theme),
    "info",
  );
}

export function decideClear(snapshot: ClearSnapshot): ClearDecision {
  const { active } = snapshot;
  const currentModelDisplay = formatModel(snapshot.currentModel);
  const currentToolsDisplay = formatTools(snapshot.currentTools);

  if (active.restore.kind === "unknown") {
    return {
      parts: [
        { action: "unknown", field: "model", value: currentModelDisplay },
        {
          action: "unknown",
          field: "thinking",
          value: snapshot.currentThinking,
        },
        { action: "unknown", field: "tools", value: currentToolsDisplay },
      ],
      writes: {},
    };
  }

  const parts: ClearPart[] = [];
  const writes: {
    -readonly [K in keyof ClearWrites]: ClearWrites[K];
  } = {};
  const { baseline, lastApplied, owned } = active.restore;

  if (sameModel(snapshot.currentModel, baseline.model)) {
    parts.push({
      action: "already-baseline",
      field: "model",
      value: formatModel(baseline.model),
    });
  } else if (sameModel(snapshot.currentModel, lastApplied.model)) {
    if (baseline.model) {
      writes.model = baseline.model;
      parts.push({
        action: "restored",
        field: "model",
        value: formatModel(baseline.model),
      });
    } else {
      parts.push({
        action: "baseline-null",
        field: "model",
        value: currentModelDisplay,
      });
    }
  } else {
    parts.push({
      action: "user-override",
      field: "model",
      value: currentModelDisplay,
    });
  }

  if (snapshot.currentThinking === baseline.thinkingLevel) {
    parts.push({
      action: "already-baseline",
      field: "thinking",
      value: baseline.thinkingLevel,
    });
  } else if (snapshot.currentThinking === lastApplied.thinkingLevel) {
    writes.thinkingLevel = baseline.thinkingLevel;
    parts.push({
      action: "restored",
      field: "thinking",
      value: baseline.thinkingLevel,
    });
  } else {
    parts.push({
      action: "user-override",
      field: "thinking",
      value: snapshot.currentThinking,
    });
  }

  if (!owned.tools) {
    parts.push({
      action: "not-owned",
      field: "tools",
      value: currentToolsDisplay,
    });
  } else {
    const lastAppliedTools = lastApplied.tools ?? [];

    if (sameSet(snapshot.currentTools, baseline.tools)) {
      parts.push({
        action: "already-baseline",
        field: "tools",
        value: formatTools(baseline.tools),
      });
    } else if (sameSet(snapshot.currentTools, lastAppliedTools)) {
      const available = new Set(snapshot.allTools);
      const filtered = baseline.tools.filter((toolName) =>
        available.has(toolName),
      );
      const dropped = baseline.tools.filter(
        (toolName) => !available.has(toolName),
      );

      writes.tools = filtered;
      parts.push({
        action: dropped.length > 0 ? "restored-partial" : "restored",
        dropped: dropped.length > 0 ? dropped : undefined,
        field: "tools",
        value: formatTools(filtered),
      });
    } else {
      parts.push({
        action: "user-override",
        field: "tools",
        value: currentToolsDisplay,
      });
    }
  }

  return { parts, writes };
}

export function renderClearSummary(
  name: string,
  parts: readonly ClearPart[],
  styler: Pick<Theme, "bold" | "fg"> = IDENTITY_STYLER,
): string {
  const safeStyler = normalizeStyler(styler);
  const labels = parts.map((part) => `${FIELD_LABELS[part.field]}:`);
  const labelWidth = Math.max(...labels.map((label) => label.length));
  const title = safeStyler.bold(
    safeStyler.fg("accent", `preset cleared: ${name}`),
  );
  const lead = chooseClearLead(parts);
  const rows = parts.map((part) => {
    const label = `${FIELD_LABELS[part.field]}:`;
    const padding = " ".repeat(labelWidth - label.length);

    return `  ${safeStyler.fg("muted", label)}${padding} ${formatRowValue(part)}`;
  });

  return [title, lead, ...rows].join("\n");
}

async function executeClear(
  decision: ClearDecision,
  ctx: Pick<ExtensionCommandContext, "modelRegistry">,
  pi: Pick<ExtensionAPI, "setActiveTools" | "setModel" | "setThinkingLevel">,
): Promise<ClearPart[]> {
  const parts = decision.parts.map((part) => ({ ...part }));

  if (decision.writes.model) {
    const target = decision.writes.model;
    const model = ctx.modelRegistry.find(target.provider, target.id);
    const ok = model
      ? await withSelfTriggeredModelSet(() => pi.setModel(model))
      : false;

    if (!ok) {
      const index = parts.findIndex((part) => part.field === "model");

      if (index >= 0) {
        parts[index] = {
          action: "restore-failed",
          field: "model",
          value: `${target.provider}/${target.id}`,
        };
      }
    }
  }

  if (decision.writes.thinkingLevel !== undefined) {
    pi.setThinkingLevel(decision.writes.thinkingLevel);
  }

  if (decision.writes.tools !== undefined) {
    pi.setActiveTools([...decision.writes.tools]);
  }

  return parts;
}

function formatModel(model: { provider: string; id: string } | null): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

/**
 * Render the post-colon body for a single field row.
 *
 * The vocabulary intentionally parallels `formatStatus` so a user reading
 * `/presets status` and then `/presets clear <name>` sees the same phrases
 * for "user manually overrode preset value" / "not managed by …" /
 * "no baseline saved for this field". Restored / already-baseline rows
 * stay bare — the lead sentence above the rows already explains the
 * disposition.
 */
function formatRowValue(part: ClearPart): string {
  switch (part.action) {
    case "already-baseline":
    case "restored":
      return part.value;

    case "baseline-null":
    case "unknown":
      return `${part.value} (no baseline saved for this field)`;

    case "not-owned":
      return `${part.value} (not managed by cleared preset)`;

    case "restore-failed":
      return `could not switch back to ${part.value}`;

    case "restored-partial":
      return part.dropped && part.dropped.length > 0
        ? `${part.value} (unavailable: ${part.dropped.join(", ")})`
        : part.value;

    case "user-override":
      return `${part.value} (user manually overrode preset value)`;
  }
}

function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

function isKeptLike(action: ClearAction): boolean {
  return (
    action === "user-override" ||
    action === "not-owned" ||
    action === "baseline-null"
  );
}

function isRestoreLike(action: ClearAction): boolean {
  return (
    action === "restored" ||
    action === "restored-partial" ||
    action === "already-baseline"
  );
}

function normalizeStyler(styler: Pick<Theme, "bold" | "fg">): Styler {
  return {
    bold: (text) =>
      typeof styler.bold === "function"
        ? styler.bold(text)
        : IDENTITY_STYLER.bold(text),
    fg: (color, text) =>
      typeof styler.fg === "function"
        ? styler.fg(color, text)
        : IDENTITY_STYLER.fg(color, text),
  };
}

function sameModel(
  left: { provider: string; id: string } | null,
  right: { provider: string; id: string } | null,
): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}
