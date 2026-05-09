/**
 * Tests for loaded-preset hotkey conflict annotation.
 */
import {
  annotateAndAnalyzeHotkeys,
  formatPresetIdentity,
  hotkeyChanged,
} from "../src/hotkey-conflicts.js";
import type { LoadedPreset } from "../src/types.js";
import { describe, expect, it } from "vitest";

function preset(
  name: string,
  hotkey: string | undefined,
  scope: LoadedPreset["scope"] = "user",
): LoadedPreset {
  return {
    hotkey,
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope,
  };
}

describe("hotkeyChanged", () => {
  it.each([
    ["both empty", "", "", false],
    ["both undefined", undefined, undefined, false],
    ["one empty and one whitespace", "", "   ", false],
    ["same hotkey", "ctrl+1", "ctrl+1", false],
    ["equivalent hotkey casing", "Ctrl+1", "ctrl+1", false],
    ["equivalent modifier order", "shift+ctrl+1", "ctrl+shift+1", false],
    ["different hotkeys", "ctrl+1", "ctrl+2", true],
    ["removed hotkey", "ctrl+1", "", true],
    ["added hotkey", "", "ctrl+1", true],
  ])("detects %s", (_label, prev, next, expected) => {
    expect(hotkeyChanged(prev, next)).toBe(expected);
  });
});

describe("formatPresetIdentity", () => {
  it("formats name and scope without making scope look like part of the name", () => {
    expect(formatPresetIdentity({ name: "plan", scope: "project" })).toBe(
      '"plan" (project)',
    );
  });
});

describe("annotateAndAnalyzeHotkeys", () => {
  it("marks only later presets with the same normalized hotkey", () => {
    const presets = [
      preset("plan", "ctrl+shift+1", "user"),
      preset("review", "shift+ctrl+1", "project"),
      preset("ship", "alt+s", "user"),
    ];

    const analysis = annotateAndAnalyzeHotkeys(presets);

    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBe(true);
    expect(presets[2]?.hotkeyConflict).toBeUndefined();
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0]?.winner).toEqual({
      name: "plan",
      scope: "user",
    });
    expect(analysis.parsed.size).toBe(3);
    expect(analysis.invalid).toEqual([]);
  });

  it("clears stale conflict markers before recomputing", () => {
    const presets = [
      { ...preset("plan", "ctrl+shift+1"), hotkeyConflict: true as const },
      { ...preset("review", "ctrl+shift+2"), hotkeyConflict: true as const },
    ];

    const analysis = annotateAndAnalyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBeUndefined();
  });

  it("reports invalid hotkeys and excludes them from parsed hotkeys", () => {
    const presets = [preset("plan", "ctrl+ctrl+p")];
    const analysis = annotateAndAnalyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(analysis.invalid).toHaveLength(1);
    expect(analysis.invalid[0]?.reason).toBe('duplicate modifier "ctrl"');
    expect(analysis.parsed.size).toBe(0);
  });

  it("annotates Pi built-in shadowing and clears stale markers", () => {
    const builtin = preset("plan", "ctrl+l");
    const ordinary = preset("review", "ctrl+shift+9");
    const empty = preset("ship", undefined);
    const malformed = preset("debug", "ctrl+ctrl+p");

    annotateAndAnalyzeHotkeys([builtin, ordinary, empty, malformed]);

    expect(builtin.hotkeyShadowsBuiltin).toBe(true);
    expect(ordinary.hotkeyShadowsBuiltin).toBeUndefined();
    expect(empty.hotkeyShadowsBuiltin).toBeUndefined();
    expect(malformed.hotkeyShadowsBuiltin).toBeUndefined();

    builtin.hotkey = "ctrl+shift+9";

    annotateAndAnalyzeHotkeys([builtin]);

    expect(builtin.hotkeyShadowsBuiltin).toBeUndefined();
  });

  it("clears Pi built-in annotation when the hotkey is removed", () => {
    const builtin = preset("plan", "ctrl+l");

    annotateAndAnalyzeHotkeys([builtin]);

    expect(builtin.hotkeyShadowsBuiltin).toBe(true);

    builtin.hotkey = undefined;

    annotateAndAnalyzeHotkeys([builtin]);

    expect(builtin.hotkeyShadowsBuiltin).toBeUndefined();
  });

  it("annotates shadowed presets that use Pi built-in hotkeys", () => {
    const shadowed = { ...preset("plan", "ctrl+l"), shadowed: true };

    annotateAndAnalyzeHotkeys([shadowed]);

    expect(shadowed.hotkeyShadowsBuiltin).toBe(true);
  });
});
