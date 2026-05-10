/**
 * Tests for the compact preset footer indicator.
 *
 * Asserts that `renderStatusBadge` renders the active preset name directly
 * from active state and `Preset: none` when no preset is attached. The
 * indicator intentionally omits model/thinking — Pi's built-in footer
 * already shows them.
 */
import type { ActivePresetState } from "../../src/types.js";
import { renderStatusBadge } from "../../src/ui/status.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

const theme = { fg: (_color: string, text: string) => text } as Pick<
  Theme,
  "fg"
> as Theme;

function active(dirty: boolean): ActivePresetState {
  return {
    declared: { model: "claude", provider: "anthropic" },
    dirty,
    name: "plan",
    restore: { kind: "unknown" },
    scope: "project",
  };
}

describe("renderStatusBadge", () => {
  it("renders Preset: none when no preset is active", () => {
    expect(renderStatusBadge(undefined, theme)).toBe("Preset: none");
  });

  it("renders the active preset name", () => {
    expect(renderStatusBadge(active(false), theme)).toBe("Preset: plan");
  });

  it("appends a warning marker when the active preset is dirty", () => {
    expect(renderStatusBadge(active(true), theme)).toBe("Preset: plan!");
  });

  it("falls back when no theme is available", () => {
    expect(renderStatusBadge(active(false), undefined)).toBe("Preset: plan");
  });
});
