/**
 * Tests for pure clear-summary rendering.
 */
import type { ClearPart } from "../../src/activation/clear.js";
import {
  chooseClearLead,
  formatRowValue,
  renderClearSummary,
} from "../../src/ui/clear-summary.js";
import { describe, expect, it } from "vitest";

const part = (
  action: ClearPart["action"],
  field: ClearPart["field"] = "model",
  value = "x",
): ClearPart => ({ action, field, value });

describe("chooseClearLead", () => {
  it("returns the priorUnknown lead when every field is unknown", () => {
    expect(
      chooseClearLead([
        part("unknown", "model"),
        part("unknown", "thinking"),
        part("unknown", "tools"),
      ]),
    ).toBe("No saved baseline. Current settings were left as-is.");
  });

  it("returns the failure lead whenever any field failed to restore", () => {
    expect(
      chooseClearLead([
        part("restore-failed", "model"),
        part("restored", "thinking"),
        part("already-baseline", "tools"),
      ]),
    ).toBe("Tried to restore your previous settings but ran into a problem.");
  });

  it("returns the all-already-baseline lead when nothing changed", () => {
    expect(
      chooseClearLead([
        part("already-baseline", "model"),
        part("already-baseline", "thinking"),
        part("already-baseline", "tools"),
      ]),
    ).toBe("Your settings already matched the saved baseline.");
  });

  it("returns the happy-path lead when every field is restore-like", () => {
    expect(
      chooseClearLead([
        part("restored", "model"),
        part("already-baseline", "thinking"),
        part("restored", "tools"),
      ]),
    ).toBe("Restored your previous settings.");
  });

  it("surfaces unavailable tools when restore-like with restored-partial", () => {
    expect(
      chooseClearLead([
        part("restored", "model"),
        part("restored", "thinking"),
        part("restored-partial", "tools"),
      ]),
    ).toBe(
      "Restored your previous settings. Some tools are no longer available.",
    );
  });

  it("returns the kept-everything lead when no field is restore-like", () => {
    expect(
      chooseClearLead([
        part("user-override", "model"),
        part("baseline-null", "thinking"),
        part("not-owned", "tools"),
      ]),
    ).toBe("Kept all your manual changes. Nothing to restore.");
  });

  it("returns the mixed lead when restore-like and kept-like fields coexist", () => {
    expect(
      chooseClearLead([
        part("user-override", "model"),
        part("restored", "thinking"),
        part("not-owned", "tools"),
      ]),
    ).toBe("Restored some settings. Kept your manual changes for others.");
  });
});

describe("formatRowValue", () => {
  it.each([
    [part("already-baseline"), "x"],
    [part("restored"), "x"],
    [part("baseline-null"), "x (No baseline saved for this field)"],
    [part("unknown"), "x (No baseline saved for this field)"],
    [part("not-owned"), "x (Not managed by cleared preset)"],
    [part("restore-failed"), "Could not switch back to x."],
    [
      {
        action: "restored-partial",
        dropped: ["bash"],
        field: "tools",
        value: "read",
      } satisfies ClearPart,
      "read (Unavailable: bash)",
    ],
    [part("user-override"), "x (Left as-is — you changed it after activation)"],
  ])("formats %s", (clearPart, expected) => {
    expect(formatRowValue(clearPart)).toBe(expected);
  });
});

describe("renderClearSummary", () => {
  it("renders the all-restored case with the happy-path lead and bare values", () => {
    const out = renderClearSummary("plan", [
      { action: "restored", field: "model", value: "anthropic/old" },
      { action: "restored", field: "thinking", value: "medium" },
      { action: "restored", field: "tools", value: "bash" },
    ]);

    expect(out).toContain("Preset cleared: plan");
    expect(out).toContain("Restored your previous settings.");
    expect(out).toContain("Model:          anthropic/old");
    expect(out).toContain("Thinking level: medium");
    expect(out).toContain("Tools:          bash");
  });

  it("uses the mixed lead and per-row annotations when some fields were kept", () => {
    const out = renderClearSummary("plan", [
      { action: "user-override", field: "model", value: "openai/gpt" },
      { action: "restored", field: "thinking", value: "medium" },
      { action: "not-owned", field: "tools", value: "foo" },
    ]);

    expect(out).toContain(
      "Restored some settings. Kept your manual changes for others.",
    );

    expect(out).toContain(
      "Model:          openai/gpt (Left as-is — you changed it after activation)",
    );
    expect(out).toContain("Thinking level: medium");
    expect(out).toContain(
      "Tools:          foo (Not managed by cleared preset)",
    );
  });

  it("falls back when the theme is undefined", () => {
    expect(
      renderClearSummary("plan", [part("already-baseline", "model", "none")]),
    ).toBe(
      "Preset cleared: plan\nYour settings already matched the saved baseline.\n  Model: none",
    );
  });
});
