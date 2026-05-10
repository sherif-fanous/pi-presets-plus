/**
 * Pure-function tests for the clear decision table.
 *
 * Covers the per-field decision matrix without driving `pi` or `ctx.ui`.
 * The integration runner is exercised separately in `apply-clear.test.ts`.
 */
import { decideClear, type ClearSnapshot } from "../../src/activation/clear.js";
import type { ActivePresetState } from "../../src/types.js";
import { describe, expect, it } from "vitest";

const declaredSnapshot = {
  model: "claude",
  provider: "anthropic",
  thinkingLevel: "high" as const,
};

const baselineActive: ActivePresetState = {
  declared: declaredSnapshot,
  dirty: false,
  name: "plan",
  scope: "project",
  restore: {
    applyCount: 1,
    baseline: {
      model: { provider: "anthropic", id: "old" },
      thinkingLevel: "medium",
      tools: ["bash"],
    },
    kind: "baseline",
    lastApplied: {
      model: { provider: "anthropic", id: "claude" },
      thinkingLevel: "high",
      tools: ["read"],
    },
    owned: { model: true, thinkingLevel: true, tools: true },
  },
};

const priorUnknownActive: ActivePresetState = {
  declared: declaredSnapshot,
  dirty: false,
  name: "plan",
  restore: { kind: "unknown" },
  scope: "project",
};

function snapshot(overrides: Partial<ClearSnapshot> = {}): ClearSnapshot {
  return {
    active: baselineActive,
    allTools: ["bash", "read"],
    currentModel: { provider: "anthropic", id: "claude" },
    currentThinking: "high",
    currentTools: ["read"],
    ...overrides,
  };
}

describe("decideClear", () => {
  it("restores baseline for fully extension-owned state", () => {
    const decision = decideClear(snapshot());

    expect(decision.writes).toEqual({
      model: { provider: "anthropic", id: "old" },
      thinkingLevel: "medium",
      tools: ["bash"],
    });

    expect(decision.parts.map((part) => [part.field, part.action])).toEqual([
      ["model", "restored"],
      ["thinking", "restored"],
      ["tools", "restored"],
    ]);
  });

  it("treats user model override as left-unchanged", () => {
    const decision = decideClear(
      snapshot({ currentModel: { provider: "openai", id: "gpt" } }),
    );

    expect(decision.writes.model).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "model")?.action).toBe(
      "user-override",
    );
  });

  it("treats user thinking override as left-unchanged", () => {
    const decision = decideClear(snapshot({ currentThinking: "low" }));

    expect(decision.writes.thinkingLevel).toBeUndefined();
    expect(
      decision.parts.find((part) => part.field === "thinking")?.action,
    ).toBe("user-override");
  });

  it("treats user tools override as left-unchanged", () => {
    const decision = decideClear(snapshot({ currentTools: ["bash", "read"] }));

    expect(decision.writes.tools).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "tools")?.action).toBe(
      "user-override",
    );
  });

  it("marks already-baseline fields without queuing writes", () => {
    const decision = decideClear(
      snapshot({
        currentModel: { provider: "anthropic", id: "old" },
        currentThinking: "medium",
        currentTools: ["bash"],
      }),
    );

    expect(decision.writes).toEqual({});
    expect(
      decision.parts.every((part) => part.action === "already-baseline"),
    ).toBe(true);
  });

  it("leaves tools alone when the overlay never owned them", () => {
    const active: ActivePresetState = {
      declared: declaredSnapshot,
      dirty: false,
      name: "plan",
      scope: "project",
      restore: {
        applyCount: 1,
        baseline: {
          model: { provider: "anthropic", id: "old" },
          thinkingLevel: "medium",
          tools: ["bash"],
        },
        kind: "baseline",
        lastApplied: {
          model: { provider: "anthropic", id: "claude" },
          thinkingLevel: "high",
        },
        owned: { model: true, thinkingLevel: true, tools: false },
      },
    };
    const decision = decideClear(snapshot({ active, currentTools: ["foo"] }));

    expect(decision.writes.tools).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "tools")?.action).toBe(
      "not-owned",
    );
  });

  it("filters unavailable baseline tools and emits restored-partial", () => {
    const decision = decideClear(snapshot({ allTools: ["read"] }));

    expect(decision.writes.tools).toEqual([]);

    const toolsPart = decision.parts.find((part) => part.field === "tools");

    expect(toolsPart?.action).toBe("restored-partial");
    expect(toolsPart?.dropped).toEqual(["bash"]);
  });

  it("returns baseline-null when current matches lastApplied but baseline.model is null", () => {
    const active: ActivePresetState = {
      ...baselineActive,
      restore: {
        applyCount: 1,
        baseline: { model: null, thinkingLevel: "medium", tools: ["bash"] },
        kind: "baseline",
        lastApplied: {
          model: { provider: "anthropic", id: "claude" },
          thinkingLevel: "high",
          tools: ["read"],
        },
        owned: { model: true, thinkingLevel: true, tools: true },
      },
    };
    const decision = decideClear(snapshot({ active }));

    expect(decision.writes.model).toBeUndefined();
    expect(decision.parts.find((part) => part.field === "model")?.action).toBe(
      "baseline-null",
    );
  });

  it("emits all-unknown parts and no writes for priorUnknown", () => {
    const decision = decideClear(snapshot({ active: priorUnknownActive }));

    expect(decision.writes).toEqual({});
    expect(decision.parts.every((part) => part.action === "unknown")).toBe(
      true,
    );
  });
});
