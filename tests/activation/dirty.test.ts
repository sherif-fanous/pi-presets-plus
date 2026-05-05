/**
 * Tests for active-preset dirty flag transitions.
 *
 * Owns coverage for preserving active-state variants while flipping dirty;
 * it does NOT test drift detection decisions.
 */
import {
  clearActive,
  getActive,
  setActive,
} from "../../src/activation/active-state.js";
import { markClean, markDirty } from "../../src/activation/dirty.js";
import type { ActivePresetState } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";

const status: Record<string, string | undefined> = {};

const ctx = {
  cwd: "/tmp/pi-presets-plus-dirty-test",
  modelRegistry: makeStubModelRegistry({ models: {} }),
  ui: {
    setStatus(key: string, value: string | undefined) {
      status[key] = value;
    },
    theme: { fg: (_color: string, text: string) => text },
  },
} as unknown as Pick<ExtensionContext, "cwd" | "modelRegistry" | "ui">;

const baselineActive: ActivePresetState = {
  declared: {
    model: "claude",
    provider: "anthropic",
    thinkingLevel: "high",
  },
  dirty: false,
  name: "plan",
  restore: {
    applyCount: 1,
    baseline: { model: null, thinkingLevel: "off", tools: [] },
    kind: "baseline",
    lastApplied: {
      model: { id: "claude", provider: "anthropic" },
      thinkingLevel: "off",
    },
    owned: { model: true, thinkingLevel: true, tools: false },
  },
  scope: "project",
};

beforeEach(() => {
  clearActive();
  for (const key of Object.keys(status)) delete status[key];
});

describe("dirty helpers", () => {
  it("no-ops when no preset is active", async () => {
    await markDirty(ctx);
    await markClean(ctx);

    expect(getActive()).toBeUndefined();
  });

  it("marks baseline state dirty while preserving restore", async () => {
    setActive(baselineActive);
    await markDirty(ctx);

    expect(getActive()).toEqual({ ...baselineActive, dirty: true });
    // Spell out the structurally important fields so a future regression
    // that drops one of them via `...spread` would be caught here.
    expect(getActive()?.restore.kind).toBe("baseline");

    if (getActive()?.restore.kind === "baseline") {
      const restore = getActive()?.restore;

      if (restore?.kind !== "baseline") throw new Error("expected baseline");
      expect(restore.applyCount).toBe(1);
      expect(restore.lastApplied.model).toEqual({
        id: "claude",
        provider: "anthropic",
      });

      expect(restore.owned).toEqual({
        model: true,
        thinkingLevel: true,
        tools: false,
      });
    }
  });

  it("marks unknown state clean while preserving restore", async () => {
    setActive({
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: true,
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    });
    await markClean(ctx);

    expect(getActive()).toEqual({
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: false,
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    });
  });

  it("no-ops when already in the target state", async () => {
    setActive(baselineActive);
    await markClean(ctx);

    expect(getActive()).toEqual(baselineActive);
  });

  it("refreshes the status badge from the cached declared snapshot (no disk read)", async () => {
    setActive(baselineActive);
    await markDirty(ctx);

    expect(status["presets-plus"]).toBe("preset: plan!");

    await markClean(ctx);

    expect(status["presets-plus"]).toBe("preset: plan");
  });
});
