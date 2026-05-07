/**
 * Tests for the read-only info-dialog overlay.
 *
 * The dialog owns only chrome, tone styling, wrapping, and dismissal.
 */
import { openInfoDialog } from "../../src/ui/info-dialog.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coloredCalls: string[] = [];
const theme = {
  bold: (text: string) => `<b>${text}</b>`,
  fg: (name: string, text: string) => {
    coloredCalls.push(name);

    return `<${name}>${text}</${name}>`;
  },
} as Theme;

beforeEach(() => {
  coloredCalls.length = 0;
});

interface InfoDialogHarness {
  readonly ctx: Parameters<typeof openInfoDialog>[0];
  readonly rendered: string[];
}

function makeInfoDialogHarness(input = "\r", width = 48): InfoDialogHarness {
  const rendered: string[] = [];
  const ctx = {
    ui: {
      custom: vi.fn(
        (
          factory: (
            tui: unknown,
            theme: Theme,
            keybindings: unknown,
            done: () => void,
          ) => Component & Focusable,
        ) =>
          new Promise<void>((resolve) => {
            const component = factory({}, theme, {}, resolve);

            rendered.push(...component.render(width));
            component.handleInput?.(input);
          }),
      ),
    },
  } as unknown as Parameters<typeof openInfoDialog>[0];

  return { ctx, rendered };
}

describe("openInfoDialog", () => {
  it.each([
    ["info", "accent"],
    ["warning", "warning"],
    ["error", "error"],
  ] as const)("renders %s tone title styling", async (tone, color) => {
    await openInfoDialog(makeInfoDialogHarness().ctx, {
      body: "body",
      title: "Title",
      tone,
    });

    expect(coloredCalls).toContain(color);
  });

  it("dismisses on Enter", async () => {
    await expect(
      openInfoDialog(makeInfoDialogHarness("\r").ctx, {
        body: "body",
        title: "Title",
      }),
    ).resolves.toBeUndefined();
  });

  it("dismisses on Esc", async () => {
    await expect(
      openInfoDialog(makeInfoDialogHarness("\u001B").ctx, {
        body: "body",
        title: "Title",
      }),
    ).resolves.toBeUndefined();
  });

  it("wraps multi-line bodies at narrow width", async () => {
    const harness = makeInfoDialogHarness("\r", 16);

    await openInfoDialog(harness.ctx, {
      body: "alpha beta gamma\ndelta epsilon",
      title: "Title",
    });

    expect(harness.rendered.join("\n")).toContain("alpha beta");
    expect(harness.rendered.join("\n")).toContain("gamma");
    expect(harness.rendered.join("\n")).toContain("delta");
    expect(harness.rendered.join("\n")).toContain("epsilon");
  });
});
