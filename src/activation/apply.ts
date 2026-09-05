/**
 * Preset apply flow.
 *
 * Owns the end-to-end activation of a preset: writing model, thinking, and
 * tool state, recording the baseline overlay, persisting activation, and
 * refreshing status. It does NOT own command lookup, session restore, or
 * picker UI.
 */
import { samePresetIdentity } from "../preset-identity.js";
import type { LoadedPreset } from "../types.js";
import { captureBaseline } from "./baseline.js";
import { detectDriftReasons, snapshotPresetForDrift } from "./drift.js";
import type { ActivePresetSession } from "./session.js";
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
export interface ApplyNotice {
  readonly severity: "info" | "warning";
  readonly message: string;
}

export type ApplyResult =
  | {
      ok: true;
      applied?: boolean;
      notices?: readonly ApplyNotice[];
    }
  | {
      ok: false;
      kind: "key-revoked" | "no-key" | "no-model" | "unknown-model";
      reason: string;
    };

/**
 * Apply `preset` to Pi state and return structured refusals or successful
 * accompaniments. Callers surface the result through the channel appropriate
 * to their context.
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
    detectDriftReasons(snapshotPresetForDrift(preset), pi, ctx).length === 0
  ) {
    if (current.dirty) session.markClean(ctx);

    return { applied: false, notices: [], ok: true };
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
  const notices: ApplyNotice[] = [];

  pi.setThinkingLevel(effective);

  if (effective !== declared) {
    notices.push({
      message: `Thinking level changed from ${declared} to ${effective} for preset "${preset.name}".`,
      severity: "info",
    });
  }

  let appliedTools = previousAppliedTools;
  let ownedTools = previousOwnedTools;

  if (preset.tools && preset.tools.length > 0) {
    const validTools = filterValidTools(preset.tools, pi.getAllTools());
    const dropped = preset.tools.filter(
      (toolName) => !validTools.includes(toolName),
    );

    if (dropped.length > 0) {
      notices.push({
        message: `Unknown tools ignored for preset "${preset.name}": ${dropped.join(", ")}.`,
        severity: "warning",
      });
    }

    pi.setActiveTools(validTools);
    appliedTools = validTools;
    ownedTools = true;
  }

  // Commit active state before callers present the apply outcome so the
  // footer and any related UI already reflect the new preset.
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

  return { applied: true, notices, ok: true };
}

function failureReason(
  kind: Exclude<ApplyResult, { ok: true }>["kind"],
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
): string {
  switch (kind) {
    case "no-key":
      return `Preset "${preset.name}" is unavailable because its provider has no API key. Pi did not activate it.`;
    case "no-model":
      return `Preset "${preset.name}" is unavailable because its model is not installed. Pi did not activate it.`;
    case "unknown-model":
      return `Preset "${preset.name}" references unknown model ${preset.provider}/${preset.model}.`;
    case "key-revoked":
      return `Pi has no API key configured for ${preset.provider}/${preset.model}.`;

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
