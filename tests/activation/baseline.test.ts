/**
 * Tests baseline capture for preset activation.
 *
 * Owns coverage for current model, thinking, and tool snapshots; it does NOT
 * test drift detection or activation side effects.
 */
import { captureBaseline } from "../../src/activation/baseline.js";
import type { ThinkingLevel } from "../../src/types.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

function model(): Model<Api> {
  return { id: "claude", provider: "anthropic", reasoning: true } as Model<Api>;
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
