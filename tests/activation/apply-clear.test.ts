/**
 * Tests apply and clear activation flows.
 *
 * Owns unit coverage for OpenSpec change `add-preset-activation` baseline
 * overlay semantics; it uses local fakes for pi side effects and does NOT
 * exercise the interactive TUI. Future drift-detection tests should add
 * model_select cases separately.
 */
import { apply } from "../../src/activation/apply.js";
import { clear } from "../../src/activation/clear.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset, ThinkingLevel } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { Api, Model, ThinkingLevelMap } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

interface FakeHarness {
  ctx: ExtensionCommandContext;
  messages: unknown[];
  notifications: string[];
  notificationCalls: [string, string | undefined][];
  pi: ExtensionAPI;
  session: ActivePresetSession;
  setModelCalls: string[];
  setToolsCalls: string[][];
  status: Record<string, string | undefined>;
}

const basePreset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

describe("apply", () => {
  it("first activation captures a baseline and applies model/thinking", async () => {
    const harness = makeHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(harness.setToolsCalls).toEqual([]);
    expect(harness.session.current()).toEqual({
      declared: {
        model: "claude",
        provider: "anthropic",
        thinkingLevel: "high",
      },
      dirty: false,
      name: "plan",
      restore: {
        applyCount: 1,
        baseline: {
          model: { id: "old", provider: "anthropic" },
          thinkingLevel: "medium",
          tools: ["bash"],
        },
        kind: "baseline",
        lastApplied: {
          model: { id: "claude", provider: "anthropic" },
          thinkingLevel: "high",
        },
        owned: { model: true, thinkingLevel: true, tools: false },
      },
      scope: "project",
    });
    expect(harness.messages).toHaveLength(1);
  });

  it("applies tools after filtering unknown names with a warning", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read", "missing"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.setToolsCalls).toEqual([["read"]]);
    expect(harness.notificationCalls).toEqual([
      [
        'Preset "plan" references unknown tools: missing. They were ignored.',
        "warning",
      ],
    ]);

    expect(harness.session.current()).toMatchObject({
      restore: {
        lastApplied: { tools: ["read"] },
        owned: { tools: true },
      },
    });
  });

  it("preserves baseline and sticky tools across preset switches", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({
      name: "write",
      restore: {
        applyCount: 2,
        baseline: {
          model: { id: "old", provider: "anthropic" },
          thinkingLevel: "medium",
          tools: ["bash"],
        },
        lastApplied: {
          model: { id: "opus", provider: "anthropic" },
          tools: ["read"],
        },
        owned: { tools: true },
      },
    });
  });

  it("captures a fresh baseline after priorUnknown", async () => {
    const harness = makeHarness();

    harness.session._replaceForTest(
      {
        declared: {
          model: "claude",
          provider: "anthropic",
          thinkingLevel: "high",
        },
        dirty: false,
        name: "plan",
        restore: { kind: "unknown" },
        scope: "project",
      },
      harness.ctx,
    );
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({
      restore: {
        applyCount: 1,
        baseline: {
          model: { id: "old", provider: "anthropic" },
        },
        kind: "baseline",
      },
    });
  });

  it("refuses unavailable presets before changing state", async () => {
    const harness = makeHarness();

    const result = await apply(
      { ...basePreset, unavailable: "no-key" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "no-key",
      ok: false,
      reason:
        'Preset "plan" is unavailable: missing API key. Activation skipped.',
    });
    expect(harness.notifications).toEqual([]);
    expect(harness.setModelCalls).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
  });

  it("returns no-model refusals without notifying", async () => {
    const harness = makeHarness();

    const result = await apply(
      { ...basePreset, unavailable: "no-model" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toMatchObject({ kind: "no-model", ok: false });
    expect(harness.notifications).toEqual([]);
  });

  it("returns unknown-model refusals without notifying", async () => {
    const harness = makeHarness();

    const result = await apply(
      { ...basePreset, model: "missing" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "unknown-model",
      ok: false,
      reason: 'Preset "plan" references unknown model anthropic/missing.',
    });
    expect(harness.notifications).toEqual([]);
  });

  it("returns key-revoked refusals without notifying", async () => {
    const harness = makeHarness(true, { failModel: "claude" });

    const result = await apply(
      basePreset,
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(result).toEqual({
      kind: "key-revoked",
      ok: false,
      reason: "No API key configured for anthropic/claude.",
    });
    expect(harness.notifications).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
  });

  it("short-circuits re-apply when state already matches", async () => {
    const harness = makeHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);
    harness.messages.length = 0;
    harness.setModelCalls.length = 0;
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual([]);
    expect(harness.messages).toEqual([]);
  });

  it("clears stale dirty state on the idempotent re-apply fast path", async () => {
    const harness = makeHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    const active = harness.session.current();

    if (!active) throw new Error("expected active preset");

    harness.session._replaceForTest({ ...active, dirty: true }, harness.ctx);

    harness.messages.length = 0;
    harness.setModelCalls.length = 0;
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual([]);
    expect(harness.messages).toEqual([]);
    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("re-applies the same preset when state drifted while preserving baseline", async () => {
    const harness = makeHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);
    harness.ctx.model = model("openai", "gpt", true);
    harness.setModelCalls.length = 0;
    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(harness.session.current()).toMatchObject({
      restore: {
        applyCount: 2,
        baseline: { model: { id: "old", provider: "anthropic" } },
      },
    });
  });

  it("notifies when thinking is clamped", async () => {
    const harness = makeHarness(false);

    await apply(basePreset, harness.ctx, harness.pi, harness.session);

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(harness.notifications.join("\n")).toContain('Applied "off" instead');
  });

  it("clamps when thinkingLevelMap explicitly nulls the requested level", async () => {
    const harness = makeHarness(true, { thinkingLevelMap: { low: null } });

    await apply(
      { ...basePreset, thinkingLevel: "low" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(harness.notifications.join("\n")).toContain(
      'Preset "plan" requested thinking level "low" for anthropic/claude. Applied "off" instead.',
    );
  });

  it("honors requested levels through high when missing from thinkingLevelMap", async () => {
    const harness = makeHarness(true, { thinkingLevelMap: { xhigh: "max" } });

    await apply(
      { ...basePreset, thinkingLevel: "low" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("low");
    expect(harness.notifications.join("\n")).not.toContain(
      "requested thinking:low",
    );
  });

  it("clamps xhigh unless thinkingLevelMap explicitly maps it", async () => {
    const harness = makeHarness(true);

    await apply(
      { ...basePreset, thinkingLevel: "xhigh" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.pi.getThinkingLevel()).toBe("off");
    expect(harness.notifications.join("\n")).toContain(
      'Preset "plan" requested thinking level "xhigh" for anthropic/claude. Applied "off" instead.',
    );
  });
});

describe("clear", () => {
  it("restores baseline fields after a single activation", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls.at(-1)).toBe("anthropic/old");
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
    expect(harness.session.current()).toBeUndefined();
    expect(harness.notifications.at(-1)).toContain("Preset cleared: plan");
    expect(harness.notifications.at(-1)).toContain(
      "Restored your previous settings.",
    );

    expect(harness.notifications.at(-1)).toContain(
      "Model:          anthropic/old",
    );

    expect(harness.notifications.at(-1)).toContain("Thinking level: medium");

    expect(harness.notifications.at(-1)).toContain("Tools:          bash");
  });

  it("restores to pre-chain baseline for sequential applies", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write", tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls.at(-1)).toBe("anthropic/old");
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
  });

  it("leaves tools unchanged when the overlay never owned tools", async () => {
    const harness = makeHarness();

    await apply(basePreset, harness.ctx, harness.pi, harness.session);
    harness.pi.setActiveTools(["read"]);
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls).toEqual([["read"]]);
    expect(harness.notifications.at(-1)).toContain(
      "Tools:          read (Not managed by cleared preset)",
    );
  });

  it("respects a user model override while restoring other fields", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    harness.ctx.model = model("openai", "gpt", true);
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual(["anthropic/claude"]);
    expect(harness.pi.getThinkingLevel()).toBe("medium");
    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
    expect(harness.notifications.at(-1)).toContain(
      "Model:          openai/gpt (Left as-is — you changed it after activation)",
    );
  });

  it("respects a user tools override", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    harness.pi.setActiveTools(["bash", "read"]);
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls).toEqual([["read"], ["bash", "read"]]);
    expect(harness.notifications.at(-1)).toContain(
      "Tools:          bash, read (Left as-is — you changed it after activation)",
    );
  });

  it("reports model restore failure but still clears active state", async () => {
    const harness = makeHarness(true, { failModel: "old" });

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toBeUndefined();
    expect(harness.notifications.at(-1)).toContain(
      "Model:          Could not switch back to anthropic/old.",
    );
    expect(harness.pi.getThinkingLevel()).toBe("medium");
  });

  it("filters unavailable baseline tools on restore", async () => {
    const harness = makeHarness(true, { allTools: ["read"] });

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls.at(-1)).toEqual([]);
    expect(harness.notifications.at(-1)).toContain(
      "Tools:          none (Unavailable: bash)",
    );
  });

  it("restores tools changed only by the first preset in a chain", async () => {
    const harness = makeHarness();

    await apply(
      { ...basePreset, tools: ["read"] },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    await apply(
      { ...basePreset, model: "opus", name: "write" },
      harness.ctx,
      harness.pi,
      harness.session,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setToolsCalls.at(-1)).toEqual(["bash"]);
  });

  it("soft-clears priorUnknown attachments without mutating pi fields", async () => {
    const harness = makeHarness();

    harness.session._replaceForTest(
      {
        declared: {
          model: "claude",
          provider: "anthropic",
          thinkingLevel: "high",
        },
        dirty: false,
        name: "plan",
        restore: { kind: "unknown" },
        scope: "project",
      },
      harness.ctx,
    );
    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.setModelCalls).toEqual([]);
    expect(harness.setToolsCalls).toEqual([]);
    expect(harness.session.current()).toBeUndefined();
    expect(harness.notifications.at(-1)).toContain(
      "Model:          anthropic/old (No baseline saved for this field)",
    );
  });

  it("notifies when no preset is active", async () => {
    const harness = makeHarness();

    await clear(harness.ctx, harness.pi, harness.session);

    expect(harness.notifications).toEqual(["No preset is active."]);
  });
});

