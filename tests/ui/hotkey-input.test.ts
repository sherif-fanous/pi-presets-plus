/**
 * Tests for preset editor hotkey helpers.
 *
 * Covers parsing, pi built-in detection, and loaded-preset conflict lookup
 * without registering actual shortcuts.
 */
import type { LoadedPreset } from "../../src/types.js";
import {
  findConflictingPreset,
  isPiBuiltin,
  parseHotkey,
  PI_BUILTIN_HOTKEYS,
} from "../../src/ui/hotkey-input.js";
import { describe, expect, it } from "vitest";

function loadedPreset(name: string, hotkey?: string): LoadedPreset {
  return {
    hotkey,
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope: "user",
  };
}

describe("parseHotkey", () => {
  it("normalizes modifier order and case", () => {
    const result = parseHotkey("Alt + CTRL + P");

    expect(result).toEqual({
      ok: true,
      parsed: {
        key: "p",
        modifiers: ["ctrl", "alt"],
        normalized: "ctrl+alt+p",
      },
    });
  });

  it("accepts digits, function keys, special keys, and symbols", () => {
    expect(parseHotkey("ctrl+1").ok).toBe(true);
    expect(parseHotkey("shift+f12").ok).toBe(true);
    expect(parseHotkey("alt+enter").ok).toBe(true);
    expect(parseHotkey("ctrl+/").ok).toBe(true);
  });

  it("rejects empty, duplicate modifiers, missing keys, and extra keys", () => {
    expect(parseHotkey("").ok).toBe(false);
    expect(parseHotkey("ctrl+ctrl+p").ok).toBe(false);
    expect(parseHotkey("ctrl+shift").ok).toBe(false);
    expect(parseHotkey("ctrl+p+q").ok).toBe(false);
  });
});

describe("isPiBuiltin", () => {
  it("recognizes representative documented pi defaults", () => {
    for (const hotkey of ["ctrl+l", "ctrl+p", "shift+ctrl+p"] as const) {
      const parsed = parseHotkey(hotkey);

      expect(parsed.ok, hotkey).toBe(true);
      if (parsed.ok) expect(isPiBuiltin(parsed.parsed), hotkey).toBe(true);
    }
  });

  it("recognizes every built-in listed by the helper", () => {
    for (const hotkey of PI_BUILTIN_HOTKEYS) {
      const parsed = parseHotkey(hotkey);

      expect(parsed.ok, hotkey).toBe(true);
      if (parsed.ok) expect(isPiBuiltin(parsed.parsed), hotkey).toBe(true);
    }
  });

  it("does not flag unrelated combinations", () => {
    const parsed = parseHotkey("ctrl+shift+1");

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(isPiBuiltin(parsed.parsed)).toBe(false);
  });
});

describe("findConflictingPreset", () => {
  it("finds another preset with the same normalized hotkey", () => {
    const parsed = parseHotkey("shift+ctrl+1");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(
      findConflictingPreset(parsed.parsed, [
        loadedPreset("plan", "ctrl+shift+1"),
        loadedPreset("ship", "alt+s"),
      ])?.name,
    ).toBe("plan");
  });

  it("ignores the excluded preset and invalid stored hotkeys", () => {
    const parsed = parseHotkey("ctrl+shift+1");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(
      findConflictingPreset(
        parsed.parsed,
        [loadedPreset("plan", "ctrl+shift+1"), loadedPreset("ship", "bad+bad")],
        "plan",
      ),
    ).toBeUndefined();
  });
});
