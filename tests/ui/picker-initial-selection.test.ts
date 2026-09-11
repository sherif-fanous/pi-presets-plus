/**
 * Covers where the picker's cursor lands when the overlay opens: on the
 * active preset when the session has one, and on the first card otherwise.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { PickerState } from "../../src/ui/picker-state.js";
import type { openPicker as openPickerType } from "../../src/ui/picker.js";
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

const { openPicker } = await import("../../src/ui/picker.js");

interface MountOptions {
  readonly active?: LoadedPreset;
  readonly presets: readonly LoadedPreset[];
  readonly terminalRows?: number;
}

interface MountResult {
  readonly component: Component;
  readonly onActivate: ReturnType<typeof vi.fn>;
}

function makeLoadedPreset(
  name: string,
  scope: LoadedPreset["scope"] = "user",
): LoadedPreset {
  return {
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope,
  };
}

/**
 * Opens the picker over fake presets and returns the mounted component.
 *
 * An `active` preset does not have to appear in `presets`: the session is
 * restored from it independently, which is how a preset deleted between
 * two opens reaches the picker.
 */
async function mountPicker(options: MountOptions): Promise<MountResult> {
  let component: Component | undefined;
  const session = new ActivePresetSession();
  const onActivate = vi.fn().mockResolvedValue({ ok: true } as const);
  const ctx = {
    getActiveTools: () => [],
    ui: {
      custom: vi.fn(
        (
          factory: (
            tui: { requestRender(): void; terminal: { rows: number } },
            theme: unknown,
            keybindings: unknown,
            done: (result: unknown) => void,
          ) => Component,
        ) => {
          component = factory(
            {
              requestRender: vi.fn(),
              terminal: { rows: options.terminalRows ?? 24 },
            },
            {
              bold: (value: string) => value,
              fg: (_name: string, value: string) => value,
            },
            {},
            vi.fn(),
          );

          return undefined;
        },
      ),
      notify: vi.fn(),
      setStatus: vi.fn(),
      theme: { fg: (_color: string, value: string) => value },
    },
  } as unknown as Parameters<typeof openPickerType>[0];

  loadAll.mockResolvedValue({ presets: options.presets, warnings: [] });

  if (options.active) {
    session.restoreFromBranch(
      [
        {
          customType: "presets-plus:active",
          data: { name: options.active.name, scope: options.active.scope },
          type: "custom",
        },
      ] as never,
      [options.active],
      ctx,
    );
  }

  await openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate,
    session,
  });

  if (!component) throw new Error("Picker component was not mounted.");

  return { component, onActivate };
}

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

function renderLines(component: Component, width = 100): string[] {
  return component.render(width).map(stripAnsi);
}

/** Return the name on the card the selection marker points at. */
function selectedCardName(component: Component): string | undefined {
  const selectedLine = renderLines(component).find((line) =>
    line.includes("▌"),
  );

  return selectedLine?.split("▌")[1]?.replace("●", "").trim().split(/\s+/)[0];
}

function stripAnsi(text: string): string {
  const escapeCharacter = String.fromCharCode(27);

  return text.replace(new RegExp(`${escapeCharacter}\\[[0-9;]*m`, "g"), "");
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
