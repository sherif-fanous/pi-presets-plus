/**
 * Shared `ModelRegistry` test stub.
 *
 * The storage layer only ever calls `find` + `hasConfiguredAuth`, so a
 * structural stub is sufficient. The real `ModelRegistry` class carries
 * private fields (`authStorage`, `models`, …) that a literal cannot
 * satisfy structurally, so callers cast through `unknown` at the
 * boundary — this helper centralizes that cast and its rationale so
 * individual tests don't repeat the comment.
 */
import type { Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export interface RegistryStub {
  models: Record<
    string,
    Record<
      string,
      {
        hasKey: boolean;
        reasoning?: boolean;
        thinkingLevelMap?: ThinkingLevelMap;
      }
    >
  >;
}

export function makeStubModelRegistry(stub: RegistryStub): ModelRegistry {
  const modelRegistry = {
    find(provider: string, modelId: string): Model<never> | undefined {
      const present = stub.models[provider]?.[modelId];

      if (!present) return undefined;

      return {
        provider,
        id: modelId,
        reasoning: present.reasoning,
        ...(present.thinkingLevelMap === undefined
          ? {}
          : { thinkingLevelMap: present.thinkingLevelMap }),
      } as unknown as Model<never>;
    },
    hasConfiguredAuth(model: Model<never>): boolean {
      return stub.models[model.provider]?.[model.id]?.hasKey ?? false;
    },
  };

  // Cast at the boundary: the real class has private fields a structural
  // stub cannot match. Storage-layer code only reads `find` +
  // `hasConfiguredAuth`, so the runtime surface is faithful.
  return modelRegistry as unknown as ModelRegistry;
}
