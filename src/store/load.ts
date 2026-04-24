/**
 * Single-file loader for preset storage.
 *
 * `loadFile(path)` reads a single scope file and returns the valid presets
 * it contains plus a list of human-readable warnings. The loader follows
 * the storage spec's two-tier policy:
 *
 * - **File-level errors** (missing file, malformed JSON, wrong version,
 *   wrong top-level shape) → treat the file as empty + warn. The file is
 *   not modified or deleted; users can fix it externally and reload.
 *
 * - **Per-preset errors** (failed shape validation, duplicate names) →
 *   skip that preset + warn naming the offender. Other valid presets in
 *   the same file still load.
 *
 * The loader does no merging or availability computation; that happens in
 * `merge.ts`. It is fully synchronous-from-disk except for the `readFile`
 * call so that callers can drive it concurrently across both scopes.
 */
import { readFile } from "node:fs/promises";

import type { Preset } from "../types.js";
import { findDuplicatePresetNames, validatePresetShape } from "./validate.js";

/** Output of {@link loadFile}. */
export interface LoadFileResult {
  /** Presets that passed shape and uniqueness checks, in file order. */
  presets: Preset[];
  /** Human-readable warnings; safe to surface verbatim via `ctx.ui.notify`. */
  warnings: string[];
}

/**
 * Read and parse a single preset file.
 *
 * Behavior is fully described by the storage spec:
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
    // `ENOENT` is the only error that does not warrant a warning: a
    // missing file is the normal "no presets configured yet" state.
    if (isNotFoundError(err)) return emptyResult();

    return emptyResult(
      `Failed to read preset file ${path}: ${describeError(err)}`,
    );
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawData);
  } catch (err) {
    return emptyResult(
      `Preset file ${path} contains invalid JSON: ${describeError(err)}`,
    );
  }

  if (
    typeof parsedData !== "object" ||
    parsedData === null ||
    Array.isArray(parsedData)
  ) {
    return emptyResult(
      `Preset file ${path} top-level must be an object with a "version" and "presets" field.`,
    );
  }

  const obj = parsedData as Record<string, unknown>;

  if (obj.version !== 1) {
    return emptyResult(
      `Preset file ${path} declares unsupported version ${JSON.stringify(obj.version)}; expected 1. File ignored and left untouched.`,
    );
  }

  if (!Array.isArray(obj.presets)) {
    return emptyResult(
      `Preset file ${path} is missing a top-level "presets" array.`,
    );
  }

  const warnings: string[] = [];
  const validatedPresets: Preset[] = [];
  const rawPresets: unknown[] = obj.presets;

  // First pass: shape validation. Skip-and-warn on individual offenders so
  // one broken preset never disables the whole file.
  for (let i = 0; i < rawPresets.length; i++) {
    const candidatePreset = rawPresets[i];
    const result = validatePresetShape(candidatePreset);

    if (!result.ok) {
      const label = describeInvalidPreset(candidatePreset, i);

      warnings.push(
        `Preset ${label} in ${path} skipped: ${result.reason ?? "invalid shape"}.`,
      );

      continue;
    }

    // validatePresetShape narrows to "object with required fields"; cast is safe.
    validatedPresets.push(candidatePreset as Preset);
  }

  // Second pass: duplicate name detection. The first occurrence wins.
  const duplicatePresetNames = findDuplicatePresetNames(validatedPresets);

  if (duplicatePresetNames.length > 0) {
    const dropIndices = new Set(duplicatePresetNames.map((d) => d.index));
    const uniquePresets: Preset[] = [];

    for (let i = 0; i < validatedPresets.length; i++) {
      if (dropIndices.has(i)) {
        const dropped = validatedPresets[i];

        if (dropped) {
          warnings.push(
            `Preset "${dropped.name}" in ${path} skipped: duplicate name (first occurrence kept).`,
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
