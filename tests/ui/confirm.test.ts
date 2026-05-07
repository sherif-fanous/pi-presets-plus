/**
 * Regression tests for the confirmation overlay chrome.
 *
 * The golden output guards the shared dialog-frame refactor from changing
 * openConfirm's caller-visible rendering contract.
 */
import { openConfirm } from "../../src/ui/confirm.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";

const theme = {
  bold: (text: string) => text,
  fg: (_name: string, text: string) => text,
} as Theme;

interface ConfirmHarness {
  readonly ctx: Parameters<typeof openConfirm>[0];
  readonly rendered: string[];
}

function makeConfirmHarness(input = "n", width = 48): ConfirmHarness {
  const rendered: string[] = [];
  const ctx = {
    ui: {
      custom: vi.fn(
        (
          factory: (
            tui: unknown,
            theme: Theme,
            keybindings: unknown,
            done: (result: boolean) => void,
          ) => Component & Focusable,
        ) =>
          new Promise<boolean>((resolve) => {
            const component = factory({}, theme, {}, resolve);

            rendered.push(...component.render(width));
            component.handleInput?.(input);
          }),
      ),
    },
  } as unknown as Parameters<typeof openConfirm>[0];

  return { ctx, rendered };
}

describe("openConfirm", () => {
  it("renders the representative confirmation golden output", async () => {
    const harness = makeConfirmHarness();

    await openConfirm(
      harness.ctx,
      "Clear active preset?",
      "Clear managed settings?",
    );

    expect(harness.rendered).toEqual([
      "┌──────────────────────────────────────────────┐",
      "│             Clear active preset?             │",
      "│                                              │",
      "│  Clear managed settings?                     │",
      "│                                              │",
      "│                 ○ Yes   ● No                 │",
      "│ ←/→ choose · Enter confirm · Esc cancel      │",
      "└──────────────────────────────────────────────┘",
    ]);
  });
});
