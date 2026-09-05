/**
 * Tests for unexpected UI action error formatting.
 *
 * Covers thrown-value conversion and punctuation; it does NOT exercise
 * editor or picker delivery.
 */
import { formatActionError } from "../../src/ui/action-error.js";
import { describe, expect, it } from "vitest";

describe("formatActionError", () => {
  it.each([
    [new Error("Disk full"), "Disk full."],
    [new Error("Disk full."), "Disk full."],
    [new Error("Retry?"), "Retry?"],
    [new Error("Stopped!"), "Stopped!"],
    ["Storage unavailable", "Storage unavailable."],
    [42, "42."],
  ])("formats %p", (error, detail) => {
    expect(formatActionError(error)).toBe(
      `Pi Presets Plus could not complete the action. ${detail}`,
    );
  });

  it("uses a safe fallback when string conversion fails", () => {
    const thrown = {
      toString(): string {
        throw new Error("conversion failed");
      },
    };

    expect(formatActionError(thrown)).toBe(
      "Pi Presets Plus could not complete the action. Unknown error.",
    );
  });
});
