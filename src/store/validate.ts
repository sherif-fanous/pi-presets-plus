/**
 * Checks the shape of a single preset, finds duplicate names in a list,
 * and asks Pi's model registry whether a preset can run. None of these
 * helpers throw or touch the file system.
 */
import { validThinkingLevels } from "../activation/thinking.js";
import { THINKING_LEVELS, type Preset, type ThinkingLevel } from "../types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Result of a single-preset shape check. */
interface ValidationResult {
  ok: boolean;
  /** Human-readable reason the preset failed validation; absent on success. */
  reason?: string;
}

/**
 * Report why a preset cannot run against the live model registry:
 * `"no-model"` when its `provider` and `model` pair is not registered,
 * `"no-key"` when the model is registered but its provider has no API
 * key, `undefined` when the preset is available.
 *
 * The key check calls the synchronous `hasConfiguredAuth` and performs no
 * network I/O, so it never refreshes an OAuth token.
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

/** Return whether activation will clamp a preset's thinking level to off. */
export function computeClampWarning(
  preset: Pick<Preset, "provider" | "model" | "thinkingLevel">,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): boolean {
  if (!preset.thinkingLevel || preset.thinkingLevel === "off") return false;

  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (!model) return false;

  return !validThinkingLevels(model).includes(preset.thinkingLevel);
}

/**
 * Find repeated `name` entries in a preset array.
 *
 * Only the second and later occurrences are reported, each with its index,
 * so the loader can drop them and name them in a warning.
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
 * Required fields:
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
 * Unknown fields pass validation, and the serializer writes back only the
 * fields `Preset` declares.
 */
export function validatePresetShape(
  candidatePreset: unknown,
): ValidationResult {
  if (
    typeof candidatePreset !== "object" ||
    candidatePreset === null ||
    Array.isArray(candidatePreset)
  ) {
    return { ok: false, reason: "Preset is not an object." };
  }

  const obj = candidatePreset as Record<string, unknown>;
  const requireString = (
    field: "name" | "provider" | "model",
  ): ValidationResult | undefined => {
    const value = obj[field];

    if (typeof value !== "string" || value.length === 0) {
      return {
        ok: false,
        reason: `Missing or empty required field "${field}".`,
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
        reason: `Invalid thinkingLevel ${label} (expected one of ${THINKING_LEVELS.join(", ")}).`,
      };
    }
  }

  if (obj.tools !== undefined) {
    if (
      !Array.isArray(obj.tools) ||
      obj.tools.some((tool) => typeof tool !== "string")
    ) {
      return { ok: false, reason: `"tools" must be an array of strings.` };
    }
  }

  if (obj.instructions !== undefined && typeof obj.instructions !== "string") {
    return { ok: false, reason: `"instructions" must be a string.` };
  }

  if (obj.hotkey !== undefined && typeof obj.hotkey !== "string") {
    return { ok: false, reason: `"hotkey" must be a string.` };
  }

  if (
    obj.order !== undefined &&
    (typeof obj.order !== "number" || !Number.isFinite(obj.order))
  ) {
    return { ok: false, reason: `"order" must be a finite number.` };
  }

  return { ok: true };
}
