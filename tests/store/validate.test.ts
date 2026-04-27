/**
 * Tests for `src/store/validate.ts`.
 *
 * Covers all spec scenarios for the validation requirement:
 *
 * - Minimal valid preset accepted
 * - Missing required fields rejected
 * - Invalid `thinkingLevel` rejected
 * - Duplicate names within a file detected
 * - Availability classification: missing model → "no-model",
 *   present model with no key → "no-key", fully available → undefined.
 */
import {
  computeAvailability,
  findDuplicatePresetNames,
  validatePresetShape,
} from "../../src/store/validate.js";
import type { Preset } from "../../src/types.js";
import {
  makeStubModelRegistry,
  type RegistryStub,
} from "../helpers/model-registry.js";
import { describe, expect, it } from "vitest";

const minimalPreset: Preset = {
  name: "plan",
  provider: "anthropic",
  model: "claude-opus-4.5",
};

const availabilityProbe = {
  provider: "anthropic",
  model: "claude-opus-4.5",
} as const;

function make(name: string): Preset {
  return {
    name,
    provider: "anthropic",
    model: "claude-opus-4.5",
  };
}

function makeCtx(stub: RegistryStub) {
  return { modelRegistry: makeStubModelRegistry(stub) };
}

describe("validatePresetShape", () => {
  it("accepts a minimal valid preset", () => {
    expect(validatePresetShape(minimalPreset)).toEqual({ ok: true });
  });

  it("rejects non-objects", () => {
    expect(validatePresetShape(null).ok).toBe(false);
    expect(validatePresetShape("plan").ok).toBe(false);
    expect(validatePresetShape([minimalPreset]).ok).toBe(false);
  });

  it.each([
    ["name", { ...minimalPreset, name: "" }],
    ["provider", { ...minimalPreset, provider: "" }],
    ["model", { ...minimalPreset, model: "" }],
  ])("rejects empty required field %s", (_field, value) => {
    expect(validatePresetShape(value).ok).toBe(false);
  });

  it.each([["name"], ["provider"], ["model"]])(
    "rejects missing required field %s",
    (field) => {
      const obj: Record<string, unknown> = { ...minimalPreset };

      delete obj[field];

      const result = validatePresetShape(obj);

      expect(result.ok).toBe(false);
      expect(result.reason).toContain(field);
    },
  );

  it("accepts every valid thinking level", () => {
    for (const level of [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ] as const) {
      expect(
        validatePresetShape({ ...minimalPreset, thinkingLevel: level }).ok,
      ).toBe(true);
    }
  });

  it("rejects an invalid thinking level", () => {
    const result = validatePresetShape({
      ...minimalPreset,
      thinkingLevel: "ultra",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("thinkingLevel");
  });

  it("rejects non-string entries in tools", () => {
    const result = validatePresetShape({
      ...minimalPreset,
      tools: ["read", 42],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("tools");
  });

  it("rejects non-numeric order", () => {
    const result = validatePresetShape({ ...minimalPreset, order: "1" });

    expect(result.ok).toBe(false);
  });

  it("accepts a fully populated preset", () => {
    const full: Preset = {
      ...minimalPreset,
      thinkingLevel: "high",
      tools: ["read", "grep"],
      instructions: "PLAN mode",
      hotkey: "ctrl+p",
      order: 0,
    };

    expect(validatePresetShape(full)).toEqual({ ok: true });
  });
});

describe("findDuplicatePresetNames", () => {
  it("returns no duplicates for a unique-named array", () => {
    expect(findDuplicatePresetNames([make("a"), make("b"), make("c")])).toEqual(
      [],
    );
  });

  it("flags later occurrences of duplicate names", () => {
    const dups = findDuplicatePresetNames([
      make("plan"),
      make("ship"),
      make("plan"),
      make("plan"),
    ]);

    expect(dups).toEqual([
      { name: "plan", index: 2 },
      { name: "plan", index: 3 },
    ]);
  });

  it("treats different names as distinct", () => {
    expect(findDuplicatePresetNames([make("Plan"), make("plan")])).toEqual([]);
  });
});

describe("computeAvailability", () => {
  it("returns 'no-model' when the model is not in the registry", () => {
    const ctx = makeCtx({ models: {} });

    expect(computeAvailability(availabilityProbe, ctx)).toBe("no-model");
  });

  it("returns 'no-key' when the model exists but the provider has no key", () => {
    const ctx = makeCtx({
      models: { anthropic: { "claude-opus-4.5": { hasKey: false } } },
    });

    expect(computeAvailability(availabilityProbe, ctx)).toBe("no-key");
  });

  it("returns undefined when the model exists and a key is configured", () => {
    const ctx = makeCtx({
      models: { anthropic: { "claude-opus-4.5": { hasKey: true } } },
    });

    expect(computeAvailability(availabilityProbe, ctx)).toBeUndefined();
  });
});
