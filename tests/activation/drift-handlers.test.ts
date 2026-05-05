/**
 * Tests event-handler logic for preset drift tracking.
 *
 * Owns coverage for model/thinking/tool drift event decisions and for the
 * in-memory contract that the handlers never read the on-disk preset
 * files. It does NOT test Pi's event registration surface or terminal
 * rendering.
 */
import {
  clearActive,
  getActive,
  setActive,
} from "../../src/activation/active-state.js";
import { withSelfTriggeredModelSet } from "../../src/activation/apply.js";
import {
  handleModelSelectDrift,
  syncDirtyFromCurrentState,
} from "../../src/activation/drift-handlers.js";
import type {
  ActivePresetState,
  PresetDriftSnapshot,
  ThinkingLevel,
} from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  clearActive();
});

describe("handleModelSelectDrift", () => {
  it("ignores self-triggered model_select events", async () => {
    const harness = makeHarness();

    setActive(activeState({ dirty: false }));
    await withSelfTriggeredModelSet(() =>
      handleModelSelectDrift(
        { model: { id: "gpt", provider: "openai" }, source: "set" },
        harness.ctx,
        harness.pi,
      ),
    );

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("ignores restore model_select events", async () => {
    const harness = makeHarness();

    setActive(activeState({ dirty: false }));
    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "restore" },
      harness.ctx,
      harness.pi,
    );

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("no-ops when no preset is active", async () => {
    const harness = makeHarness();

    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "set" },
      harness.ctx,
      harness.pi,
    );

    expect(getActive()).toBeUndefined();
  });

  it("marks dirty when the selected model differs from the cached snapshot", async () => {
    const harness = makeHarness({
      ctxModel: { id: "gpt", provider: "openai" },
    });

    setActive(activeState({ dirty: false }));
    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "cycle" },
      harness.ctx,
      harness.pi,
    );

    expect(getActive()).toMatchObject({ dirty: true });
  });

  it("marks clean when re-selecting the preset's model resyncs every dimension", async () => {
    const harness = makeHarness();

    setActive(activeState({ dirty: true }));
    await handleModelSelectDrift(
      { model: { id: "claude", provider: "anthropic" }, source: "set" },
      harness.ctx,
      harness.pi,
    );

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("keeps dirty when the model matches but thinking is still drifted", async () => {
    // Regression for the M1 bug: re-selecting the preset's model while the
    // thinking level is still off-spec must NOT flip the badge clean.
    const harness = makeHarness({ piThinking: "low" });

    setActive(activeState({ dirty: true }));
    await handleModelSelectDrift(
      { model: { id: "claude", provider: "anthropic" }, source: "set" },
      harness.ctx,
      harness.pi,
    );

    expect(getActive()).toMatchObject({ dirty: true });
  });
});

describe("syncDirtyFromCurrentState", () => {
  it("marks dirty immediately for thinking-level drift", async () => {
    const harness = makeHarness({ piThinking: "low" });

    setActive(activeState({ dirty: false }));
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    expect(getActive()).toMatchObject({ dirty: true });
  });

  it("marks clean immediately when thinking level is re-synced", async () => {
    const harness = makeHarness({ piThinking: "high" });

    setActive(activeState({ dirty: true }));
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("marks dirty for tools drift when the preset declares tools", async () => {
    const harness = makeHarness({ piTools: ["bash"] });

    setActive(activeState({ dirty: false, tools: ["read"] }));
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    expect(getActive()).toMatchObject({ dirty: true });
  });

  it("does not flip dirty for a tools change when the preset omits tools", async () => {
    const harness = makeHarness({ piTools: ["bash", "grep"] });

    setActive(activeState({ dirty: false }));
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("treats tools as order-independent sets", async () => {
    const harness = makeHarness({ piTools: ["bash", "read"] });

    setActive(activeState({ dirty: false, tools: ["read", "bash"] }));
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    expect(getActive()).toMatchObject({ dirty: false });
  });

  it("is a no-op when already clean and no dimensions have drifted", async () => {
    const harness = makeHarness();
    const before = activeState({ dirty: false });

    setActive(before);
    await syncDirtyFromCurrentState(harness.ctx, harness.pi);

    // Same object reference identity would be ideal but `setActive` clones
    // on each write; structural equality is enough to prove no spurious
    // mutation occurred.
    expect(getActive()).toEqual(before);
  });
});

interface ActiveStateOptions {
  dirty: boolean;
  thinkingLevel?: ThinkingLevel;
  tools?: readonly string[];
}

interface HarnessOptions {
  ctxModel?: { id: string; provider: string };
  piThinking?: ThinkingLevel;
  piTools?: string[];
}

function activeState(options: ActiveStateOptions): ActivePresetState {
  const declared: PresetDriftSnapshot = {
    model: "claude",
    provider: "anthropic",
    thinkingLevel: options.thinkingLevel ?? "high",
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
  };

  return {
    declared,
    dirty: options.dirty,
    name: "plan",
    restore: { kind: "unknown" },
    scope: "project",
  };
}

function makeHarness(options: HarnessOptions = {}): {
  ctx: Pick<ExtensionContext, "model" | "modelRegistry" | "ui">;
  pi: { getActiveTools(): string[]; getThinkingLevel(): ThinkingLevel };
} {
  const ctxModel = options.ctxModel ?? { id: "claude", provider: "anthropic" };

  return {
    ctx: {
      model: { ...ctxModel, reasoning: true },
      modelRegistry: makeStubModelRegistry({
        models: {
          anthropic: { claude: { hasKey: true, reasoning: true } },
          openai: { gpt: { hasKey: true, reasoning: true } },
        },
      }),
      ui: {
        setStatus: () => undefined,
        theme: { fg: (_color: string, text: string) => text },
      },
    } as unknown as Pick<ExtensionContext, "model" | "modelRegistry" | "ui">,
    pi: {
      getActiveTools: () => options.piTools ?? [],
      getThinkingLevel: () => options.piThinking ?? "high",
    },
  };
}
