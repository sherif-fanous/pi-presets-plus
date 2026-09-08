/**
 * Detaches the active preset and restores Pi to the baseline captured at
 * activation, leaving any field the user changed since then untouched.
 */
import type { ActivePresetState, ThinkingLevel } from "../types.js";
import {
  formatModel,
  formatTools,
  renderClearSummary,
} from "../ui/clear-summary.js";
import { styleReportText } from "../ui/command-report.js";
import { assessOverlay } from "./overlay-assessment.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

/** What a clear will write to Pi and how it will report each field. */
export interface ClearDecision {
  readonly parts: readonly ClearPart[];
  readonly writes: ClearWrites;
}

/** One field's outcome in a clear, ready for the summary renderer. */
export interface ClearPart {
  readonly action: ClearAction;
  /** Baseline tools left out of the restore because Pi no longer has them. */
  readonly dropped?: readonly string[];
  readonly field: ClearField;
  /**
   * Value rendered after the field label.
   *
   * Restored and already-baseline rows carry the baseline value, rows the
   * clear left alone carry the user's current value, and `restore-failed`
   * carries the baseline value the clear could not reach.
   */
  readonly value: string;
}

/** Name of the cleared preset and the per-field outcomes to report. */
export interface ClearResult {
  readonly name: string;
  readonly parts: readonly ClearPart[];
}

/** Active preset plus the Pi values a clear decision compares it against. */
export interface ClearSnapshot {
  readonly active: ActivePresetState;
  readonly allTools: readonly string[];
  readonly currentModel: { provider: string; id: string } | null;
  readonly currentThinking: ThinkingLevel;
  readonly currentTools: readonly string[];
}

/** Values a clear writes back to Pi, omitting the fields it leaves alone. */
export interface ClearWrites {
  readonly model?: { provider: string; id: string };
  readonly thinkingLevel?: ThinkingLevel;
  readonly tools?: readonly string[];
}

/** What the clear did to one field, which the summary turns into prose. */
export type ClearAction =
  | "already-baseline"
  | "baseline-null"
  | "not-owned"
  | "restore-failed"
  | "restored"
  | "restored-partial"
  | "unknown"
  | "user-override";

/** Pi state channel that a clear reports on. */
export type ClearField = "model" | "thinking" | "tools";

/** Run a clear and notify the user with the rendered summary. */
export async function clear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const result = await clearReturning(ctx, pi, session);

  const parts = result?.parts ?? [];
  const severity = parts.some(
    (part) =>
      part.action === "restore-failed" || part.action === "restored-partial",
  )
    ? "warning"
    : "info";

  ctx.ui.notify(
    result
      ? styleReportText(
          renderClearSummary(result.name, result.parts),
          ctx.ui.theme,
        )
      : "No preset is active.",
    severity,
  );
}

/** Run a clear and return its outcome, or `undefined` when none is active. */
export async function clearReturning(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<ClearResult | undefined> {
  const active = session.current();

  if (!active) return undefined;

  const currentModel = ctx.model
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const currentThinking = pi.getThinkingLevel();
  const decision = decideClear({
    active,
    allTools: pi.getAllTools().map((tool) => tool.name),
    currentModel,
    currentThinking,
    currentTools: pi.getActiveTools(),
  });
  const finalParts = await executeClear(
    decision,
    currentThinking,
    ctx,
    pi,
    session,
  );

  session.clear(ctx, pi);

  return { name: active.name, parts: finalParts };
}

/** Decide the writes and per-field outcomes for a clear, writing nothing. */
export function decideClear(snapshot: ClearSnapshot): ClearDecision {
  const { active } = snapshot;
  const currentModelDisplay = formatModel(snapshot.currentModel);
  const currentToolsDisplay = formatTools(snapshot.currentTools);
  const assessment = assessOverlay(active, {
    model: snapshot.currentModel,
    thinkingLevel: snapshot.currentThinking,
    tools: snapshot.currentTools,
  });

  if (assessment.kind === "unknown") {
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
  const { baseline } = assessment.restore;

  switch (assessment.model) {
    case "already-baseline":
      parts.push({
        action: "already-baseline",
        field: "model",
        value: formatModel(baseline.model),
      });

      break;
    case "matches-last-applied":
      if (baseline.model) {
        writes.model = baseline.model;
        parts.push({
          action: "restored",
          field: "model",
          value: formatModel(baseline.model),
        });
      } else {
        // Activation captured no prior model, which happens when Pi starts
        // without one selected. There is nothing to switch back to, so keep
        // the current model and report it as baseline-null.
        parts.push({
          action: "baseline-null",
          field: "model",
          value: currentModelDisplay,
        });
      }

      break;
    case "user-override":
      parts.push({
        action: "user-override",
        field: "model",
        value: currentModelDisplay,
      });

      break;
  }

  switch (assessment.thinking) {
    case "already-baseline":
      parts.push({
        action: "already-baseline",
        field: "thinking",
        value: baseline.thinkingLevel,
      });

      break;
    case "matches-last-applied":
      writes.thinkingLevel = baseline.thinkingLevel;
      parts.push({
        action: "restored",
        field: "thinking",
        value: baseline.thinkingLevel,
      });

      break;
    case "user-override":
      parts.push({
        action: "user-override",
        field: "thinking",
        value: snapshot.currentThinking,
      });

      break;
  }

  if (assessment.tools === "not-owned") {
    parts.push({
      action: "not-owned",
      field: "tools",
      value: currentToolsDisplay,
    });
  } else {
    switch (assessment.tools) {
      case "already-baseline":
        parts.push({
          action: "already-baseline",
          field: "tools",
          value: formatTools(baseline.tools),
        });

        break;

      case "matches-last-applied": {
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

        break;
      }

      case "user-override":
        parts.push({
          action: "user-override",
          field: "tools",
          value: currentToolsDisplay,
        });

        break;
    }
  }

  return { parts, writes };
}

async function executeClear(
  decision: ClearDecision,
  currentThinking: ThinkingLevel,
  ctx: Pick<ExtensionCommandContext, "modelRegistry">,
  pi: Pick<ExtensionAPI, "setActiveTools" | "setModel" | "setThinkingLevel">,
  session: ActivePresetSession,
): Promise<ClearPart[]> {
  const parts = decision.parts.map((part) => ({ ...part }));
  let modelRestored = false;

  if (decision.writes.model) {
    const target = decision.writes.model;
    const model = ctx.modelRegistry.find(target.provider, target.id);
    let restored = false;

    if (model) {
      try {
        restored = await session.withSelfTriggeredModelSet(() =>
          pi.setModel(model),
        );
      } catch {
        restored = false;
      }
    }

    if (restored) {
      modelRestored = true;
    } else {
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

  // Pi resets the thinking level when the model changes, so a successful
  // model restore has to rewrite the level the user is on.
  const targetThinking =
    decision.writes.thinkingLevel ??
    (modelRestored ? currentThinking : undefined);

  if (targetThinking !== undefined) {
    pi.setThinkingLevel(targetThinking);
  }

  if (decision.writes.tools !== undefined) {
    pi.setActiveTools([...decision.writes.tools]);
  }

  return parts;
}
