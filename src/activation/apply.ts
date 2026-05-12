/**
 * Preset apply flow.
 *
 * Owns the end-to-end activation of a preset: writing model, thinking, and
 * tool state, recording the baseline overlay, persisting activation, and
 * refreshing status. It does NOT own command lookup, session restore, or
 * picker UI.
 */
import { ACTIVATED_MESSAGE_TYPE } from "../messages.js";
import { samePresetIdentity } from "../preset-identity.js";
import type { LoadedPreset } from "../types.js";
import { captureBaseline } from "./baseline.js";
import type { ActivePresetSession } from "./session.js";
import { stateMatches } from "./state-matches.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

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
  session: ActivePresetSession,
): Promise<ApplyResult> {
  if (preset.unavailable) {
    const kind = preset.unavailable;

    return { ok: false, kind, reason: failureReason(kind, preset) };
  }

  const current = session.current();

  if (
    current &&
    samePresetIdentity(current, preset) &&
    current.restore.kind === "baseline" &&
    stateMatches(preset, pi, ctx)
  ) {
    if (current.dirty) session.markClean(ctx);

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

  if (!(await setModelGuarded(pi, model, session))) {
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
      `Preset "${preset.name}" requested thinking level "${declared}" for ${preset.provider}/${preset.model}. Applied "${effective}" instead.`,
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
        `Preset "${preset.name}" references unknown tools: ${dropped.join(", ")}. They were ignored.`,
        "warning",
      );
    }

    pi.setActiveTools(validTools);
    appliedTools = validTools;
    ownedTools = true;
  }

  // session.start commits the new active state (and refreshes the status
  // badge as part of that commit) BEFORE the customType message is
  // emitted, so observers seeing the "Preset … applied" message can
  // already query the updated state. The reverse order — message first,
  // status second — would briefly publish an event whose corresponding
  // state is not yet visible.
  session.start(
    {
      applyCount,
      baseline,
      lastApplied: {
        ...(appliedTools !== undefined ? { tools: appliedTools } : {}),
        model: { id: preset.model, provider: preset.provider },
        thinkingLevel: effective,
      },
      owned: { model: true, thinkingLevel: true, tools: ownedTools },
      preset,
    },
    ctx,
    pi,
  );

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

  return { ok: true };
}

function failureReason(
  kind: Exclude<ApplyResult, { ok: true }>["kind"],
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
): string {
  switch (kind) {
    case "no-key":
      return `Preset "${preset.name}" is unavailable: missing API key. Activation skipped.`;
    case "no-model":
      return `Preset "${preset.name}" is unavailable: model not installed. Activation skipped.`;
    case "unknown-model":
      return `Preset "${preset.name}" references unknown model ${preset.provider}/${preset.model}.`;
    case "key-revoked":
      return `No API key configured for ${preset.provider}/${preset.model}.`;

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
  session: ActivePresetSession,
): Promise<boolean> {
  return session.withSelfTriggeredModelSet(() => pi.setModel(model));
}
