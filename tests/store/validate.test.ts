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
import type { Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

/**
 * Minimal stub for the slice of `ModelRegistry` that `computeAvailability`
 * consumes. Avoids depending on the real registry's filesystem loading.
 */
interface RegistryStub {
  models: Record<string, Record<string, { hasKey: boolean }>>;
}

function makeCtx(stub: RegistryStub) {
  const modelRegistry = {
    find(provider: string, modelId: string): Model<never> | undefined {
      const present = stub.models[provider]?.[modelId];
      if (!present) return undefined;
      return { provider, id: modelId } as unknown as Model<never>;
    },
    hasConfiguredAuth(model: Model<never>): boolean {
      return stub.models[model.provider]?.[model.id]?.hasKey ?? false;
    },
  };
  // Cast to the full `ModelRegistry` class at the boundary: the storage
  // layer only reads `find` / `hasConfiguredAuth`, and matching the
  // class's private fields structurally isn't possible.
  return { modelRegistry: modelRegistry as unknown as ModelRegistry };
}

describe("validatePresetShape", () => {
  const minimal: Preset = {
    name: "plan",
    provider: "anthropic",
    model: "claude-opus-4.5",
  };

  it("accepts a minimal valid preset", () => {
    expect(validatePresetShape(minimal)).toEqual({ ok: true });
  });

  it("rejects non-objects", () => {
    expect(validatePresetShape(null).ok).toBe(false);
    expect(validatePresetShape("plan").ok).toBe(false);
    expect(validatePresetShape([minimal]).ok).toBe(false);
  });

  it.each([
    ["name", { ...minimal, name: "" }],
    ["provider", { ...minimal, provider: "" }],
    ["model", { ...minimal, model: "" }],
  ])("rejects empty required field %s", (_field, value) => {
    expect(validatePresetShape(value).ok).toBe(false);
  });

  it.each([["name"], ["provider"], ["model"]])(
    "rejects missing required field %s",
    (field) => {
      const obj: Record<string, unknown> = { ...minimal };
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
      expect(validatePresetShape({ ...minimal, thinkingLevel: level }).ok).toBe(
        true,
      );
    }
  });

  it("rejects an invalid thinking level", () => {
    const result = validatePresetShape({
      ...minimal,
      thinkingLevel: "ultra",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("thinkingLevel");
  });

  it("rejects non-string entries in tools", () => {
    const result = validatePresetShape({ ...minimal, tools: ["read", 42] });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("tools");
  });

  it("rejects non-numeric order", () => {
    const result = validatePresetShape({ ...minimal, order: "1" });
    expect(result.ok).toBe(false);
  });

  it("accepts a fully populated preset", () => {
    const full: Preset = {
      ...minimal,
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
  const make = (name: string): Preset => ({
    name,
    provider: "anthropic",
    model: "claude-opus-4.5",
  });

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
  const preset = { provider: "anthropic", model: "claude-opus-4.5" } as const;

  it("returns 'no-model' when the model is not in the registry", () => {
    const ctx = makeCtx({ models: {} });
    expect(computeAvailability(preset, ctx)).toBe("no-model");
  });

  it("returns 'no-key' when the model exists but the provider has no key", () => {
    const ctx = makeCtx({
      models: { anthropic: { "claude-opus-4.5": { hasKey: false } } },
    });
    expect(computeAvailability(preset, ctx)).toBe("no-key");
  });

  it("returns undefined when the model exists and a key is configured", () => {
    const ctx = makeCtx({
      models: { anthropic: { "claude-opus-4.5": { hasKey: true } } },
    });
    expect(computeAvailability(preset, ctx)).toBeUndefined();
  });
});
