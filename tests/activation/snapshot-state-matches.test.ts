/**
 * Tests baseline capture and state comparison helpers for preset activation.
 *
 * Owns coverage for OpenSpec change `add-preset-activation` task 3.4; it does
 * NOT test command routing or pi side effects beyond fake getters. Future drift
 * detection can extend state-match assertions here.
 */
import { captureBaseline } from "../../src/activation/baseline.js";
import { stateMatches } from "../../src/activation/state-matches.js";
import type { LoadedPreset, ThinkingLevel } from "../../src/types.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

const preset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
  thinkingLevel: "high",
};

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

describe("captureBaseline", () => {
  it("captures current model, thinking, and tools", () => {
    expect(captureBaseline(pi("medium", ["read"]), { model: model() })).toEqual(
      {
        model: { id: "claude", provider: "anthropic" },
        thinkingLevel: "medium",
        tools: ["read"],
      },
    );
  });

  it("records null when no current model exists", () => {
    expect(captureBaseline(pi("low", ["bash"]), { model: undefined })).toEqual({
      model: null,
      thinkingLevel: "low",
      tools: ["bash"],
    });
  });
});

describe("stateMatches", () => {
  const registry = makeStubModelRegistry({
    models: { anthropic: { claude: { hasKey: true } } },
  });

  it("matches model, effective thinking, and tool set", () => {
    expect(
      stateMatches(
        { ...preset, tools: ["bash", "read"] },
        pi("high", ["read", "bash"]),
        { model: model(), modelRegistry: registry },
      ),
    ).toBe(true);
  });

  it("detects model mismatches", () => {
    expect(
      stateMatches(preset, pi("high", []), {
        model: model("openai", "gpt"),
        modelRegistry: registry,
      }),
    ).toBe(false);
  });

  it("detects thinking mismatches", () => {
    expect(
      stateMatches(preset, pi("low", []), {
        model: model(),
        modelRegistry: registry,
      }),
    ).toBe(false);
  });

  it("uses effective thinking for non-reasoning models", () => {
    const nonReasoningRegistry = makeStubModelRegistry({
      models: { anthropic: { claude: { hasKey: true, reasoning: false } } },
    });

    expect(
      stateMatches(preset, pi("off", []), {
        model: model("anthropic", "claude", false),
        modelRegistry: nonReasoningRegistry,
      }),
    ).toBe(true);
  });

  it("detects tool mismatches as a set", () => {
    expect(
      stateMatches(
        { ...preset, tools: ["read", "bash"] },
        pi("high", ["read"]),
        { model: model(), modelRegistry: registry },
      ),
    ).toBe(false);
  });
});
