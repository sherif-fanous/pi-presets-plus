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

    const noKey = formatAvailabilityStatus({
      ...basePreset,
      unavailable: "no-key",
    });
    const noModel = formatAvailabilityStatus({
      ...basePreset,
      unavailable: "no-model",
    });

    expect(noKey).toBe("⚠ This preset's provider has no API key configured.");
    expect(noModel).toBe("⚠ This preset's model is no longer available.");
    expect(noKey).not.toMatch(/^Unavailable [—-]/u);
    expect(noModel).not.toMatch(/^Unavailable [—-]/u);
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
    expect(formatToolsSummary(undefined)).toBe("Session");
    expect(formatToolsSummary([], ["read", "bash"])).toBe(
      "Session: read, bash",
    );

    expect(formatToolsSummary(["read", "grep"], ["bash"])).toBe(
      "Preset: read, grep",
    );

    expect(formatToolsSummary(["read", "grep", "find", "ls", "bash"])).toBe(
      "Preset: read, grep, find, ls, bash",
    );
  });

  it("truncates instruction previews with ellipsis", () => {
    expect(formatInstructionsPreview(undefined)).toBe("");
    expect(formatInstructionsPreview("short prompt")).toBe("short prompt");
    expect(formatInstructionsPreview("a".repeat(61))).toBe(
      `${"a".repeat(59)}…`,
    );
  });

  it("keeps Scope and Model values unmuted while labels stay muted", () => {
    const colorTheme: Pick<Theme, "fg" | "bold"> = {
      bold: (text) => text,
      fg: (color, text) => `<${color}>${text}</${color}>`,
    };

    const lines = presetCard(basePreset, colorTheme, {
      active: false,
      selected: false,
    }).render(120);

    expect(lines).toContain("  <muted>Scope:</muted>          User");
    expect(lines).toContain(
      "  <muted>Model:</muted>          anthropic / claude-opus-4.5",
    );
    expect(lines.join("\n")).not.toContain("<muted>User</muted>");
    expect(lines.join("\n")).not.toContain(
      "<muted>anthropic / claude-opus-4.5</muted>",
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
      "  Scope:          Project",
      "  Model:          anthropic / claude-opus-4.5",
      "  Thinking level: High",
      "  Tools:          Preset: read, grep, find, ls, bash",
      "  Prompt:         PLAN MODE: inspect first and summarize",
      "  Status:         ⚠ Thinking will be clamped.",
      "  Status:         ⚠ Hotkey conflict.",
      "  Status:         ⚠ This preset's provider has no API key configured.",
      "  Drift:          ⚠ Dirty — model, tools differ",
      "  Shadowing:      Overridden by project preset",
    ]);
  });

  it("renders the Pi built-in shadow Status row", () => {
    const lines = presetCard(
      { ...basePreset, hotkeyShadowsBuiltin: true },
      identityTheme,
      {
        active: false,
        selected: false,
      },
    ).render(120);

    expect(lines).toContain(
      "  Status:         ⚠ Hotkey shadows a Pi built-in.",
    );
  });

  it("renders distinct Status rows for every warning condition", () => {
    const lines = presetCard(
      {
        ...basePreset,
        clampWarning: true,
        hotkeyConflict: true,
        hotkeyShadowsBuiltin: true,
        unavailable: "no-key",
      },
      identityTheme,
      {
        active: false,
        selected: false,
      },
    ).render(120);

    const statusRows = lines.filter((line) => line.startsWith("  Status:"));

    expect(statusRows).toEqual([
      "  Status:         ⚠ Thinking will be clamped.",
      "  Status:         ⚠ Hotkey conflict.",
      "  Status:         ⚠ Hotkey shadows a Pi built-in.",
      "  Status:         ⚠ This preset's provider has no API key configured.",
    ]);
  });
});
