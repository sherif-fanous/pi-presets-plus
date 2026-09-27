/**
 * Mounts the preset picker against a fake Pi context so tests can drive
 * and render it, plus the small preset and rendering helpers those tests
 * share.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { openPicker as openPickerType } from "../../src/ui/picker.js";
import { stripAnsi } from "./ansi.js";
import type { Component } from "@earendil-works/pi-tui";
import { vi, type Mock } from "vitest";

/** Theme surface the picker reads when it renders. */
export interface PickerTheme {
  bold(value: string): string;
  fg(name: string, value: string): string;
}

/** Theme that returns text unchanged so assertions can match plain text. */
export const plainTheme: PickerTheme = {
  bold: (value) => value,
  fg: (_name, value) => value,
};

/** A mounted picker and the activation callback it was opened with. */
export interface MountedPicker {
  readonly component: Component;
  readonly onActivate: Mock;
}

/** What to show in the mounted picker. */
export interface MountPickerOptions {
  /** Preset the session is restored to; it need not appear in `presets`. */
  readonly active?: LoadedPreset;
  /** Marks the restored active preset dirty. */
  readonly dirty?: boolean;
  readonly presets: readonly LoadedPreset[];
  readonly terminalRows?: number;
  readonly theme?: PickerTheme;
}

/** Builds a minimal loaded preset with a fixed provider and model. */
export function makeLoadedPreset(
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
 * Returns a function that opens the picker over fake presets and returns
 * the mounted component.
 *
 * Pass the test file's mocked `loadAll`. The picker module is imported on
 * each call, after the test file has registered its store mock.
 */
export function pickerMounter(
  loadAll: Mock,
): (options: MountPickerOptions) => Promise<MountedPicker> {
  return async (options) => {
    const { openPicker } = await import("../../src/ui/picker.js");
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
              options.theme ?? plainTheme,
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

      if (options.dirty) session.markDirty(ctx);
    }

    await openPicker(ctx, {
      hotkeys: new HotkeyRegistry(),
      onActivate,
      session,
    });

    if (!component) throw new Error("Picker component was not mounted.");

    return { component, onActivate };
  };
}

/** Renders a component and strips its ANSI sequences, one entry per line. */
export function renderLines(component: Component, width = 100): string[] {
  return component.render(width).map(stripAnsi);
}
