/**
 * Tests for pure preset-picker filtering helpers.
 *
 * Cover the literal-first ranking and scope-filter contracts from OpenSpec
 * change `add-preset-picker`. Picker state machine, activation, and TUI
 * rendering are tested elsewhere (or manually smoked) so failures here
 * point only at filter semantics.
 */
import type { LoadedPreset } from "../../src/types.js";
import { applyScopeFilter, rankPresets } from "../../src/ui/filter.js";
import { describe, expect, it } from "vitest";

function makePreset(
  name: string,
  provider: string,
  model: string,
): LoadedPreset {
  return {
    model,
    name,
    provider,
    scope: "user",
  };
}

function makeScopedPreset(
  name: string,
  scope: "user" | "project",
  shadowed = false,
): LoadedPreset {
  return {
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope,
    ...(shadowed ? { shadowed } : {}),
  };
}

function names(presets: readonly LoadedPreset[]): string[] {
  return presets.map((preset) => preset.name);
}

function scopedNames(presets: readonly LoadedPreset[]): string[] {
  return presets.map((preset) => `${preset.scope}:${preset.name}`);
}

describe("rankPresets", () => {
  it("returns input order unchanged for an empty query", () => {
    const presets = [
      makePreset("plan", "anthropic", "claude-opus-4.5"),
      makePreset("ship", "openai", "gpt-5"),
    ];

    expect(rankPresets(presets, "")).toEqual(presets);
  });

  it("puts literal substring matches before subsequence-only matches", () => {
    const presets = [
      makePreset("subsequence", "openrouter", "sonnet"),
      makePreset("literal", "anthropic", "claude-opus-4.5"),
    ];

    expect(names(rankPresets(presets, "opus"))).toEqual([
      "literal",
      "subsequence",
    ]);
  });

  it("reproduces the opus provider-list case with literal matches first", () => {
    const presets = [
      makePreset("openrouter-sonnet", "openrouter", "claude-sonnet-4-5"),
      makePreset("anthropic-opus", "anthropic", "claude-opus-4.5"),
      makePreset("openrouter-opus", "openrouter", "anthropic/claude-opus-4"),
      makePreset("openai", "openai", "gpt-5.2-codex"),
    ];

    expect(names(rankPresets(presets, "opus"))).toEqual([
      "anthropic-opus",
      "openrouter-opus",
      "openrouter-sonnet",
    ]);
  });

  it("matches case-insensitively", () => {
    const presets = [makePreset("Plan", "Anthropic", "Claude-Opus-4.5")];

    expect(names(rankPresets(presets, "opus"))).toEqual(["Plan"]);
    expect(names(rankPresets(presets, "PLAN"))).toEqual(["Plan"]);
  });

  it("returns an empty array when nothing matches", () => {
    const presets = [makePreset("plan", "anthropic", "claude-opus-4.5")];

    expect(rankPresets(presets, "zzzz")).toEqual([]);
  });
});

describe("applyScopeFilter", () => {
  it("shows every loaded preset in all scope", () => {
    const presets = [
      makeScopedPreset("plan", "user", true),
      makeScopedPreset("review", "user"),
      makeScopedPreset("plan", "project"),
    ];

    expect(scopedNames(applyScopeFilter(presets, "all"))).toEqual([
      "user:plan",
      "user:review",
      "project:plan",
    ]);
  });

  it("shows user presets, including shadowed globals, in user scope", () => {
    const presets = [
      makeScopedPreset("plan", "user", true),
      makeScopedPreset("review", "user"),
      makeScopedPreset("plan", "project"),
    ];

    expect(scopedNames(applyScopeFilter(presets, "user"))).toEqual([
      "user:plan",
      "user:review",
    ]);
  });

  it("shows only project presets in project scope", () => {
    const presets = [
      makeScopedPreset("plan", "user", true),
      makeScopedPreset("review", "user"),
      makeScopedPreset("plan", "project"),
    ];

    expect(scopedNames(applyScopeFilter(presets, "project"))).toEqual([
      "project:plan",
    ]);
  });
});
