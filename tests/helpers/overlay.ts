/**
 * Fakes Pi's `ui.custom` for overlay tests: it mounts the overlay, can
 * record what it renders, and answers it with one keypress.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { vi, type Mock } from "vitest";

/** How the fake overlay host renders and answers the mounted overlay. */
export interface FakeOverlayOptions {
  /** Keypress sent to the overlay after it mounts. */
  readonly input: string;
  /** Receives the rendered lines. Without it the overlay is not rendered. */
  readonly rendered?: string[];
  readonly theme: Theme;
  readonly width?: number;
}

/**
 * Builds a fake `ui.custom` that mounts the overlay, optionally renders it,
 * sends it one keypress, and resolves with the value the overlay finishes
 * with.
 */
export function fakeOverlayCustom(options: FakeOverlayOptions): Mock {
  return vi.fn(
    (
      factory: (
        tui: unknown,
        theme: Theme,
        keybindings: unknown,
        done: (result?: unknown) => void,
      ) => Component & Focusable,
    ) =>
      new Promise<unknown>((resolve) => {
        const component = factory({}, options.theme, {}, resolve);

        options.rendered?.push(...component.render(options.width ?? 48));
        component.handleInput?.(options.input);
      }),
  );
}
