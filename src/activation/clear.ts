/**
 * Active-preset clear flow.
 *
 * Owns restoring pi state from the baseline overlay (with user-override
 * protection) and deciding clear outcomes; it does NOT own apply, picker UI,
 * or pure clear-summary rendering.
 */
import type { ActivePresetState, ThinkingLevel } from "../types.js";
import {
  formatModel,
  formatTools,
  renderClearSummary,
} from "../ui/clear-summary.js";
import { sameSet } from "./same-set.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
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

export interface ClearResult {
  readonly name: string;
  readonly parts: readonly ClearPart[];
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

export async function clear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const result = await clearReturning(ctx, pi, session);

  ctx.ui.notify(
    result
      ? renderClearSummary(result.name, result.parts, ctx.ui.theme)
      : "No preset is active.",
    "info",
  );
}

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
  const decision = decideClear({
    active,
    allTools: pi.getAllTools().map((tool) => tool.name),
    currentModel,
    currentThinking: pi.getThinkingLevel(),
    currentTools: pi.getActiveTools(),
  });
  const finalParts = await executeClear(decision, ctx, pi, session);

  session.clear(ctx, pi);

  return { name: active.name, parts: finalParts };
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

async function executeClear(
  decision: ClearDecision,
  ctx: Pick<ExtensionCommandContext, "modelRegistry">,
  pi: Pick<ExtensionAPI, "setActiveTools" | "setModel" | "setThinkingLevel">,
  session: ActivePresetSession,
): Promise<ClearPart[]> {
  const parts = decision.parts.map((part) => ({ ...part }));

  if (decision.writes.model) {
    const target = decision.writes.model;
    const model = ctx.modelRegistry.find(target.provider, target.id);
    const ok = model
      ? await session.withSelfTriggeredModelSet(() => pi.setModel(model))
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

function sameModel(
  left: { provider: string; id: string } | null,
  right: { provider: string; id: string } | null,
): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}
