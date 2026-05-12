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
import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

const basePreset: Preset = {
  name: "plan",
  provider: "anthropic",
  model: "claude",
};

function model(
  reasoning: boolean,
  thinkingLevelMap?: ThinkingLevelMap,
): Model<Api> {
  return {
    id: "claude",
    provider: "anthropic",
    reasoning,
    ...(thinkingLevelMap === undefined ? {} : { thinkingLevelMap }),
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
    expect(validThinkingLevels(model(false, { low: "low" }))).toEqual(["off"]);
  });

  it("keeps levels through high for reasoning models without thinkingLevelMap", () => {
    expect(validThinkingLevels(model(true))).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });

  it("keeps levels through high for empty maps", () => {
    expect(validThinkingLevels(model(true, {}))).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });

  it("keeps all levels when xhigh is explicitly mapped", () => {
    expect(validThinkingLevels(model(true, { xhigh: "max" }))).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("removes explicitly nulled levels and requires xhigh to be mapped", () => {
    expect(validThinkingLevels(model(true, { low: null }))).toEqual([
      "off",
      "minimal",
      "medium",
      "high",
    ]);
  });

  it("returns an empty set when every level is explicitly null", () => {
    expect(
      validThinkingLevels(
        model(true, {
          high: null,
          low: null,
          medium: null,
          minimal: null,
          off: null,
          xhigh: null,
        }),
      ),
    ).toEqual([]);
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
