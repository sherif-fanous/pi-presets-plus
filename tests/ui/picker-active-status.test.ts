/**
 * Active-preset status row tests for the preset picker.
 *
 * Owns end-to-end rendering checks for the picker's always-visible active
 * status row; it does NOT own pure picker-state transitions or card details.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { ActivePresetState, LoadedPreset } from "../../src/types.js";
import type { openPicker as openPickerType } from "../../src/ui/picker.js";
import { Key, type Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();

const KEY_BYTES = {
  [Key.left]: "\u001B[D",
  [Key.right]: "\u001B[C",
} as const satisfies Record<typeof Key.left | typeof Key.right, string>;

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

const { openPicker } = await import("../../src/ui/picker.js");

interface MountOptions {
  readonly active?: ActivePresetState;
  readonly presets?: readonly LoadedPreset[];
}

type FakeTheme = {
  bold(value: string): string;
  fg(name: string, value: string): string;
};

const plainTheme: FakeTheme = {
  bold: (value: string) => value,
  fg: (_name: string, value: string) => value,
};

// Wraps every styled fragment in a real SGR sequence so the width math is
// exercised against ANSI escapes, the way a production theme renders.
const ansiTheme: FakeTheme = {
  bold: (value: string) => `\u001B[1m${value}\u001B[22m`,
  fg: (_name: string, value: string) => `\u001B[38;5;42m${value}\u001B[39m`,
};

function activeState(
  preset: LoadedPreset,
  options: { readonly dirty?: true } = {},
): ActivePresetState {
  return {
    declared: preset,
    dirty: options.dirty ?? false,
    name: preset.name,
    restore: { kind: "unknown" },
    scope: preset.scope,
  };
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

async function mountAnsiPicker(options: MountOptions = {}): Promise<Component> {
  return mountPickerWithTheme(ansiTheme, options);
}

async function mountPicker(options: MountOptions = {}): Promise<Component> {
  return mountPickerWithTheme(plainTheme, options);
}

async function mountPickerWithTheme(
  theme: FakeTheme,
  options: MountOptions = {},
): Promise<Component> {
  let component: Component | undefined;
  const session = new ActivePresetSession();
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
            { requestRender: vi.fn(), terminal: { rows: 24 } },
            theme,
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

  loadAll.mockResolvedValue({ presets: options.presets ?? [], warnings: [] });

  if (options.active) {
    session.attach(options.active, ctx);
  }

  await openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate: () => Promise.resolve({ ok: true } as const),
    session,
  });

  if (!component) throw new Error("Picker component was not mounted.");

  return component;
}

function renderLines(component: Component, width = 100): string[] {
  return component.render(width).map(stripAnsi);
}

function renderText(component: Component, width = 100): string {
  return component.render(width).join("\n");
}

function stripAnsi(text: string): string {
  const escapeCharacter = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${escapeCharacter}\\[[0-9;]*m`, "g");

  return text.replace(ansiPattern, "");
}

describe("picker active-preset status row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the active preset name and scope when a preset is active", async () => {
    const preset = makeLoadedPreset("plan");
    const component = await mountPicker({
      active: activeState(preset),
      presets: [preset],
    });

    const rendered = renderText(component);

    expect(rendered).toContain("Active: plan (User)");
    expect(rendered).toContain("●");
  });

  it("renders none when no preset is active", async () => {
    const component = await mountPicker({
      presets: [makeLoadedPreset("plan")],
    });

    expect(renderText(component)).toContain("Active: none");
  });

  it("renders none with an empty preset list and no active preset", async () => {
    const component = await mountPicker({ presets: [] });

    expect(renderText(component)).toContain("Active: none");
  });

  it("places the active row directly below the top border, above the filter", async () => {
    const preset = makeLoadedPreset("plan");
    const component = await mountPicker({
      active: activeState(preset),
      presets: [preset],
    });

    const lines = renderLines(component);
    const activeIndex = lines.findIndex((line) => line.includes("Active:"));
    const filterIndex = lines.findIndex((line) => line.includes("Filter:"));

    expect(activeIndex).toBe(1);
    expect(lines[0]).toContain("Presets Plus");
    expect(filterIndex).toBe(activeIndex + 1);
  });

  it("appends scope to disambiguate same-named presets across scopes", async () => {
    const userPlan = makeLoadedPreset("plan", "user");
    const projectPlan = makeLoadedPreset("plan", "project");
    const component = await mountPicker({
      active: activeState(projectPlan),
      presets: [userPlan, projectPlan],
    });

    expect(renderText(component)).toContain("Active: plan (Project)");
  });

  it("keeps the active name visible when the filter excludes it", async () => {
    const activePreset = makeLoadedPreset("plan");
    const component = await mountPicker({
      active: activeState(activePreset),
      presets: [activePreset, makeLoadedPreset("build")],
    });

    component.handleInput?.("/");
    component.handleInput?.("z");

    const rendered = renderText(component);

    expect(rendered).toContain("Active: plan");
    expect(rendered).toContain("No matching presets");
  });

  it("keeps the active name visible when scope excludes it", async () => {
    const activePreset = makeLoadedPreset("plan", "user");
    const component = await mountPicker({
      active: activeState(activePreset),
      presets: [activePreset, makeLoadedPreset("ship", "project")],
    });

    component.handleInput?.(KEY_BYTES[Key.left]);

    const rendered = renderText(component);

    expect(rendered).toContain("Scope: Project only");
    expect(rendered).toContain("Active: plan");
    expect(rendered).not.toContain("●");
  });

  it("keeps the active name visible across focus modes", async () => {
    const preset = makeLoadedPreset("plan");
    const component = await mountPicker({
      active: activeState(preset),
      presets: [preset],
    });

    component.handleInput?.("/");

    const filterRendered = renderText(component);

    component.handleInput?.("\u001B");

    const listRendered = renderText(component);

    expect(filterRendered).toContain("Active: plan");
    expect(listRendered).toContain("Active: plan");
  });

  it("omits drift text from the active row", async () => {
    const preset = makeLoadedPreset("plan");
    const component = await mountPicker({
      active: activeState(preset, { dirty: true }),
      presets: [preset],
    });

    const activeLine = renderText(component)
      .split("\n")
      .find((line) => line.includes("Active: plan"));

    expect(activeLine).toBeDefined();
    expect(activeLine).not.toContain("modified");
  });

  it("middle-ellipsizes long active names and retains the active dot", async () => {
    const preset = makeLoadedPreset("ifanous-anthropic-claude-opus-4-8");
    const component = await mountPicker({
      active: activeState(preset),
      presets: [preset],
    });

    const rendered = stripAnsi(renderText(component, 42));

    expect(rendered).toContain("Active: ifanous-anth…de-opus-4-8 (User)");
    expect(rendered).toContain("●");
  });

  it("computes width from visible columns when the theme adds ANSI", async () => {
    const preset = makeLoadedPreset("ifanous-anthropic-claude-opus-4-8");
    const component = await mountAnsiPicker({
      active: activeState(preset),
      presets: [preset],
    });

    const rendered = stripAnsi(renderText(component, 42));

    // Identical to the plain-theme expectation: the ANSI escapes the theme
    // injects must not be counted as visible columns, so the ellipsis lands
    // in the same place regardless of styling.
    expect(rendered).toContain("Active: ifanous-anth…de-opus-4-8 (User)");
  });
});
