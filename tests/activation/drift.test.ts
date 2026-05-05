/**
 * Tests for active-preset drift detection.
 *
 * Owns coverage for the pure per-field comparison helper; it does NOT test
 * event-handler registration, status rendering side effects, or disk I/O.
 */
import {
  detectDriftReasons,
  snapshotPresetForDrift,
} from "../../src/activation/drift.js";
import type {
  LoadedPreset,
  PresetDriftSnapshot,
  ThinkingLevel,
} from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";

const baseDeclared: PresetDriftSnapshot = {
  model: "claude",
  provider: "anthropic",
  thinkingLevel: "high",
};

const registry = makeStubModelRegistry({
  models: { anthropic: { claude: { hasKey: true } } },
});

function model(
  provider = "anthropic",
  id = "claude",
  reasoning = true,
): Model<Api> {
  return { id, provider, reasoning } as Model<Api>;
}

function pi(thinkingLevel: ThinkingLevel, tools: string[]) {
  return {
    getActiveTools: () => tools,
    getThinkingLevel: () => thinkingLevel,
  };
}

describe("detectDriftReasons", () => {
  it("returns no reasons when current state matches", () => {
    expect(
      detectDriftReasons(
        { ...baseDeclared, tools: ["read", "bash"] },
        pi("high", ["bash", "read"]),
        { model: model(), modelRegistry: registry },
      ),
    ).toEqual([]);
  });

  it("detects model drift", () => {
    expect(
      detectDriftReasons(baseDeclared, pi("high", []), {
        model: model("openai", "gpt"),
        modelRegistry: registry,
      }),
    ).toEqual(["model"]);
  });

  it("detects thinking drift on reasoning models", () => {
    expect(
      detectDriftReasons(baseDeclared, pi("low", []), {
        model: model(),
        modelRegistry: registry,
      }),
    ).toEqual(["thinking level"]);
  });

  it("detects tools drift only when the snapshot declares tools", () => {
    expect(
      detectDriftReasons(
        { ...baseDeclared, tools: ["read", "bash"] },
        pi("high", ["read"]),
        { model: model(), modelRegistry: registry },
      ),
    ).toEqual(["tools"]);

    expect(
      detectDriftReasons(baseDeclared, pi("high", ["read"]), {
        model: model(),
        modelRegistry: registry,
      }),
    ).toEqual([]);
  });

  it("uses effective thinking for non-reasoning models", () => {
    const nonReasoningRegistry = makeStubModelRegistry({
      models: { anthropic: { claude: { hasKey: true, reasoning: false } } },
    });

    expect(
      detectDriftReasons(baseDeclared, pi("off", []), {
        model: model("anthropic", "claude", false),
        modelRegistry: nonReasoningRegistry,
      }),
    ).toEqual([]);
  });
});

describe("snapshotPresetForDrift", () => {
  const fullPreset: LoadedPreset = {
    model: "claude",
    name: "plan",
    provider: "anthropic",
    scope: "project",
    thinkingLevel: "high",
    tools: ["read", "bash"],
  };

  it("captures provider, model, thinking, and a defensive tools copy", () => {
    const snapshot = snapshotPresetForDrift(fullPreset);

    expect(snapshot).toEqual({
      model: "claude",
      provider: "anthropic",
      thinkingLevel: "high",
      tools: ["read", "bash"],
    });

    // Mutating the source array must not bleed into the snapshot.
    fullPreset.tools?.push("grep");
    expect(snapshot.tools).toEqual(["read", "bash"]);
  });

  it("omits thinkingLevel and tools when the preset omits them", () => {
    const snapshot = snapshotPresetForDrift({
      model: "claude",
      provider: "anthropic",
    });

    expect(snapshot).toEqual({
      model: "claude",
      provider: "anthropic",
    });
    expect("thinkingLevel" in snapshot).toBe(false);
    expect("tools" in snapshot).toBe(false);
  });
});
