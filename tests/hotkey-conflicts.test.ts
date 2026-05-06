/**
 * Tests for loaded-preset hotkey conflict annotation.
 */
import {
  annotateAndAnalyzeHotkeys,
  formatPresetIdentity,
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
});
