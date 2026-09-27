/**
 * Covers the chrome of the confirmation overlay with a golden rendering of
 * the frame, prompt, choices, and footer hint.
 */
import { openConfirm } from "../../src/ui/confirm.js";
import { fakeOverlayCustom } from "../helpers/overlay.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const theme = {
  bold: (text: string) => text,
  fg: (_name: string, text: string) => text,
} as Theme;

interface ConfirmHarness {
  readonly ctx: Parameters<typeof openConfirm>[0];
  readonly rendered: string[];
}

/** Opens a confirmation overlay and records the lines it renders. */
function makeConfirmHarness(input = "n", width = 48): ConfirmHarness {
  const rendered: string[] = [];
  const ctx = {
    ui: { custom: fakeOverlayCustom({ input, rendered, theme, width }) },
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
