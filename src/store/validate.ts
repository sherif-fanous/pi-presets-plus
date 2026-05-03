/**
 * Validation primitives for the preset storage layer.
 *
 * Owns shape validation of individual presets, duplicate-name detection
 * within a list, and runtime availability checks against pi's model
 * registry. None of these helpers throw or perform file-system I/O.
 */
import type { Preset, ThinkingLevel } from "../types.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Result of a single-preset shape check. */
interface ValidationResult {
  ok: boolean;
  /** Human-readable reason the preset failed validation; absent on success. */
  reason?: string;
}

/** Allowed values for `Preset.thinkingLevel`. */
const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

/**
 * Compute the availability of a preset against the live model registry.
 *
 * Returns:
 * - `"no-model"`  the preset's `provider`/`model` is not registered
 * - `"no-key"`    the model is registered but its provider has no API key
 * - `undefined`   the preset is fully available
 *
 * Does not perform any network I/O: the API key check uses
 * `hasConfiguredAuth` (synchronous, fast) rather than refreshing OAuth
 * tokens. Activation-time code paths (later change) re-check with the
 * async resolver.
 */
export function computeAvailability(
  preset: Pick<Preset, "provider" | "model">,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): "no-model" | "no-key" | undefined {
  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (!model) return "no-model";
  if (!ctx.modelRegistry.hasConfiguredAuth(model)) return "no-key";

  return undefined;
}

/**
 * Find duplicate `name` entries in a preset array, preserving the index of
 * each duplicate (i.e. the second and subsequent occurrences) so the
 * loader can skip-and-warn naming the offenders.
 *
 * Pure: does not mutate the input array.
 */
export function findDuplicatePresetNames(
  presets: readonly Preset[],
): { name: string; index: number }[] {
  const seenPresetNames = new Set<string>();
  const duplicatePresetNames: { name: string; index: number }[] = [];

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];

    if (!preset) continue;

    const name = preset.name;

    if (seenPresetNames.has(name)) {
      duplicatePresetNames.push({ name, index: i });
    } else {
      seenPresetNames.add(name);
    }
  }

  return duplicatePresetNames;
}

/**
 * Validate the shape of a single preset.
 *
 * Required fields (per the storage spec):
 *  - `name`     non-empty string
 *  - `provider` non-empty string
 *  - `model`    non-empty string
 *
 * Optional fields are checked when present:
 *  - `thinkingLevel`  must be in the `ThinkingLevel` enum
 *  - `tools`          must be an array of strings
 *  - `instructions`   must be a string
 *  - `hotkey`         must be a string
 *  - `order`          must be a finite number
 *
 * Unknown fields are accepted (forward-compat); the loader's serializer
 * only round-trips the typed shape but extra fields are not flagged.
 */
export function validatePresetShape(
  candidatePreset: unknown,
): ValidationResult {
  if (
    typeof candidatePreset !== "object" ||
    candidatePreset === null ||
    Array.isArray(candidatePreset)
  ) {
    return { ok: false, reason: "preset is not an object" };
  }

  const obj = candidatePreset as Record<string, unknown>;
  const requireString = (
    field: "name" | "provider" | "model",
  ): ValidationResult | undefined => {
    const value = obj[field];

    if (typeof value !== "string" || value.length === 0) {
      return {
        ok: false,
        reason: `missing or empty required field "${field}"`,
      };
    }

    return undefined;
  };
  const nameError = requireString("name");

  if (nameError) return nameError;

  const providerError = requireString("provider");

  if (providerError) return providerError;

  const modelError = requireString("model");

  if (modelError) return modelError;

  if (obj.thinkingLevel !== undefined) {
    if (
      typeof obj.thinkingLevel !== "string" ||
      !THINKING_LEVELS.includes(obj.thinkingLevel as ThinkingLevel)
    ) {
      const label =
        typeof obj.thinkingLevel === "string"
          ? JSON.stringify(obj.thinkingLevel)
          : typeof obj.thinkingLevel;

      return {
        ok: false,
        reason: `invalid thinkingLevel ${label} (expected one of ${THINKING_LEVELS.join(", ")})`,
      };
    }
  }

  if (obj.tools !== undefined) {
    if (
      !Array.isArray(obj.tools) ||
      obj.tools.some((tool) => typeof tool !== "string")
    ) {
      return { ok: false, reason: `"tools" must be an array of strings` };
    }
  }

  if (obj.instructions !== undefined && typeof obj.instructions !== "string") {
    return { ok: false, reason: `"instructions" must be a string` };
  }

  if (obj.hotkey !== undefined && typeof obj.hotkey !== "string") {
    return { ok: false, reason: `"hotkey" must be a string` };
  }

  if (
    obj.order !== undefined &&
    (typeof obj.order !== "number" || !Number.isFinite(obj.order))
  ) {
    return { ok: false, reason: `"order" must be a finite number` };
  }

  return { ok: true };
}