function makeHarness(
  reasoning = true,
  options: {
    allTools?: string[];
    failModel?: string;
    thinkingLevelMap?: ThinkingLevelMap;
  } = {},
): FakeHarness {
  let thinkingLevel: ThinkingLevel = "medium";
  let tools = ["bash"];
  const notifications: string[] = [];
  const notificationCalls: [string, string | undefined][] = [];
  const messages: unknown[] = [];
  const setModelCalls: string[] = [];
  const setToolsCalls: string[][] = [];
  const status: Record<string, string | undefined> = {};
  const ctx = {
    cwd: process.cwd(),
    model: model("anthropic", "old", true),
    modelRegistry: makeStubModelRegistry({
      models: {
        anthropic: {
          claude: {
            hasKey: true,
            reasoning,
            ...(options.thinkingLevelMap === undefined
              ? {}
              : { thinkingLevelMap: options.thinkingLevelMap }),
          },
          old: { hasKey: true, reasoning: true },
          opus: { hasKey: true, reasoning: true },
        },
        openai: { gpt: { hasKey: true, reasoning: true } },
      },
    }),
    ui: {
      notify(message: string, severity?: string) {
        notifications.push(message);
        notificationCalls.push([message, severity]);
      },
      setStatus(key: string, value: string | undefined) {
        status[key] = value;
      },
      theme: { fg: (_color: string, text: string) => text },
    },
  } as ExtensionCommandContext;
  const session = new ActivePresetSession();
  const pi = {
    appendEntry() {},
    getActiveTools: () => tools,
    getAllTools: () =>
      (options.allTools ?? ["bash", "read"]).map((name) => ({ name })),
    getThinkingLevel: () => thinkingLevel,
    sendMessage(message: unknown) {
      messages.push(message);
    },
    setActiveTools(nextTools: string[]) {
      tools = nextTools;
      setToolsCalls.push(nextTools);
    },
    setModel(nextModel: Model<Api>) {
      setModelCalls.push(`${nextModel.provider}/${nextModel.id}`);

      if (nextModel.id === options.failModel) return Promise.resolve(false);

      ctx.model = nextModel;

      return Promise.resolve(true);
    },
    setThinkingLevel(nextLevel: ThinkingLevel) {
      thinkingLevel = nextLevel;
    },
  } as unknown as ExtensionAPI;

  return {
    ctx,
    messages,
    notificationCalls,
    notifications,
    pi,
    session,
    setModelCalls,
    setToolsCalls,
    status,
  };
}

function model(provider: string, id: string, reasoning: boolean): Model<Api> {
  return { id, provider, reasoning } as Model<Api>;
}
