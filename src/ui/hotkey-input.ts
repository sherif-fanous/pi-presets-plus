/**
 * Hotkey parsing and conflict helpers for preset editor fields.
 *
 * Owns normalizing user-entered key combinations and comparing them against
 * pi built-ins or loaded presets; it does NOT register shortcuts or persist
 * preset files.
 */
import type { LoadedPreset } from "../types.js";

export interface ParsedHotkey {
  readonly key: string;
  readonly modifiers: readonly HotkeyModifier[];
  readonly normalized: string;
}

export type HotkeyModifier = "alt" | "ctrl" | "shift";

export type ParseHotkeyResult =
  | { ok: true; parsed: ParsedHotkey }
  | { ok: false; reason: string };

/**
 * Modifier ordering used for the `normalized` form of a parsed hotkey.
 *
 * The order is fixed (not user-visible) so two hotkeys with the same set of
 * modifiers normalize to the same string regardless of how the user typed
 * them. Conflict detection compares normalized strings only — the
 * presentation layer is free to render modifiers in display order.
 */
const MODIFIER_ORDER: readonly HotkeyModifier[] = ["ctrl", "shift", "alt"];
const MODIFIERS = new Set<string>(MODIFIER_ORDER);
const SPECIAL_KEYS = new Set([
  "backspace",
  "clear",
  "delete",
  "down",
  "end",
  "enter",
  "esc",
  "escape",
  "home",
  "insert",
  "left",
  "pageDown",
  "pageUp",
  "return",
  "right",
  "space",
  "tab",
  "up",
]);
// TODO(change-7): shifted-symbol equivalents are layout-dependent
// (e.g. on a US layout `ctrl+!` and `ctrl+shift+1` produce the same
// physical chord but normalize to different strings here, so conflict
// detection between the two will miss). Revisit when per-preset hotkeys
// actually register with pi-tui's keybinding manager.
const SYMBOL_KEYS = new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?",
]);

/** Defaults copied from pi's documented `docs/keybindings.md`. */
export const PI_BUILTIN_HOTKEYS: readonly string[] = [
  "alt+b",
  "alt+backspace",
  "alt+d",
  "alt+delete",
  "alt+down",
  "alt+enter",
  "alt+f",
  "alt+left",
  "alt+right",
  "alt+up",
  "alt+v",
  "alt+y",
  "backspace",
  "ctrl+-",
  "ctrl+]",
  "ctrl+alt+]",
  "ctrl+a",
  "ctrl+b",
  "ctrl+backspace",
  "ctrl+c",
  "ctrl+d",
  "ctrl+e",
  "ctrl+f",
  "ctrl+g",
  "ctrl+k",
  "ctrl+l",
  "ctrl+left",
  "ctrl+n",
  "ctrl+o",
  "ctrl+p",
  "ctrl+r",
  "ctrl+right",
  "ctrl+s",
  "ctrl+t",
  "ctrl+u",
  "ctrl+v",
  "ctrl+w",
  "ctrl+x",
  "ctrl+y",
  "ctrl+z",
  "delete",
  "down",
  "end",
  "enter",
  "escape",
  "home",
  "left",
  "pageDown",
  "pageUp",
  "right",
  "shift+ctrl+o",
  "shift+ctrl+p",
  "shift+enter",
  "shift+l",
  "shift+t",
  "shift+tab",
  "tab",
  "up",
];

const NORMALIZED_PI_BUILTINS = new Set(
  PI_BUILTIN_HOTKEYS.map((hotkey) => parseHotkey(hotkey))
    .filter((result): result is { ok: true; parsed: ParsedHotkey } => result.ok)
    .map((result) => result.parsed.normalized),
);

export function findConflictingPreset(
  parsedKey: ParsedHotkey,
  loadedPresets: readonly LoadedPreset[],
  excludeName?: string,
): LoadedPreset | undefined {
  return loadedPresets.find((preset) => {
    if (preset.name === excludeName) return false;
    if (!preset.hotkey) return false;

    const parsed = parseHotkey(preset.hotkey);

    return parsed.ok && parsed.parsed.normalized === parsedKey.normalized;
  });
}

export function isPiBuiltin(parsedKey: ParsedHotkey): boolean {
  return NORMALIZED_PI_BUILTINS.has(parsedKey.normalized);
}

export function parseHotkey(text: string): ParseHotkeyResult {
  const raw = text.trim().toLowerCase();

  if (raw.length === 0) return { ok: false, reason: "hotkey is empty" };

  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return { ok: false, reason: "hotkey is empty" };

  const modifierSet = new Set<HotkeyModifier>();
  let key: string | undefined;

  for (const part of parts) {
    if (MODIFIERS.has(part)) {
      const modifier = part as HotkeyModifier;

      if (modifierSet.has(modifier)) {
        return { ok: false, reason: `duplicate modifier "${modifier}"` };
      }

      modifierSet.add(modifier);
    } else if (key === undefined) {
      key = normalizeKey(part);
    } else {
      return { ok: false, reason: "hotkey must contain exactly one key" };
    }
  }

  if (!key) return { ok: false, reason: "hotkey is missing a key" };
  if (!isValidKey(key))
    return { ok: false, reason: `unsupported key "${key}"` };

  const modifiers = MODIFIER_ORDER.filter((modifier) =>
    modifierSet.has(modifier),
  );
  const normalized = [...modifiers, key].join("+");

  return { ok: true, parsed: { key, modifiers, normalized } };
}

function isValidKey(key: string): boolean {
  if (/^[a-z0-9]$/.test(key)) return true;
  if (/^f(?:[1-9]|1[0-2])$/.test(key)) return true;
  if (SPECIAL_KEYS.has(key)) return true;

  return SYMBOL_KEYS.has(key);
}

function normalizeKey(key: string): string {
  switch (key) {
    case "return":
      return "enter";
    case "escape":
      return "esc";
    case "pagedown":
      return "pageDown";
    case "pageup":
      return "pageUp";
    default:
      return key;
  }
}
