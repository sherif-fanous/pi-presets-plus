/** Validates preset arrays from consolidated configuration documents. */
import type { Preset } from "../types.js";
import { findDuplicatePresetNames, validatePresetShape } from "./validate.js";

interface ParsedPresetArray {
  presets: Preset[];
  warnings: string[];
}

/** Validate a consolidated document's preset array without reading disk. */
export function parsePresetArray(
  rawPresets: readonly unknown[],
  path: string,
): ParsedPresetArray {
  const warnings: string[] = [];
  const validatedPresets: Preset[] = [];

  for (let i = 0; i < rawPresets.length; i++) {
    const candidatePreset = rawPresets[i];
    const result = validatePresetShape(candidatePreset);

    if (!result.ok) {
      warnings.push(
        `The extension skipped preset ${describeInvalidPreset(candidatePreset, i)} in ${path}: ${result.reason ?? "Its shape is invalid."}`,
      );

      continue;
    }

    const preset = candidatePreset as Preset;

    validatedPresets.push(
      preset.tools === undefined
        ? preset
        : { ...preset, tools: [...new Set(preset.tools)] },
    );
  }

  const duplicatePresetNames = findDuplicatePresetNames(validatedPresets);

  if (duplicatePresetNames.length === 0)
    return { presets: validatedPresets, warnings };

  const dropIndices = new Set(
    duplicatePresetNames.map((duplicate) => duplicate.index),
  );
  const uniquePresets: Preset[] = [];

  for (let i = 0; i < validatedPresets.length; i++) {
    if (dropIndices.has(i)) {
      const dropped = validatedPresets[i];

      if (dropped) {
        warnings.push(
          `The extension skipped preset "${dropped.name}" in ${path} because its name is duplicated. It kept the first occurrence.`,
        );
      }

      continue;
    }

    const keep = validatedPresets[i];

    if (keep) uniquePresets.push(keep);
  }

  return { presets: uniquePresets, warnings };
}

/** Best-effort label for an invalid preset entry in warning text. */
function describeInvalidPreset(preset: unknown, index: number): string {
  if (
    typeof preset === "object" &&
    preset !== null &&
    !Array.isArray(preset) &&
    typeof (preset as { name?: unknown }).name === "string" &&
    (preset as { name: string }).name.length > 0
  ) {
    return `"${(preset as { name: string }).name}"`;
  }

  return `at index ${index}`;
}
