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
import type { Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

interface RegistryStub {
  models: Record<string, Record<string, { hasKey: boolean }>>;
}

const make = (overrides: Partial<Preset> & Pick<Preset, "name">): Preset => ({
  provider: "anthropic",
  model: "claude-opus-4.5",
  ...overrides,
});

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

    expect(result.map((r) => `${r.scope}:${r.name}`)).toEqual([
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
