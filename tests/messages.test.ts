/**
 * Renderer tests for the `presets-plus:activated` custom message.
 *
 * Owns coverage for the in-conversation activation marker. The pure
 * formatter `formatActivatedMessage` is tested directly so the rendered
 * text stays stable; the `renderActivatedMessage` wrapper is exercised
 * for the no-details branch only.
 */
import {
  ACTIVATED_MESSAGE_TYPE,
  formatActivatedMessage,
  renderActivatedMessage,
} from "../src/messages.js";
import { describe, expect, it } from "vitest";

const identityTheme = {
  bold: (text: string) => text,
  fg: (_color: string, text: string) => text,
} as never;

describe("formatActivatedMessage", () => {
  it("renders a single-line accent marker with just the preset name", () => {
    const text = formatActivatedMessage(
      {
        name: "plan",
        model: "anthropic/claude",
        thinkingLevel: "high",
      },
      identityTheme,
    );

    expect(text).toBe("Preset plan applied");
  });

  it("omits resolved model and thinking level (kept on details for replay)", () => {
    const text = formatActivatedMessage(
      {
        name: "plan",
        model: "anthropic/claude",
        thinkingLevel: "high",
      },
      identityTheme,
    );

    expect(text).not.toContain("anthropic/claude");
    expect(text).not.toContain("high");
    expect(text).not.toContain("thinking");
    expect(text).not.toContain("model");
  });
});

describe("renderActivatedMessage", () => {
  it("exports the documented custom-type literal", () => {
    expect(ACTIVATED_MESSAGE_TYPE).toBe("presets-plus:activated");
  });

  it("returns undefined when details are absent", () => {
    expect(
      renderActivatedMessage(
        { customType: ACTIVATED_MESSAGE_TYPE, content: "x" } as never,
        {} as never,
        identityTheme,
      ),
    ).toBeUndefined();
  });
});
