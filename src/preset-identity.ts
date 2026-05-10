/**
 * Shared preset identity helpers for pi-presets-plus.
 *
 * Owns name-and-scope identity comparison and lookup helpers. Does not own
 * preset storage, loading, activation, or hotkey behavior.
 */
import type { PresetScope } from "./types.js";

/** Minimal shape for values identified by preset name and scope. */
export interface PresetIdentity {
  readonly name: string;
  readonly scope: PresetScope;
}

/** Find a preset-like value by exact preset identity. */
export function findPreset<T extends PresetIdentity>(
  presets: readonly T[],
  identity: PresetIdentity,
): T | undefined {
  return presets.find((preset) => samePresetIdentity(preset, identity));
}

/** Compare two optional preset identities by name and scope. */
export function samePresetIdentity(
  first: PresetIdentity | undefined,
  second: PresetIdentity | undefined,
): boolean {
  return (
    first !== undefined &&
    second !== undefined &&
    first.name === second.name &&
    first.scope === second.scope
  );
}
