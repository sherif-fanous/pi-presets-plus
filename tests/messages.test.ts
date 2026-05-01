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
  it("renders the activation marker with preset/model/thinking rows", () => {
    const text = formatActivatedMessage(
      {
        name: "plan",
        model: "anthropic/claude",
        thinkingLevel: "high",
      },
      identityTheme,
    );

    expect(text).toContain("preset applied");
    expect(text).toContain("preset:         plan");
    expect(text).toContain("model:          anthropic/claude");
    expect(text).toContain("thinking level: high");
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
