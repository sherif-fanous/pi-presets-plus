/**
 * Tests for shared preset identity helpers.
 */
import { findPreset, samePresetIdentity } from "../src/preset-identity.js";
import type { LoadedPreset } from "../src/types.js";
import { describe, expect, expectTypeOf, it } from "vitest";

const presets: LoadedPreset[] = [
  {
    model: "claude-opus-4.5",
    name: "plan",
    provider: "anthropic",
    scope: "user",
  },
  { model: "gpt-5.5", name: "ship", provider: "openai", scope: "project" },
];

describe("findPreset", () => {
  it("returns undefined for a missing preset", () => {
    expect(
      findPreset(presets, { name: "missing", scope: "user" }),
    ).toBeUndefined();
  });

  it("returns the right entry when name and scope both match", () => {
    expect(findPreset(presets, { name: "ship", scope: "project" })).toBe(
      presets[1],
    );
  });

  it("does not match when only the name matches", () => {
    expect(
      findPreset(presets, { name: "plan", scope: "project" }),
    ).toBeUndefined();
  });

  it("does not match when only the scope matches", () => {
    expect(
      findPreset(presets, { name: "review", scope: "user" }),
    ).toBeUndefined();
  });

  it("returns the typed loaded preset for loaded preset inputs", () => {
    const match = findPreset(presets, { name: "plan", scope: "user" });

    expectTypeOf(match).toEqualTypeOf<LoadedPreset | undefined>();
    expect(match?.provider).toBe("anthropic");
  });
});

describe("samePresetIdentity", () => {
  it.each([
    [undefined, undefined, false],
    [{ name: "plan", scope: "user" } as const, undefined, false],
    [undefined, { name: "plan", scope: "user" } as const, false],
    [
      { name: "plan", scope: "user" } as const,
      { name: "plan", scope: "user" } as const,
      true,
    ],
    [
      { name: "plan", scope: "user" } as const,
      { name: "plan", scope: "project" } as const,
      false,
    ],
    [
      { name: "plan", scope: "user" } as const,
      { name: "ship", scope: "user" } as const,
      false,
    ],
  ])("compares optional identities", (first, second, expected) => {
    expect(samePresetIdentity(first, second)).toBe(expected);
  });
});
