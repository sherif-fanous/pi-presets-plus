/**
 * Reads one scope's preset file from disk and turns it into a list of
 * valid presets plus warnings a user can act on.
 */
import { readFile } from "node:fs/promises";

import type { Preset } from "../types.js";
import { findDuplicatePresetNames, validatePresetShape } from "./validate.js";

/** Output of {@link loadFile}. */
interface LoadFileResult {
  /** Presets that passed shape and uniqueness checks, in file order. */
  presets: Preset[];
  /** Human-readable warnings; safe to surface verbatim via `ctx.ui.notify`. */
  warnings: string[];
}

/**
 * Read and parse a single preset file.
 *
 * A malformed file yields no presets and one warning; a malformed entry
 * inside an otherwise valid file costs only that entry:
 *
 *  | Condition                    | Result                                  |
 *  | ---------------------------- | --------------------------------------- |
 *  | file does not exist          | `{ presets: [], warnings: [] }`         |
 *  | other read error             | `{ presets: [], warnings: [...] }`      |
 *  | invalid JSON                 | `{ presets: [], warnings: [...] }`      |
 *  | top-level not an object      | `{ presets: [], warnings: [...] }`      |
 *  | unsupported `version`        | `{ presets: [], warnings: [...] }`      |
 *  | missing `presets` array      | `{ presets: [], warnings: [...] }`      |
 *  | per-preset shape error       | skip preset, warn, keep the rest        |
 *  | duplicate name within file   | skip later occurrences, warn, keep first|
 */
export async function loadFile(path: string): Promise<LoadFileResult> {
  let rawData: string;

  try {
    rawData = await readFile(path, "utf-8");
  } catch (err) {
    // A missing file is the normal "no presets configured yet" state, so
    // it is the one read error that carries no warning.
    if (isNotFoundError(err)) return emptyResult();

    return emptyResult(
      `The extension could not read preset file ${path}: ${describeError(err)}`,
    );
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawData);
  } catch (err) {
    return emptyResult(
      `The preset file ${path} contains invalid JSON: ${describeError(err)}`,
    );
  }

  if (
    typeof parsedData !== "object" ||
    parsedData === null ||
    Array.isArray(parsedData)
  ) {
    return emptyResult(
      `The preset file ${path} top-level must be an object with a "version" and "presets" field.`,
    );
  }

  const obj = parsedData as Record<string, unknown>;

  if (obj.version !== 1) {
    return emptyResult(
      `The preset file ${path} uses unsupported version ${JSON.stringify(obj.version)}; expected 1. The extension ignored the file and left it unchanged.`,
    );
  }

  if (!Array.isArray(obj.presets)) {
    return emptyResult(
      `The preset file ${path} is missing a top-level "presets" array.`,
    );
  }

  const warnings: string[] = [];
  const validatedPresets: Preset[] = [];
  const rawPresets: unknown[] = obj.presets;

  // Skipping and warning per entry keeps one broken preset from
  // disabling the whole file.
  for (let i = 0; i < rawPresets.length; i++) {
    const candidatePreset = rawPresets[i];
    const result = validatePresetShape(candidatePreset);

    if (!result.ok) {
      const label = describeInvalidPreset(candidatePreset, i);

      warnings.push(
        `The extension skipped preset ${label} in ${path}: ${result.reason ?? "Its shape is invalid."}`,
      );

      continue;
    }

    // validatePresetShape already proved the required fields are present.
    const preset = candidatePreset as Preset;

    validatedPresets.push(
      preset.tools === undefined
        ? preset
        : { ...preset, tools: [...new Set(preset.tools)] },
    );
  }

  // The first entry to claim a name keeps it.
  const duplicatePresetNames = findDuplicatePresetNames(validatedPresets);

  if (duplicatePresetNames.length > 0) {
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

  return { presets: validatedPresets, warnings };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;

  return String(err);
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

/** Empty result used whenever the file cannot be read or is malformed. */
function emptyResult(warning?: string): LoadFileResult {
  return { presets: [], warnings: warning ? [warning] : [] };
}

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }

  return err.code === "ENOENT";
}
