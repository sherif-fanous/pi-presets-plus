/**
 * Tests event-handler logic for preset drift tracking.
 *
 * Owns coverage for model/thinking/tool drift event decisions and for the
 * in-memory contract that the handlers never read the on-disk preset
 * files. It does NOT test Pi's event registration surface or terminal
 * rendering.
 */
import {
  handleModelSelectDrift,
  syncDirtyFromCurrentState,
} from "../../src/activation/drift-handlers.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset, ThinkingLevel } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

describe("handleModelSelectDrift", () => {
  it("ignores self-triggered model_select events", async () => {
    const harness = makeHarness();

    restoreActive(harness, { dirty: false });
    await harness.session.withSelfTriggeredModelSet(() =>
      handleModelSelectDrift(
        { model: { id: "gpt", provider: "openai" }, source: "set" },
        harness.ctx,
        harness.pi,
        harness.session,
      ),
    );

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("ignores restore model_select events", async () => {
    const harness = makeHarness();

    restoreActive(harness, { dirty: false });
    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "restore" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("no-ops when no preset is active", async () => {
    const harness = makeHarness();

    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "set" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toBeUndefined();
  });

  it("marks dirty when the selected model differs from the cached snapshot", async () => {
    const harness = makeHarness({
      ctxModel: { id: "gpt", provider: "openai" },
    });

    restoreActive(harness, { dirty: false });
    await handleModelSelectDrift(
      { model: { id: "gpt", provider: "openai" }, source: "cycle" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: true });
  });

  it("marks clean when re-selecting the preset's model resyncs every dimension", async () => {
    const harness = makeHarness();

    restoreActive(harness, { dirty: true });
    await handleModelSelectDrift(
      { model: { id: "claude", provider: "anthropic" }, source: "set" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("keeps dirty when the model matches but thinking is still drifted", async () => {
    // Regression for the M1 bug: re-selecting the preset's model while the
    // thinking level is still off-spec must NOT flip the badge clean.
    const harness = makeHarness({ piThinking: "low" });

    restoreActive(harness, { dirty: true });
    await handleModelSelectDrift(
      { model: { id: "claude", provider: "anthropic" }, source: "set" },
      harness.ctx,
      harness.pi,
      harness.session,
    );

    expect(harness.session.current()).toMatchObject({ dirty: true });
  });
});

describe("syncDirtyFromCurrentState", () => {
  it("marks dirty immediately for thinking-level drift", async () => {
    const harness = makeHarness({ piThinking: "low" });

    restoreActive(harness, { dirty: false });
    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: true });
  });

  it("marks clean immediately when thinking level is re-synced", async () => {
    const harness = makeHarness({ piThinking: "high" });

    restoreActive(harness, { dirty: true });
    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("marks dirty for tools drift when the preset declares tools", async () => {
    const harness = makeHarness({ piTools: ["bash"] });

    restoreActive(harness, { dirty: false, tools: ["read"] });
    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: true });
  });

  it("does not flip dirty for a tools change when the preset omits tools", async () => {
    const harness = makeHarness({ piTools: ["bash", "grep"] });

    restoreActive(harness, { dirty: false });
    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("treats tools as order-independent sets", async () => {
    const harness = makeHarness({ piTools: ["bash", "read"] });

    restoreActive(harness, { dirty: false, tools: ["read", "bash"] });
    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    expect(harness.session.current()).toMatchObject({ dirty: false });
  });

  it("is a no-op when already clean and no dimensions have drifted", async () => {
    const harness = makeHarness();

    restoreActive(harness, { dirty: false });

    const before = harness.session.current();

    await syncDirtyFromCurrentState(harness.ctx, harness.pi, harness.session);

    // Structural equality proves that the clean state did not change.
    expect(harness.session.current()).toEqual(before);
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

function makeHarness(options: HarnessOptions = {}): {
  ctx: Pick<ExtensionContext, "model" | "modelRegistry" | "ui">;
  pi: { getActiveTools(): string[]; getThinkingLevel(): ThinkingLevel };
  session: ActivePresetSession;
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
        theme: {
          bold: (text: string) => text,
          fg: (_color: string, text: string) => text,
        },
      },
    } as unknown as Pick<ExtensionContext, "model" | "modelRegistry" | "ui">,
    pi: {
      getActiveTools: () => options.piTools ?? [],
      getThinkingLevel: () => options.piThinking ?? "high",
    },
    session: new ActivePresetSession(),
  };
}

function restoreActive(
  harness: ReturnType<typeof makeHarness>,
  options: ActiveStateOptions,
): void {
  const preset: LoadedPreset = {
    model: "claude",
    name: "plan",
    provider: "anthropic",
    scope: "project",
    thinkingLevel: options.thinkingLevel ?? "high",
    ...(options.tools !== undefined ? { tools: [...options.tools] } : {}),
  };

  harness.session.restoreFromBranch(
    [
      {
        customType: "presets-plus:active",
        data: { name: preset.name, scope: preset.scope },
        type: "custom",
      },
    ] as never,
    [preset],
    harness.ctx,
  );

  if (options.dirty) harness.session.markDirty(harness.ctx);
}
