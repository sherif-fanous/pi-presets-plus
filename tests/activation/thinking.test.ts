/**
 * Tests effective thinking-level computation for preset activation.
 *
 * Owns coverage for OpenSpec change `add-preset-activation` task 2.2; it does
 * NOT exercise pi mutation. Future editor tests can reuse these cases as UI
 * fixtures.
 */
import {
  effectiveThinkingLevel,
  validThinkingLevels,
} from "../../src/activation/thinking.js";
import type { Preset } from "../../src/types.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";

const basePreset: Preset = {
  name: "plan",
  provider: "anthropic",
  model: "claude",
};

function model(reasoning: boolean): Model<Api> {
  return {
    id: "claude",
    provider: "anthropic",
    reasoning,
  } as Model<Api>;
}

describe("thinking helpers", () => {
  it("honors a declared level for reasoning models", () => {
    expect(
      effectiveThinkingLevel(
        { ...basePreset, thinkingLevel: "high" },
        model(true),
      ),
    ).toBe("high");
  });

  it("defaults to off for reasoning models without a declared level", () => {
    expect(effectiveThinkingLevel(basePreset, model(true))).toBe("off");
  });

  it("clamps declared levels to off for non-reasoning models", () => {
    expect(
      effectiveThinkingLevel(
        { ...basePreset, thinkingLevel: "high" },
        model(false),
      ),
    ).toBe("off");
    expect(validThinkingLevels(model(false))).toEqual(["off"]);
  });

  it("keeps omitted thinking level off for non-reasoning models", () => {
    expect(effectiveThinkingLevel(basePreset, model(false))).toBe("off");
  });

  it("treats undefined models as permissive for validation", () => {
    expect(
      effectiveThinkingLevel(
        { ...basePreset, thinkingLevel: "medium" },
        undefined,
      ),
    ).toBe("medium");
  });
});
