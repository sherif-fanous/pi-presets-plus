/**
 * Hotkey conflict annotation for loaded presets.
 *
 * Owns preset-vs-preset hotkey parsing and conflict marking. It does NOT own
 * shortcut registration, notifications, or built-in keybinding checks.
 */
import type { LoadedPreset, PresetScope } from "./types.js";
import { parseHotkey, type ParsedHotkey } from "./ui/hotkey-input.js";

export interface HotkeyAnalysis {
  readonly conflicts: HotkeyConflict[];
  /**
   * Invalid declarations found during annotation.
   *
   * This is per-load diagnostic data. User-facing callers should emit these
   * warnings only at deliberate notification boundaries (for example, once at
   * session-start) rather than every time storage is re-read.
   */
  readonly invalid: HotkeyDiagnostic[];
  readonly parsed: ReadonlyMap<LoadedPreset, ParsedHotkey>;
}

export interface HotkeyConflict {
  readonly loser: LoadedPreset & { hotkey: string };
  readonly winner: PresetIdentity;
}

export interface HotkeyDiagnostic {
  readonly preset: LoadedPreset & { hotkey: string };
  /** Short, human-readable parse failure reason safe to show in UI copy. */
  readonly reason: string;
}

export interface PresetIdentity {
  readonly name: string;
  readonly scope: PresetScope;
}

/**
 * Annotate presets with hotkey conflict markers and return parsed hotkey data.
 *
 * Mutates freshly-loaded presets so every UI path can read one canonical
 * annotation without maintaining a parallel conflict map. Before recomputing,
 * it clears all existing `hotkeyConflict` markers so stale annotations from a
 * previous load cannot persist. Invalid hotkeys are reported as ignored and do
 * not participate in conflict detection because they do not identify a valid
 * chord.
 */
export function annotateAndAnalyzeHotkeys(
  presets: LoadedPreset[],
): HotkeyAnalysis {
  const claimed = new Map<string, PresetIdentity>();
  const conflicts: HotkeyConflict[] = [];
  const invalid: HotkeyDiagnostic[] = [];
  const parsedHotkeys = new Map<LoadedPreset, ParsedHotkey>();

  for (const preset of presets) {
    preset.hotkeyConflict = undefined;

    const { hotkey } = preset;

    if (!hotkey) continue;

    const presetWithHotkey: LoadedPreset & { hotkey: string } = {
      ...preset,
      hotkey,
    };
    const parsed = parseHotkey(hotkey);

    if (!parsed.ok) {
      invalid.push({ preset: presetWithHotkey, reason: parsed.reason });

      continue;
    }

    parsedHotkeys.set(preset, parsed.parsed);

    if (preset.shadowed) continue;

    const winner = claimed.get(parsed.parsed.normalized);

    if (winner) {
      preset.hotkeyConflict = true;
      conflicts.push({ loser: presetWithHotkey, winner });

      continue;
    }

    claimed.set(parsed.parsed.normalized, {
      name: preset.name,
      scope: preset.scope,
    });
  }

  return { conflicts, invalid, parsed: parsedHotkeys };
}

/** Returns `"<name>" (<scope>)`, including the quotes around the name. */
export function formatPresetIdentity(identity: PresetIdentity): string {
  return `"${identity.name}" (${identity.scope})`;
}
