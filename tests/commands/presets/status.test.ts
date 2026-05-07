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
import {
  formatStatus,
  runStatus,
} from "../../../src/commands/presets/status.js";
import type { ActivePresetState, LoadedPreset } from "../../../src/types.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.hoisted(() => vi.fn());

vi.mock("../../../src/store/api.js", () => ({ loadAll }));

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
  loadAll.mockReset();
});

describe("runStatus", () => {
  it("delivers the no-active prompt diagnostic via ctx.ui.notify", async () => {
    const notifications: Array<[string, string]> = [];
    const ctx = {
      ui: {
        notify: (message: string, severity: string) => {
          notifications.push([message, severity]);
        },
        theme: {
          bold: (text: string) => text,
          fg: (_color: string, text: string) => text,
        },
      },
    };

    await runStatus(ctx as never, pi("medium", []) as never);

    expect(notifications).toEqual([["No preset is active.", "info"]]);
  });

  it("delivers the active-preset diagnostic via ctx.ui.notify", async () => {
    const active: ActivePresetState = {
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: false,
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    };
    const notifications: Array<[string, string]> = [];
    const ctx = {
      model: model("anthropic", "claude"),
      ui: {
        notify: (message: string, severity: string) => {
          notifications.push([message, severity]);
        },
        theme: {
          bold: (text: string) => text,
          fg: (_color: string, text: string) => text,
        },
      },
    };

    setActive(active);
    loadAll.mockResolvedValue({ presets: [preset], warnings: [] });

    await runStatus(ctx as never, pi("high", ["read"]) as never);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.[0]).toContain("Preset Status");
    expect(notifications[0]?.[0]).toContain("Preset:                  plan");
    expect(notifications[0]?.[1]).toBe("info");
  });
});

describe("formatStatus", () => {
  it("renders the baseline-managed attachment with per-field classifications", () => {
    const active: ActivePresetState = {
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: false,
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

    expect(out).toContain("Preset Status");
    expect(out).toContain("Preset:                  plan");
    expect(out).toContain("Scope:                   project");
    expect(out).not.toContain("restore:");
    expect(out).toContain("Baseline model:          anthropic/old");
    expect(out).toContain("Baseline thinking level: medium");
    expect(out).toContain("Baseline tools:          bash");
    expect(out).toContain("Preset model:            anthropic/claude");
    expect(out).toContain("Preset thinking level:   high");
    expect(out).toContain("Preset tools:            read");

    expect(out).toContain(
      "Current model:           anthropic/claude (Managed by active preset)",
    );

    expect(out).toContain(
      "Current thinking level:  high (Managed by active preset)",
    );

    expect(out).toContain(
      "Current tools:           read (Managed by active preset)",
    );

    expect(out).not.toContain("tools managed:");
  });

  it("flags user overrides", () => {
    const active: ActivePresetState = {
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
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

    setActive(active);

    const out = formatStatus(
      active,
      preset,
      { model: model("openai", "gpt") },
      pi("low", ["foo"]),
    );

    expect(out).toContain(
      "Current model:           openai/gpt (Left as-is — you changed it after activation)",
    );

    expect(out).toContain(
      "Current thinking level:  low (Left as-is — you changed it after activation)",
    );

    expect(out).toContain(
      "Current tools:           foo (Not managed by active preset)",
    );

    expect(out).not.toContain("tools managed:");
  });

  it("renders priorUnknown without baseline rows", () => {
    const active: ActivePresetState = {
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: false,
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
      "Restore:                 No saved baseline. Clear will only turn the preset off.",
    );
    expect(out).not.toContain("Baseline model");
    expect(out).not.toContain("Preset model:");
    expect(out).toContain("Current model:           anthropic/claude");
  });
});
