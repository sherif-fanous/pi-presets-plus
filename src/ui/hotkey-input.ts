/**
 * Parses hotkeys typed into the preset editor and compares them against
 * Pi's built-in keybindings and the hotkeys of other presets.
 */
import type { LoadedPreset } from "../types.js";

/** A hotkey split into its key and modifiers, plus its normalized form. */
export interface ParsedHotkey {
  readonly key: string;
  readonly modifiers: readonly HotkeyModifier[];
  readonly normalized: string;
}

/** Modifier keys a hotkey may combine with its key. */
export type HotkeyModifier = "alt" | "ctrl" | "shift";

/** Parse outcome carrying either the parsed hotkey or a reason it failed. */
export type ParseHotkeyResult =
  | { ok: true; parsed: ParsedHotkey }
  | { ok: false; reason: string };

/**
 * Fixed modifier order used to build the `normalized` form of a hotkey.
 *
 * Two hotkeys with the same modifiers normalize to the same string whatever
 * order the user typed them in, which is what conflict detection compares.
 */
const MODIFIER_ORDER: readonly HotkeyModifier[] = ["ctrl", "shift", "alt"];
/** Modifier names recognized in a typed hotkey. */
const MODIFIERS = new Set<string>(MODIFIER_ORDER);
/** Named keys accepted as the key portion of a hotkey. */
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
/**
 * Symbol keys accepted as the key portion of a hotkey.
 *
 * Shifted symbols depend on the keyboard layout, so `ctrl+!` and
 * `ctrl+shift+1` normalize to different strings even where one chord
 * produces both, and conflict detection treats them as separate hotkeys.
 */
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

/** Default keybindings Pi documents in `docs/keybindings.md`. */
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

/** Normalized forms of every Pi built-in, for conflict lookups. */
const NORMALIZED_PI_BUILTINS = new Set(
  PI_BUILTIN_HOTKEYS.map((hotkey) => parseHotkey(hotkey))
    .filter((result): result is { ok: true; parsed: ParsedHotkey } => result.ok)
    .map((result) => result.parsed.normalized),
);

/** Find the preset whose hotkey normalizes to the same chord, if any. */
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

/** Whether the hotkey shadows one of Pi's built-in keybindings. */
export function isPiBuiltin(parsedKey: ParsedHotkey): boolean {
  return NORMALIZED_PI_BUILTINS.has(parsedKey.normalized);
}

/** Parse a typed hotkey such as `ctrl+shift+p` into its normalized form. */
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
