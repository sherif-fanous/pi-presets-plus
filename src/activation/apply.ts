/**
 * Preset apply flow.
 *
 * Owns the end-to-end activation of a preset: writing model, thinking, and
 * tool state, recording the baseline overlay, persisting activation, and
 * refreshing status. It does NOT own command lookup, session restore, or
 * picker UI.
 */
import { ACTIVATED_MESSAGE_TYPE } from "../messages.js";
import type { LoadedPreset } from "../types.js";
import { updateStatus } from "../ui/status.js";
import { getActive, setActive } from "./active-state.js";
import { captureBaseline } from "./baseline.js";
import { markClean } from "./dirty.js";
import { snapshotPresetForDrift } from "./drift.js";
import { stateMatches } from "./state-matches.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

/**
 * Counter (not boolean) so nested `withSelfTriggeredModelSet` calls cannot
 * silently drop the guard when the inner call's `finally` runs while the
 * outer call is still in flight. Today there is only one caller, but the
 * counter shape costs nothing and removes a footgun for future callers.
 */
let selfTriggeredModelSetDepth = 0;

/**
 * In-memory result from applying a preset.
 *
 * Refusal kinds:
 * - `no-key`: the preset is unavailable because its provider key is missing.
 * - `no-model`: the preset is unavailable because its model is not installed.
 * - `unknown-model`: the preset references a provider/model not in the registry.
 * - `key-revoked`: the model resolved, but `setModel` refused it at apply time.
 */
export type ApplyResult =
  | { ok: true }
  | {
      ok: false;
      kind: "key-revoked" | "no-key" | "no-model" | "unknown-model";
      reason: string;
    };

/**
 * Apply `preset` to Pi state and return a structured refusal on expected
 * activation failures. Callers surface refusal `reason` through the channel
 * appropriate to their context; this function still emits non-refusal warning
 * or informational accompaniments inline for successful activation.
 */
export async function apply(
  preset: LoadedPreset,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<ApplyResult> {
  if (preset.unavailable) {
    const kind = preset.unavailable;

    return { ok: false, kind, reason: failureReason(kind, preset) };
  }

  const current = getActive();

  if (
    current?.name === preset.name &&
    current.scope === preset.scope &&
    current.restore.kind === "baseline" &&
    stateMatches(preset, pi, ctx)
  ) {
    if (current.dirty) await markClean(ctx);

    return { ok: true };
  }

  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (!model) {
    return {
      ok: false,
      kind: "unknown-model",
      reason: failureReason("unknown-model", preset),
    };
  }

  const previousBaseline =
    current?.restore.kind === "baseline" ? current.restore : undefined;
  const baseline = previousBaseline?.baseline ?? captureBaseline(pi, ctx);
  const applyCount = (previousBaseline?.applyCount ?? 0) + 1;
  const previousAppliedTools = previousBaseline?.lastApplied.tools;
  const previousOwnedTools = previousBaseline?.owned.tools ?? false;

  if (!(await setModelGuarded(pi, model))) {
    return {
      ok: false,
      kind: "key-revoked",
      reason: failureReason("key-revoked", preset),
    };
  }

  const effective = effectiveThinkingLevel(preset, model);
  const declared = preset.thinkingLevel ?? "off";

  pi.setThinkingLevel(effective);

  if (effective !== declared) {
    ctx.ui.notify(
      `preset "${preset.name}" requested thinking:${declared} for ${preset.provider}/${preset.model}. applied "${effective}" instead.`,
      "info",
    );
  }

  let appliedTools = previousAppliedTools;
  let ownedTools = previousOwnedTools;

  if (preset.tools && preset.tools.length > 0) {
    const validTools = filterValidTools(preset.tools, pi.getAllTools());
    const dropped = preset.tools.filter(
      (toolName) => !validTools.includes(toolName),
    );

    if (dropped.length > 0) {
      ctx.ui.notify(
        `preset "${preset.name}" references unknown tools: ${dropped.join(", ")}. they were ignored.`,
        "warning",
      );
    }

    pi.setActiveTools(validTools);
    appliedTools = validTools;
    ownedTools = true;
  }

  setActive({
    declared: snapshotPresetForDrift({ ...preset, tools: appliedTools }),
    dirty: false,
    name: preset.name,
    restore: {
      applyCount,
      baseline,
      kind: "baseline",
      lastApplied: {
        ...(appliedTools !== undefined ? { tools: appliedTools } : {}),
        model: { id: preset.model, provider: preset.provider },
        thinkingLevel: effective,
      },
      owned: { model: true, thinkingLevel: true, tools: ownedTools },
    },
    scope: preset.scope,
  });

  pi.appendEntry("presets-plus:active", {
    name: preset.name,
    scope: preset.scope,
  });

  pi.sendMessage({
    customType: ACTIVATED_MESSAGE_TYPE,
    content: `Preset ${preset.name} applied`,
    display: true,
    details: {
      name: preset.name,
      model: `${preset.provider}/${preset.model}`,
      thinkingLevel: effective,
    },
  });

  updateStatus(ctx, getActive(), (name, scope) =>
    name === preset.name && scope === preset.scope ? preset : undefined,
  );

  return { ok: true };
}

export function isSelfTriggeredModelSet(): boolean {
  return selfTriggeredModelSetDepth > 0;
}

/**
 * Run `fn` with the self-call counter raised so a `model_select` event
 * triggered by `pi.setModel` inside `fn` is recognized as our own write
 * and ignored by the drift-detection handler. The counter shape (vs. a
 * boolean) keeps nested or concurrent calls from accidentally lowering the
 * guard while an outer call is still in flight.
 */
export async function withSelfTriggeredModelSet<T>(
  fn: () => Promise<T>,
): Promise<T> {
  selfTriggeredModelSetDepth++;

  try {
    return await fn();
  } finally {
    selfTriggeredModelSetDepth--;
  }
}

function failureReason(
  kind: Exclude<ApplyResult, { ok: true }>["kind"],
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
): string {
  switch (kind) {
    case "no-key":
      return `preset "${preset.name}" is unavailable: missing API key. activation skipped.`;
    case "no-model":
      return `preset "${preset.name}" is unavailable: model not installed. activation skipped.`;
    case "unknown-model":
      return `preset "${preset.name}" references unknown model ${preset.provider}/${preset.model}.`;
    case "key-revoked":
      return `no API key configured for ${preset.provider}/${preset.model}.`;

    default: {
      const exhaustive: never = kind;

      return exhaustive;
    }
  }
}

function filterValidTools(
  desired: readonly string[],
  allTools: readonly { name: string }[],
): string[] {
  const available = new Set(allTools.map((tool) => tool.name));

  return desired.filter((toolName) => available.has(toolName));
}

async function setModelGuarded(
  pi: Pick<ExtensionAPI, "setModel">,
  model: NonNullable<ReturnType<ExtensionContext["modelRegistry"]["find"]>>,
): Promise<boolean> {
  return withSelfTriggeredModelSet(() => pi.setModel(model));
}
