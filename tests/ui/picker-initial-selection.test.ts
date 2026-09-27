/**
 * Covers where the picker's cursor lands when the overlay opens: on the
 * active preset when the session has one, and on the first card otherwise.
 */
import type { LoadedPreset } from "../../src/types.js";
import type { PickerState } from "../../src/ui/picker-state.js";
import {
  makeLoadedPreset,
  pickerMounter,
  renderLines,
} from "../helpers/picker.js";
import { Key, type Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();

/** Raw terminal byte sequence for the one key these tests drive. */
const KEY_BYTES = {
  [Key.down]: "\u001B[B",
  [Key.enter]: "\r",
} as const satisfies Record<typeof Key.down | typeof Key.enter, string>;

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset: vi.fn(),
    loadAll,
    removePreset: vi.fn(),
    reorderWithinScope: vi.fn().mockResolvedValue({ ok: true }),
  };
});

const mountPicker = pickerMounter(loadAll);

/** Builds numbered presets whose names are easy to find in rendered output. */
function numberedPresets(count: number): LoadedPreset[] {
  return Array.from({ length: count }, (_, index) =>
    makeLoadedPreset(`preset-${String(index).padStart(2, "0")}`),
  );
}

/** Read the picker's private state without rendering it first. */
function pickerState(component: Component): PickerState {
  return (component as unknown as { state: PickerState }).state;
}

/** Return the name on the card the selection marker points at. */
function selectedCardName(component: Component): string | undefined {
  const selectedLine = renderLines(component).find((line) =>
    line.includes("▌"),
  );

  return selectedLine?.split("▌")[1]?.replace("●", "").trim().split(/\s+/)[0];
}

/** Return visible preset-card names, excluding the active status row. */
function visibleCardNames(component: Component): string[] {
  return renderLines(component)
    .filter((line) => !line.includes("Active:"))
    .map((line) => /preset-\d+/.exec(line)?.[0])
    .filter((name): name is string => name !== undefined);
}

describe("picker initial selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the active preset instead of the first card", async () => {
    const presets = [
      makeLoadedPreset("build"),
      makeLoadedPreset("plan"),
      makeLoadedPreset("review"),
    ];
    const { component } = await mountPicker({
      active: presets[1],
      presets,
    });

    expect(pickerState(component).selectedIndex).toBe(1);

    const selectedLine = renderLines(component).find((line) =>
      line.includes("▌"),
    );

    expect(selectedLine).toContain("plan");
    expect(selectedLine).toContain("●");
  });

  it("opens an active preset below the fold near the middle", async () => {
    const presets = numberedPresets(20);
    const active = presets[10];
    const { component } = await mountPicker({
      active,
      presets,
      terminalRows: 60,
    });

    const names = visibleCardNames(component);
    const selectedIndex = names.indexOf(active?.name ?? "");

    expect(selectedIndex).toBeGreaterThan(0);
    expect(selectedIndex).toBeLessThan(names.length - 1);
    expect(renderLines(component).join("\n")).toContain(
      `▌ ● ${active?.name ?? ""}`,
    );
  });

  it("does not rebalance after the opening render", async () => {
    const presets = numberedPresets(20);
    const { component } = await mountPicker({
      active: presets[10],
      presets,
      terminalRows: 24,
    });

    expect(visibleCardNames(component)).toEqual(["preset-10", "preset-11"]);

    component.handleInput?.(KEY_BYTES[Key.down]);

    expect(visibleCardNames(component)).toEqual(["preset-10", "preset-11"]);
  });

  it("clamps the opening viewport to the top near the start", async () => {
    const presets = numberedPresets(20);
    const { component } = await mountPicker({
      active: presets[1],
      presets,
      terminalRows: 60,
    });

    expect(visibleCardNames(component)[0]).toBe("preset-00");
    expect(selectedCardName(component)).toBe("preset-01");
  });

  it("clamps the opening viewport to the bottom near the end", async () => {
    const presets = numberedPresets(20);
    const { component } = await mountPicker({
      active: presets[18],
      presets,
      terminalRows: 60,
    });

    const names = visibleCardNames(component);

    expect(names).toContain("preset-19");
    expect(selectedCardName(component)).toBe("preset-18");
  });

  it("selects the first card when no preset is active", async () => {
    const presets = numberedPresets(2);
    const { component } = await mountPicker({ presets });

    expect(pickerState(component).selectedIndex).toBe(0);
    expect(visibleCardNames(component)[0]).toBe("preset-00");
    expect(selectedCardName(component)).toBe("preset-00");
  });

  it("selects the first card when the active preset is no longer loaded", async () => {
    const presets = numberedPresets(2);
    const { component } = await mountPicker({
      active: makeLoadedPreset("deleted"),
      presets,
    });

    expect(pickerState(component).selectedIndex).toBe(0);
    expect(visibleCardNames(component)[0]).toBe("preset-00");
    expect(selectedCardName(component)).toBe("preset-00");
  });

  it("matches the active preset by scope as well as by name", async () => {
    const userPlan = makeLoadedPreset("plan", "user");
    const projectPlan = makeLoadedPreset("plan", "project");
    const { component } = await mountPicker({
      active: projectPlan,
      presets: [userPlan, projectPlan],
    });

    const selected = pickerState(component).selectedIndex;

    expect(selected).toBe(1);
    expect(renderLines(component).join("\n")).toContain("▌ ● plan");
  });

  it("activates the active preset when Enter follows the open", async () => {
    const presets = [makeLoadedPreset("build"), makeLoadedPreset("plan")];
    const { component, onActivate } = await mountPicker({
      active: presets[1],
      presets,
    });

    component.handleInput?.(KEY_BYTES[Key.enter]);
    await vi.waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));

    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      name: "plan",
      scope: "user",
    });
  });
});
