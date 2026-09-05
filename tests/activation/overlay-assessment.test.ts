/**
 * Tests canonical active-preset overlay classification.
 *
 * Owns current, baseline, last-applied, and ownership comparisons; it does NOT
 * test restoration writes, status text, or session mutation.
 */
import { assessOverlay } from "../../src/activation/overlay-assessment.js";
import type { ActivePresetState } from "../../src/types.js";
import { describe, expect, it } from "vitest";

const active: ActivePresetState = {
  declared: {
    model: "claude",
    provider: "anthropic",
    thinkingLevel: "high",
    tools: ["read", "bash"],
  },
  dirty: false,
  name: "plan",
  restore: {
    applyCount: 1,
    baseline: {
      model: { id: "old", provider: "anthropic" },
      thinkingLevel: "medium",
      tools: ["grep"],
    },
    kind: "baseline",
    lastApplied: {
      model: { id: "claude", provider: "anthropic" },
      thinkingLevel: "high",
      tools: ["read", "bash"],
    },
    owned: { model: true, thinkingLevel: true, tools: true },
  },
  scope: "project",
};

const current = {
  model: { id: "claude", provider: "anthropic" },
  thinkingLevel: "high" as const,
  tools: ["read", "bash"],
};

describe("assessOverlay", () => {
  it("classifies values already at baseline", () => {
    expect(
      assessOverlay(active, {
        model: { id: "old", provider: "anthropic" },
        thinkingLevel: "medium",
        tools: ["grep"],
      }),
    ).toEqual({
      kind: "baseline",
      restore: active.restore,
      model: "already-baseline",
      thinking: "already-baseline",
      tools: "already-baseline",
    });
  });

  it("classifies values that match the last applied values", () => {
    expect(assessOverlay(active, current)).toEqual({
      kind: "baseline",
      restore: active.restore,
      model: "matches-last-applied",
      thinking: "matches-last-applied",
      tools: "matches-last-applied",
    });
  });

  it("classifies user overrides", () => {
    expect(
      assessOverlay(active, {
        model: { id: "gpt", provider: "openai" },
        thinkingLevel: "low",
        tools: ["write"],
      }),
    ).toEqual({
      kind: "baseline",
      restore: active.restore,
      model: "user-override",
      thinking: "user-override",
      tools: "user-override",
    });
  });

  it("reports tools as not owned when the preset did not set them", () => {
    const restore = active.restore;

    if (restore.kind !== "baseline") throw new Error("Expected a baseline.");

    expect(
      assessOverlay(
        {
          ...active,
          restore: { ...restore, owned: { ...restore.owned, tools: false } },
        },
        current,
      ),
    ).toMatchObject({ kind: "baseline", tools: "not-owned" });
  });

  it("ignores tool order and duplicate multiplicity", () => {
    expect(
      assessOverlay(active, {
        ...current,
        tools: ["bash", "read", "read"],
      }),
    ).toMatchObject({ kind: "baseline", tools: "matches-last-applied" });
  });

  it("reports unknown when no baseline was restored", () => {
    expect(
      assessOverlay({ ...active, restore: { kind: "unknown" } }, current),
    ).toEqual({ kind: "unknown" });
  });
});
