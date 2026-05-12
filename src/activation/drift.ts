/**
 * Drift-reason detection for active presets.
 *
 * Owns comparing current Pi model, thinking, and tools against a preset
 * snapshot; it does NOT mutate active state, notify users, render UI, or
 * read the on-disk preset files.
 */
import type { LoadedPreset, PresetDriftSnapshot } from "../types.js";
import { sameSet } from "./same-set.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Minimal context surface needed for drift comparison. */
type DriftContext = Pick<ExtensionContext, "model" | "modelRegistry">;

/** Minimal Pi surface needed for drift comparison. */
type DriftPi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;

/** Return the preset dimensions whose current Pi values differ. */
export function detectDriftReasons(
  declared: PresetDriftSnapshot,
  pi: DriftPi,
  ctx: DriftContext,
): string[] {
  const reasons: string[] = [];

  if (
    ctx.model?.provider !== declared.provider ||
    ctx.model.id !== declared.model
  ) {
    reasons.push("model");
  }

  const model = ctx.modelRegistry.find(declared.provider, declared.model);

  if (
    pi.getThinkingLevel() !==
    effectiveThinkingLevel({ thinkingLevel: declared.thinkingLevel }, model)
  ) {
    reasons.push("thinking level");
  }

  if (declared.tools && declared.tools.length > 0) {
    if (!sameSet(pi.getActiveTools(), declared.tools)) reasons.push("tools");
  }

  return reasons;
}

/**
 * Build a drift snapshot from a freshly resolved preset.
 *
 * Stored on `ActivePresetState.declared` at apply / restore time so the
 * per-turn comparison never reopens the preset JSON files. The snapshot is
 * deliberately minimal \u2014 only the fields drift detection actually compares.
 */
export function snapshotPresetForDrift(
  preset: Pick<LoadedPreset, "provider" | "model" | "thinkingLevel" | "tools">,
): PresetDriftSnapshot {
  const snapshot: PresetDriftSnapshot = {
    model: preset.model,
    provider: preset.provider,
  };

  if (preset.thinkingLevel !== undefined) {
    snapshot.thinkingLevel = preset.thinkingLevel;
  }

  if (preset.tools !== undefined) {
    snapshot.tools = [...preset.tools];
  }

  return snapshot;
}
