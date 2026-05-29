/**
 * Tests for active-preset session attachment state transitions.
 *
 * Owns coverage for preserving active-state variants while flipping dirty,
 * persisting active markers, and restoring from session branches; it does NOT
 * test drift detection decisions.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { ActivePresetState, LoadedPreset } from "../../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

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

const loadedPreset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

function harness() {
  const entries: unknown[] = [];
  const status: Record<string, string | undefined> = {};
  const ctx = {
    ui: {
      setStatus(key: string, value: string | undefined) {
        status[key] = value;
      },
      theme: {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
      },
    },
  } as Pick<ExtensionContext, "ui">;
  const pi = {
    appendEntry(type: string, data: unknown) {
      entries.push({ data, type });
    },
  };

  return { ctx, entries, pi, session: new ActivePresetSession(), status };
}

describe("ActivePresetSession", () => {
  it("no-ops dirty transitions when no preset is active", () => {
    const { ctx, session } = harness();

    session.markDirty(ctx);
    session.markClean(ctx);

    expect(session.current()).toBeUndefined();
  });

  it("starts and clears active state with persisted markers", () => {
    const { ctx, entries, pi, session, status } = harness();

    session.start(
      {
        applyCount: 1,
        baseline: { model: null, thinkingLevel: "off", tools: [] },
        lastApplied: {
          model: { id: "claude", provider: "anthropic" },
          thinkingLevel: "high",
        },
        owned: { model: true, thinkingLevel: true, tools: false },
        preset: loadedPreset,
      },
      ctx,
      pi,
    );

    expect(session.current()).toMatchObject({ dirty: false, name: "plan" });
    expect(entries).toContainEqual({
      data: { name: "plan", scope: "project" },
      type: "presets-plus:active",
    });
    expect(status["presets-plus"]).toBe("Preset: plan");

    session.clear(ctx, pi);

    expect(session.current()).toBeUndefined();
    expect(entries).toContainEqual({
      data: { name: null },
      type: "presets-plus:active",
    });
    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("marks baseline state dirty while preserving restore", () => {
    const { ctx, session } = harness();

    session.attach(baselineActive, ctx);
    session.markDirty(ctx);

    expect(session.current()).toEqual({ ...baselineActive, dirty: true });
    expect(session.current()?.restore.kind).toBe("baseline");
  });

  it("marks unknown state clean while preserving restore", () => {
    const { ctx, session } = harness();

    session.attach(
      {
        declared: {
          model: "claude",
          provider: "anthropic",
          thinkingLevel: "high",
        },
        dirty: true,
        name: "plan",
        restore: { kind: "unknown" },
        scope: "project",
      },
      ctx,
    );
    session.markClean(ctx);

    expect(session.current()).toEqual({
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

  it("restores active state from a branch", () => {
    const { ctx, session } = harness();
    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "plan", scope: "project" },
        type: "custom",
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;

    const result = session.restoreFromBranch(branch, [loadedPreset], ctx);

    expect(result.warnings).toEqual([]);
    expect(result.state).toMatchObject({ name: "plan", scope: "project" });
    expect(session.current()).toEqual(result.state);
  });

  it("refreshes the status badge after a successful restore", () => {
    // Critical regression guard: the session_start handler relies on
    // restoreFromBranch (and its no-op companion paths) to update the
    // status badge so the footer reflects the restored preset name on
    // every fresh session, not only after a user-driven action.
    const { ctx, session, status } = harness();
    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "plan", scope: "project" },
        type: "custom",
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;

    session.restoreFromBranch(branch, [loadedPreset], ctx);

    expect(status["presets-plus"]).toBe("Preset: plan");
  });

  it("refreshes the status badge to none when restore finds no entry", () => {
    const { ctx, session, status } = harness();
    const branch = [] as ReturnType<
      ExtensionContext["sessionManager"]["getBranch"]
    >;

    session.restoreFromBranch(branch, [loadedPreset], ctx);

    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("refreshes the status badge to none when restored preset is missing", () => {
    const { ctx, session, status } = harness();
    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "missing", scope: "project" },
        type: "custom",
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;

    session.restoreFromBranch(branch, [loadedPreset], ctx);

    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("warns when restored preset is not loaded", () => {
    const { ctx, session } = harness();
    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "missing", scope: "project" },
        type: "custom",
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;

    const result = session.restoreFromBranch(branch, [loadedPreset], ctx);

    expect(result.state).toBeUndefined();
    expect(result.warnings).toEqual([
      'Restored session referenced preset "missing" which is not loaded. Not attaching.',
    ]);
  });

  it("warns when restored preset is unavailable", () => {
    const { ctx, session } = harness();
    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "plan", scope: "project" },
        type: "custom",
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;

    const result = session.restoreFromBranch(
      branch,
      [{ ...loadedPreset, unavailable: "no-key" }],
      ctx,
    );

    expect(result.state).toBeUndefined();
    expect(result.warnings).toEqual([
      'Restored session referenced preset "plan" which is unavailable (no-key). Not attaching.',
    ]);
  });
});
