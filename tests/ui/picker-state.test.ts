/**
 * Tests for the pure preset-picker state controller.
 *
 * These cover navigation, focus, scope, and selection-preservation invariants
 * from OpenSpec change `add-preset-picker` without needing a terminal or
 * custom TUI component.
 */
import type { LoadedPreset } from "../../src/types.js";
import {
  cycleScope,
  initialPickerState,
  moveSelection,
  preserveSelectionOrFirst,
  selectedPreset,
  setFocusMode,
  visiblePresets,
} from "../../src/ui/picker-state.js";
import { describe, expect, it } from "vitest";

function makePreset(
  name: string,
  scope: "user" | "project" = "user",
  model = "claude-opus-4.5",
): LoadedPreset {
  return {
    model,
    name,
    provider: "anthropic",
    scope,
  };
}

function scopedNames(presets: readonly LoadedPreset[]): string[] {
  return presets.map((preset) => `${preset.scope}:${preset.name}`);
}

describe("picker state", () => {
  it("starts in list focus with all scope and first item selected", () => {
    expect(initialPickerState()).toEqual({
      focusMode: "list",
      scopeFilter: "all",
      scrollOffset: 0,
      selectedIndex: 0,
    });
  });

  it("switches focus modes immutably", () => {
    const state = initialPickerState();
    const next = setFocusMode(state, "filter");

    expect(next).toEqual({ ...state, focusMode: "filter" });
    expect(state.focusMode).toBe("list");
  });

  it("returns visible presets by scope and query", () => {
    const presets = [
      makePreset("plan", "user"),
      makePreset("ship", "project"),
      makePreset("review", "user", "claude-sonnet-4-5"),
    ];

    const projectState = cycleScope(
      cycleScope(initialPickerState(), presets, "", 1, 4),
      presets,
      "",
      1,
      4,
    );

    expect(scopedNames(visiblePresets(projectState, presets, "ship"))).toEqual([
      "project:ship",
    ]);
  });

  it("wraps vertical movement at list boundaries", () => {
    const presets = [makePreset("a"), makePreset("b"), makePreset("c")];
    const state = initialPickerState();

    expect(
      selectedPreset(moveSelection(state, presets, "", -1, 4), presets, "")
        ?.name,
    ).toBe("c");

    const last = moveSelection(state, presets, "", 2, 4, { wrap: false });

    expect(
      selectedPreset(moveSelection(last, presets, "", 1, 4), presets, "")?.name,
    ).toBe("a");
  });

  it("bounds page movement without wrapping", () => {
    const presets = [makePreset("a"), makePreset("b"), makePreset("c")];
    const state = initialPickerState();
    const bottom = moveSelection(state, presets, "", 10, 2, { wrap: false });

    expect(selectedPreset(bottom, presets, "")?.name).toBe("c");

    const top = moveSelection(bottom, presets, "", -10, 2, { wrap: false });

    expect(selectedPreset(top, presets, "")?.name).toBe("a");
  });

  it("cycles scope and preserves selection when still visible", () => {
    const presets = [
      makePreset("global", "user"),
      makePreset("project", "project"),
    ];
    const selectedProject = moveSelection(
      initialPickerState(),
      presets,
      "",
      1,
      4,
    );
    const projectOnly = cycleScope(
      cycleScope(selectedProject, presets, "", 1, 4),
      presets,
      "",
      1,
      4,
    );

    expect(projectOnly.scopeFilter).toBe("project");
    expect(selectedPreset(projectOnly, presets, "")?.name).toBe("project");
  });

  it("jumps to first visible preset when prior selection is hidden", () => {
    const presets = [
      makePreset("global", "user"),
      makePreset("project", "project"),
    ];
    const userOnly = cycleScope(initialPickerState(), presets, "", 1, 4);

    expect(userOnly.scopeFilter).toBe("user");
    expect(selectedPreset(userOnly, presets, "")?.name).toBe("global");
  });

  it("resets selection and scroll when filtering leaves no matches", () => {
    const presets = [makePreset("a"), makePreset("b"), makePreset("c")];
    const scrolled = moveSelection(initialPickerState(), presets, "", 2, 1, {
      wrap: false,
    });
    const next = preserveSelectionOrFirst(
      scrolled,
      presets,
      "zzzz",
      undefined,
      1,
    );

    expect(next.selectedIndex).toBe(0);
    expect(next.scrollOffset).toBe(0);
  });
});
