/**
 * Builds the name and the form seed for a duplicated preset.
 */
import { toPersistedPreset } from "../store/api.js";
import type { LoadedPreset, Preset } from "../types.js";

/**
 * Build the form seed for a duplicated preset.
 *
 * The copy drops `hotkey`, because it lands in the same scope as its
 * source and would otherwise register as a conflict straight away. Every
 * other optional field survives through `toPersistedPreset`.
 */
export function serializeForCopy(preset: LoadedPreset, name: string): Preset {
  return toPersistedPreset({ ...preset, name, hotkey: undefined });
}

/** Derive a `<name>-copy` name that no preset in the scope already uses. */
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
