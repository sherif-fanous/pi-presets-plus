/**
 * Preset-copy helpers shared by picker and editor duplicate flows.
 *
 * Owns duplicate seed construction; it does NOT own picker dispatch,
 * editor persistence, or storage writes.
 */
import { toPersistedPreset } from "../store/api.js";
import type { LoadedPreset, Preset } from "../types.js";

/**
 * Build the form seed for a duplicated preset.
 *
 * Deliberately drops `hotkey`: the copy lands in the same scope as its
 * source, and reusing the source's hotkey would immediately register as
 * a conflict. Every other optional field is preserved verbatim through
 * the canonical `toPersistedPreset` funnel.
 */
export function serializeForCopy(preset: LoadedPreset, name: string): Preset {
  return toPersistedPreset({ ...preset, name, hotkey: undefined });
}

export function uniqueCopyName(
  name: string,
  existingNames: readonly string[],
): string {
  const existing = new Set(existingNames);
  const base = `${name}-copy`;

  if (!existing.has(base)) return base;

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix++) {
    const candidate = `${base}-${suffix}`;

    if (!existing.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
