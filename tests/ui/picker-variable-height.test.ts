/**
 * Regression tests for picker navigation across variable-height cards.
 *
 * Owns end-to-end picker rendering checks for heterogeneous card heights; it
 * does NOT own pure selection math or individual card formatting details.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { openPicker as openPickerType } from "../../src/ui/picker.js";
import { Key, type Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clampScrollToFit = vi.hoisted(() => vi.fn());
const loadAll = vi.fn();
/**
 * Raw terminal byte sequences for the special keys these tests drive.
 *
 * pi-tui exposes `Key.*` as KeyId symbols (`"down"`, `"up"`, ...) for use with
 * `matchesKey`, but it does NOT export an encoder from KeyId back to terminal
 * input bytes — its input pipeline only goes the other direction (bytes →
 * KeyId). Tests that drive a component via `handleInput(rawBytes)` therefore
 * have to maintain their own translation table. Keyed by `Key.*` so a typo on
 * either side is a compile error.
 */
const KEY_BYTES = {
  [Key.down]: "\u001B[B",
  [Key.pageDown]: "\u001B[6~",
  [Key.pageUp]: "\u001B[5~",
  [Key.up]: "\u001B[A",
} as const satisfies Record<
  typeof Key.down | typeof Key.pageDown | typeof Key.pageUp | typeof Key.up,
  string
>;

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset: vi.fn(),
    loadAll,
    removePreset: vi.fn(),
    reorderWithinScope: vi.fn(),
  };
});

vi.mock("../../src/ui/picker-state.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/ui/picker-state.js")>();

  clampScrollToFit.mockImplementation(actual.clampScrollToFit);

  return {
    ...actual,
    clampScrollToFit,
  };
});

const { openPicker } = await import("../../src/ui/picker.js");

interface PresetFixtureOptions {
  readonly availability?: LoadedPreset["unavailable"];
  readonly clampWarning?: true;
  readonly hotkeyConflict?: true;
  readonly hotkeyShadowsBuiltin?: true;
  readonly instructions?: string;
  readonly shadowed?: true;
}

function makeLoadedPreset(
  index: number,
  options: PresetFixtureOptions = {},
): LoadedPreset {
  const {
    availability,
    clampWarning,
    hotkeyConflict,
    hotkeyShadowsBuiltin,
    instructions,
    shadowed,
  } = options;

  return {
    ...(clampWarning ? { clampWarning } : {}),
    ...(hotkeyConflict ? { hotkeyConflict } : {}),
    ...(hotkeyShadowsBuiltin ? { hotkeyShadowsBuiltin } : {}),
    ...(instructions ? { instructions } : {}),
    ...(shadowed ? { shadowed } : {}),
    ...(availability ? { unavailable: availability } : {}),
    model: "claude-opus-4.5",
    name: presetName(index),
    provider: "anthropic",
    scope: index % 2 === 0 ? "user" : "project",
  };
}

function makePreset(index: number): LoadedPreset {
  return makeLoadedPreset(index, {
    ...(index % 3 === 0 ? { instructions: `Prompt for preset ${index}` } : {}),
    ...(index === 5 ? { clampWarning: true } : {}),
    ...(index === 7 ? { hotkeyConflict: true } : {}),
    ...(index === 9 ? { hotkeyShadowsBuiltin: true } : {}),
    ...(index === 11 ? { availability: "no-key" } : {}),
    ...(index === 13 ? { shadowed: true } : {}),
  });
}

function makePresets(count: number): LoadedPreset[] {
  return Array.from({ length: count }, (_unused, index) => makePreset(index));
}

async function mountPicker(
  presets: readonly LoadedPreset[],
): Promise<Component> {
  let component: Component | undefined;
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
            { requestRender: vi.fn(), terminal: { rows: 86 } },
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
      theme: {
        fg: (_color: string, value: string) => value,
      },
    },
  } as unknown as Parameters<typeof openPickerType>[0];

  loadAll.mockResolvedValue({ presets, warnings: [] });

  await openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate: () => Promise.resolve({ ok: true } as const),
    session: new ActivePresetSession(),
  });

  if (!component) throw new Error("Picker component was not mounted.");

  return component;
}

function presetName(index: number): string {
  return `preset-${index.toString().padStart(2, "0")}`;
}

describe("picker variable-height navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the selected card rendered through consecutive Down presses", async () => {
    const component = await mountPicker(makePresets(18));
    const initialRender = component.render(120).join("\n");

    expect(initialRender).toContain(presetName(0));

    for (let step = 1; step <= 12; step++) {
      component.handleInput?.(KEY_BYTES[Key.down]);

      const rendered = component.render(120).join("\n");

      expect(rendered).toContain(presetName(step));

      if (step === 11) {
        expect(rendered).toContain("provider has no API key");
      }
    }
  });

  it("keeps the selected card rendered through repeated PgDn presses", async () => {
    const component = await mountPicker(makePresets(18));

    component.render(120);
    component.handleInput?.(KEY_BYTES[Key.pageDown]);

    expect(component.render(120).join("\n")).toContain(presetName(9));

    component.handleInput?.(KEY_BYTES[Key.pageDown]);

    expect(component.render(120).join("\n")).toContain(presetName(17));
  });

  it("does not need render-time correction for upward navigation", async () => {
    const component = await mountPicker(makePresets(18));

    component.render(120);

    for (let step = 0; step < 8; step++) {
      component.handleInput?.(KEY_BYTES[Key.down]);
    }

    component.render(120);
    clampScrollToFit.mockClear();
    component.handleInput?.(KEY_BYTES[Key.up]);

    expect(component.render(120).join("\n")).toContain(presetName(7));
    expect(clampScrollToFit).not.toHaveBeenCalled();

    clampScrollToFit.mockClear();
    component.handleInput?.(KEY_BYTES[Key.pageUp]);

    expect(component.render(120).join("\n")).toContain(presetName(0));
    expect(clampScrollToFit).not.toHaveBeenCalled();
  });
});
