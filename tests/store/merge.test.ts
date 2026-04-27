/**
 * Tests for `src/store/merge.ts`.
 *
 * Covers the spec scenarios for shadowing, ordering, and availability
 * tagging. Uses an in-memory `ModelRegistry` stub so tests stay
 * hermetic; the real registry depends on filesystem state we don't want
 * to touch from a unit test.
 */
import { mergeScopes } from "../../src/store/merge.js";
import type { Preset } from "../../src/types.js";
import {
  makeStubModelRegistry,
  type RegistryStub,
} from "../helpers/model-registry.js";
import { describe, expect, it } from "vitest";

function make(overrides: Partial<Preset> & Pick<Preset, "name">): Preset {
  return {
    provider: "anthropic",
    model: "claude-opus-4.5",
    ...overrides,
  };
}

function makeCtx(stub: RegistryStub) {
  return { modelRegistry: makeStubModelRegistry(stub) };
}

describe("mergeScopes", () => {
  it("emits globals first, then projects, in file order within each scope", () => {
    const ctx = makeCtx({
      models: { anthropic: { "claude-opus-4.5": { hasKey: true } } },
    });
    const result = mergeScopes(
      {
        user: [make({ name: "g1" }), make({ name: "g2" })],
        project: [make({ name: "p1" }), make({ name: "p2" })],
      },
      ctx,
    );

    expect(result.map((entry) => `${entry.scope}:${entry.name}`)).toEqual([
      "user:g1",
      "user:g2",
      "project:p1",
      "project:p2",
    ]);
  });

  it("tags every preset with its scope", () => {
    const ctx = makeCtx({ models: {} });
    const result = mergeScopes(
      { user: [make({ name: "a" })], project: [make({ name: "b" })] },
      ctx,
    );

    expect(result[0]?.scope).toBe("user");
    expect(result[1]?.scope).toBe("project");
  });

  it("marks globals shadowed when a project preset shares the name", () => {
    const ctx = makeCtx({ models: {} });
    const result = mergeScopes(
      {
        user: [make({ name: "plan" }), make({ name: "ship" })],
        project: [
          make({
            name: "plan",
            provider: "openai",
            model: "gpt-5",
          }),
        ],
      },
      ctx,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      name: "plan",
      scope: "user",
      shadowed: true,
    });

    expect(result[1]).toMatchObject({
      name: "ship",
      scope: "user",
    });
    expect(result[1]?.shadowed).toBeUndefined();
    expect(result[2]).toMatchObject({
      name: "plan",
      scope: "project",
    });
    expect(result[2]?.shadowed).toBeUndefined();
  });

  it("does not tag a global as shadowed when only the global file has the name", () => {
    const ctx = makeCtx({ models: {} });
    const result = mergeScopes(
      { user: [make({ name: "solo" })], project: [] },
      ctx,
    );

    expect(result[0]?.shadowed).toBeUndefined();
  });

  it("computes availability per-entry", () => {
    const ctx = makeCtx({
      models: {
        anthropic: { "claude-opus-4.5": { hasKey: true } },
        openai: { "gpt-5": { hasKey: false } },
      },
    });
    const result = mergeScopes(
      {
        user: [
          make({ name: "ok" }),
          make({ name: "no-key", provider: "openai", model: "gpt-5" }),
          make({
            name: "no-model",
            provider: "anthropic",
            model: "made-up",
          }),
        ],
        project: [],
      },
      ctx,
    );

    expect(result[0]?.unavailable).toBeUndefined();
    expect(result[1]?.unavailable).toBe("no-key");
    expect(result[2]?.unavailable).toBe("no-model");
  });
});
