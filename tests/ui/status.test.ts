/**
 * Covers the compact footer indicator: the active preset name, the dirty
 * marker, `Preset: none` when nothing is active, and the fallback used
 * when no theme is available.
 */
import type { ActivePresetState } from "../../src/types.js";
import { renderStatusBadge } from "../../src/ui/status.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const theme = { fg: (_color: string, text: string) => text } as Pick<
  Theme,
  "fg"
> as Theme;

/** Builds active preset state, clean or dirty. */
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

  it("clears the inactive status when disabled", () => {
    expect(renderStatusBadge(undefined, theme, false)).toBeUndefined();
  });

  it("renders the active preset name", () => {
    expect(renderStatusBadge(active(false), theme)).toBe("Preset: plan");
  });

  it("appends a warning marker when the active preset is dirty", () => {
    expect(renderStatusBadge(active(true), theme)).toBe("Preset: plan!");
  });

  it("always renders an active preset when inactive status is disabled", () => {
    expect(renderStatusBadge(active(false), theme, false)).toBe("Preset: plan");
    expect(renderStatusBadge(active(true), theme, false)).toBe("Preset: plan!");
  });

  it("falls back when no theme is available", () => {
    expect(renderStatusBadge(active(false), undefined)).toBe("Preset: plan");
  });
});
