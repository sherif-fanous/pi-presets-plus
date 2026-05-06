/**
 * Tests for preset card formatting helpers.
 *
 * These cover reusable widget primitives from OpenSpec change
 * `add-preset-picker`; the interactive picker renders these helpers inside a
 * custom TUI component, so these unit checks focus on deterministic text
 * transformations rather than terminal integration.
 */
import type { LoadedPreset } from "../../src/types.js";
import {
  formatAvailabilityStatus,
  formatInstructionsPreview,
  formatScopeValue,
  formatStatusDot,
  formatThinkingLevel,
  formatToolsSummary,
  presetCard,
} from "../../src/ui/widgets.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

const basePreset: LoadedPreset = {
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

const identityTheme: Pick<Theme, "fg" | "bold"> = {
  bold: (text) => text,
  fg: (_color, text) => text,
};

describe("preset widget formatting", () => {
  it("formats readable scope values", () => {
    expect(formatScopeValue(basePreset)).toBe("User");
    expect(formatScopeValue({ ...basePreset, scope: "project" })).toBe(
      "Project",
    );
  });

  it("formats readable availability statuses", () => {
    expect(formatAvailabilityStatus(basePreset)).toBe("");
    expect(
      formatAvailabilityStatus({ ...basePreset, unavailable: "no-key" }),
    ).toBe("Unavailable — missing API key");

    expect(
      formatAvailabilityStatus({ ...basePreset, unavailable: "no-model" }),
    ).toBe("Unavailable — model not found");
  });

  it("formats the active status dot", () => {
    expect(formatStatusDot(true)).toBe("●");
    expect(formatStatusDot(false)).toBe(" ");
  });

  it("formats thinking levels as readable labels", () => {
    expect(formatThinkingLevel("off")).toBe("Off");
    expect(formatThinkingLevel("high")).toBe("High");
    expect(formatThinkingLevel("xhigh")).toBe("X-High");
  });

  it("formats tools as session or preset controlled", () => {
    expect(formatToolsSummary(undefined)).toBe("session");
    expect(formatToolsSummary([], ["read", "bash"])).toBe(
      "session: read, bash",
    );

    expect(formatToolsSummary(["read", "grep"], ["bash"])).toBe(
      "preset: read, grep",
    );

    expect(formatToolsSummary(["read", "grep", "find", "ls", "bash"])).toBe(
      "preset: read, grep, find, ls, bash",
    );
  });

  it("truncates instruction previews with ellipsis", () => {
    expect(formatInstructionsPreview(undefined)).toBe("");
    expect(formatInstructionsPreview("short prompt")).toBe("short prompt");
    expect(formatInstructionsPreview("a".repeat(61))).toBe(
      `${"a".repeat(59)}…`,
    );
  });

  it("renders readable key/value card combinations for visual smoke coverage", () => {
    const lines = presetCard(
      {
        ...basePreset,
        instructions: "PLAN MODE: inspect first and summarize",
        scope: "project",
        shadowed: true,
        thinkingLevel: "high",
        tools: ["read", "grep", "find", "ls", "bash"],
        clampWarning: true,
        hotkeyConflict: true,
        unavailable: "no-key",
      },
      identityTheme,
      {
        active: true,
        dirty: true,
        driftReasons: ["model", "tools"],
        selected: true,
      },
    ).render(120);

    expect(lines).toEqual([
      "▌ ● plan",
      "  Scope:     Project",
      "  Model:     anthropic / claude-opus-4.5",
      "  Thinking:  High",
      "  Tools:     preset: read, grep, find, ls, bash",
      "  Prompt:    PLAN MODE: inspect first and summarize",
      "  Status:    ⚠ thinking will be clamped",
      "  Status:    ⚠ hotkey conflict",
      "  Status:    Unavailable — missing API key",
      "  Drift:     ⚠ Dirty — model, tools differ",
      "  Shadowing: Overridden by project preset",
    ]);
  });
});
