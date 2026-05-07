/**
 * Tests for reusable terminal-frame helpers.
 *
 * These helpers keep custom TUI surfaces width-safe around ANSI styling,
 * truncation, and borders.
 */
import {
  centerText,
  frameLine,
  frameSegment,
  padToWidth,
  wrapBody,
} from "../../src/ui/frame.js";
import { describe, expect, it } from "vitest";

function stripAnsi(text: string): string {
  return text.replaceAll("\u001B[0m", "");
}

describe("frame helpers", () => {
  it("pads content to the requested visible width", () => {
    expect(padToWidth("abc", 5)).toBe("abc  ");
  });

  it("truncates content with configurable ellipsis", () => {
    expect(stripAnsi(padToWidth("abcdef", 4))).toBe("abc…");
    expect(stripAnsi(padToWidth("abcdef", 4, "─", "─"))).toBe("abc─");
  });

  it("frames content with side borders", () => {
    expect(frameLine("x", 5)).toBe("│x  │");
  });

  it("renders fixed border segments", () => {
    expect(frameSegment("┌", "─", "┐", 5)).toBe("┌───┐");
  });

  it("centers text inside a visual width", () => {
    expect(centerText("x", 5)).toBe("  x  ");
    expect(centerText("xx", 5)).toBe(" xx  ");
  });

  it("wraps body lines without redundant inner padding", () => {
    expect(wrapBody("alpha beta gamma", 10)).toEqual(["alpha beta", "gamma"]);
  });
});
