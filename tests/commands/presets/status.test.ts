/**
 * Pure-formatter tests for `runStatus` output.
 *
 * Asserts on `formatStatus` directly so the rendering rules for baseline,
 * priorUnknown, and per-field classification stay covered without going
 * through `ctx.ui.notify`. The runner wrapper is only a notification +
 * lookup edge over this formatter; its branches (no-active, missing
 * preset) are exercised in the apply-clear integration tests.
 */
import {
  clearActive,
  setActive,
} from "../../../src/activation/active-state.js";
import { formatStatus } from "../../../src/commands/presets/status.js";
import type { ActivePresetState, LoadedPreset } from "../../../src/types.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";

const preset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

function model(provider: string, id: string): Model<Api> {
  return { id, provider, reasoning: true } as Model<Api>;
}

function pi(thinkingLevel: string, tools: string[]) {
  return {
    getActiveTools: () => tools,
    getThinkingLevel: () => thinkingLevel as never,
  };
}

afterEach(() => {
  clearActive();
});

describe("formatStatus", () => {
  it("renders the baseline-managed attachment with per-field classifications", () => {
    const active: ActivePresetState = {
      name: "plan",
      scope: "project",
      restore: {
        applyCount: 2,
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

    setActive(active);

    const out = formatStatus(
      active,
      preset,
      { model: model("anthropic", "claude") },
      pi("high", ["read"]),
    );

    expect(out).toContain("preset status");
    expect(out).toContain("preset:                  plan");
    expect(out).toContain("scope:                   project");
    expect(out).not.toContain("restore:");
    expect(out).toContain("baseline model:          anthropic/old");
    expect(out).toContain("baseline thinking level: medium");
    expect(out).toContain("baseline tools:          bash");
    expect(out).toContain("preset model:            anthropic/claude");
    expect(out).toContain("preset thinking level:   high");
    expect(out).toContain("preset tools:            read");

    expect(out).toContain(
      "current model:           anthropic/claude (managed by active preset)",
    );

    expect(out).toContain(
      "current thinking level:  high (managed by active preset)",
    );

    expect(out).toContain(
      "current tools:           read (managed by active preset)",
    );

    expect(out).not.toContain("tools managed:");
  });

  it("flags user overrides", () => {
    const active: ActivePresetState = {
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

    setActive(active);

    const out = formatStatus(
      active,
      preset,
      { model: model("openai", "gpt") },
      pi("low", ["foo"]),
    );

    expect(out).toContain(
      "current model:           openai/gpt (user manually overrode preset value)",
    );

    expect(out).toContain(
      "current thinking level:  low (user manually overrode preset value)",
    );

    expect(out).toContain(
      "current tools:           foo (not managed by active preset)",
    );

    expect(out).not.toContain("tools managed:");
  });

  it("renders priorUnknown without baseline rows", () => {
    const active: ActivePresetState = {
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    };

    setActive(active);

    const out = formatStatus(
      active,
      preset,
      { model: model("anthropic", "claude") },
      pi("high", ["read"]),
    );

    expect(out).toContain(
      "restore:                 no saved baseline. clear will only turn the preset off",
    );
    expect(out).not.toContain("baseline model");
    expect(out).not.toContain("preset model:");
    expect(out).toContain("current model:           anthropic/claude");
  });
});
