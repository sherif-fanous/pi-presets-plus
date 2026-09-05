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
  const escapeCharacter = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${escapeCharacter}\\[[0-9;]*m`, "g");

  return text.replaceAll(ansiPattern, "");
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

  it("wraps a long unbroken body value", () => {
    expect(wrapBody("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("wraps body lines by visible width", () => {
    expect(wrapBody("東京大阪", 4)).toEqual(["東京", "大阪"]);
  });

  it("preserves body styling across wrapped lines", () => {
    const lines = wrapBody("\u001B[31malpha beta\u001B[0m", 5);

    expect(lines.map(stripAnsi)).toEqual(["alpha", "beta"]);
    expect(lines.every((line) => line.includes("\u001B[31m"))).toBe(true);
  });
});
