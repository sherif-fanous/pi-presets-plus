/**
 * Pure-function tests for the clear decision table and summary renderer.
 *
 * Covers the per-field decision matrix and the rendered notification text
 * without driving `pi` or `ctx.ui`. The integration runner is exercised
 * separately in `apply-clear.test.ts`; these tests are the canonical
 * coverage for AGENTS.md's "tests assert on the formatter's return value"
 * convention.
 */
import {
  chooseClearLead,
  decideClear,
  renderClearSummary,
  type ClearPart,
  type ClearSnapshot,
} from "../../src/activation/clear.js";
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

describe("renderClearSummary", () => {
  it("renders the all-restored case with the happy-path lead and bare values", () => {
    const parts: ClearPart[] = [
      { action: "restored", field: "model", value: "anthropic/old" },
      { action: "restored", field: "thinking", value: "medium" },
      { action: "restored", field: "tools", value: "bash" },
    ];

    const out = renderClearSummary("plan", parts);

    expect(out).toContain("preset cleared: plan");
    expect(out).toContain("restored your previous settings.");
    expect(out).not.toContain("  preset:");
    expect(out).toContain("model:          anthropic/old");
    expect(out).toContain("thinking level: medium");
    expect(out).toContain("tools:          bash");
  });

  it("uses the mixed lead and per-row annotations when some fields were kept", () => {
    const out = renderClearSummary("plan", [
      { action: "user-override", field: "model", value: "openai/gpt" },
      { action: "restored", field: "thinking", value: "medium" },
      { action: "not-owned", field: "tools", value: "foo" },
    ]);

    expect(out).toContain(
      "restored some settings. kept your manual changes for others.",
    );

    expect(out).toContain(
      "model:          openai/gpt (user manually overrode preset value)",
    );
    expect(out).toContain("thinking level: medium");
    expect(out).toContain(
      "tools:          foo (not managed by cleared preset)",
    );
  });

  it("uses the priorUnknown lead and a 'no baseline saved' suffix per row", () => {
    const out = renderClearSummary("plan", [
      { action: "unknown", field: "model", value: "anthropic/claude" },
      { action: "unknown", field: "thinking", value: "high" },
      { action: "unknown", field: "tools", value: "read" },
    ]);

    expect(out).toContain(
      "no saved baseline. current settings were left as-is.",
    );

    expect(out).toContain(
      "model:          anthropic/claude (no baseline saved for this field)",
    );

    expect(out).toContain(
      "thinking level: high (no baseline saved for this field)",
    );

    expect(out).toContain(
      "tools:          read (no baseline saved for this field)",
    );
  });

  it("includes dropped tool names in restored-partial rows and adjusts the lead", () => {
    const out = renderClearSummary("plan", [
      { action: "already-baseline", field: "model", value: "anthropic/old" },
      { action: "already-baseline", field: "thinking", value: "medium" },
      {
        action: "restored-partial",
        dropped: ["bash"],
        field: "tools",
        value: "none",
      },
    ]);

    expect(out).toContain(
      "restored your previous settings. some tools are no longer available.",
    );
    expect(out).toContain("tools:          none (unavailable: bash)");
  });

  it("renders restore-failed with the failure lead and the unreachable target", () => {
    const out = renderClearSummary("plan", [
      {
        action: "restore-failed",
        field: "model",
        value: "anthropic/old",
      },
      { action: "already-baseline", field: "thinking", value: "medium" },
      { action: "not-owned", field: "tools", value: "foo" },
    ]);

    expect(out).toContain(
      "tried to restore your previous settings but ran into a problem.",
    );

    expect(out).toContain(
      "model:          could not switch back to anthropic/old",
    );
  });

  it("uses the all-already-baseline lead when nothing needed restoring", () => {
    const out = renderClearSummary("plan", [
      { action: "already-baseline", field: "model", value: "anthropic/old" },
      { action: "already-baseline", field: "thinking", value: "medium" },
      { action: "already-baseline", field: "tools", value: "bash" },
    ]);

    expect(out).toContain("your settings already matched the saved baseline.");
    expect(out).toContain("model:          anthropic/old");
  });

  it("uses the kept-everything lead when no field was eligible for restore", () => {
    const out = renderClearSummary("plan", [
      { action: "user-override", field: "model", value: "openai/gpt" },
      { action: "user-override", field: "thinking", value: "low" },
      { action: "not-owned", field: "tools", value: "foo" },
    ]);

    expect(out).toContain("kept all your manual changes. nothing to restore.");
  });
});

describe("chooseClearLead", () => {
  const part = (
    action: ClearPart["action"],
    field: ClearPart["field"] = "model",
    value = "x",
  ): ClearPart => ({ action, field, value });

  it("returns the priorUnknown lead when every field is unknown", () => {
    expect(
      chooseClearLead([
        part("unknown", "model"),
        part("unknown", "thinking"),
        part("unknown", "tools"),
      ]),
    ).toBe("no saved baseline. current settings were left as-is.");
  });

  it("returns the failure lead whenever any field failed to restore", () => {
    expect(
      chooseClearLead([
        part("restore-failed", "model"),
        part("restored", "thinking"),
        part("already-baseline", "tools"),
      ]),
    ).toBe("tried to restore your previous settings but ran into a problem.");
  });

  it("returns the all-already-baseline lead when nothing changed", () => {
    expect(
      chooseClearLead([
        part("already-baseline", "model"),
        part("already-baseline", "thinking"),
        part("already-baseline", "tools"),
      ]),
    ).toBe("your settings already matched the saved baseline.");
  });

  it("returns the happy-path lead when every field is restore-like", () => {
    expect(
      chooseClearLead([
        part("restored", "model"),
        part("already-baseline", "thinking"),
        part("restored", "tools"),
      ]),
    ).toBe("restored your previous settings.");
  });

  it("surfaces unavailable-tools in the lead when restore-like with restored-partial", () => {
    expect(
      chooseClearLead([
        part("restored", "model"),
        part("restored", "thinking"),
        part("restored-partial", "tools"),
      ]),
    ).toBe(
      "restored your previous settings. some tools are no longer available.",
    );
  });

  it("returns the kept-everything lead when no field is restore-like", () => {
    expect(
      chooseClearLead([
        part("user-override", "model"),
        part("baseline-null", "thinking"),
        part("not-owned", "tools"),
      ]),
    ).toBe("kept all your manual changes. nothing to restore.");
  });

  it("returns the mixed lead when restore-like and kept-like fields coexist", () => {
    expect(
      chooseClearLead([
        part("user-override", "model"),
        part("restored", "thinking"),
        part("not-owned", "tools"),
      ]),
    ).toBe("restored some settings. kept your manual changes for others.");
  });
});
