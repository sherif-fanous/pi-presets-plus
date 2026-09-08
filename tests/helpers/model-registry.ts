/**
 * Builds the `ModelRegistry` stub that tests hand to storage and
 * activation code, from a plain map of providers, models, and the auth and
 * reasoning traits each model should report.
 */
import type { Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

/** Models a stub registry knows about, keyed by provider then model id. */
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

/**
 * Builds a registry whose `find` and `hasConfiguredAuth` answer from the
 * given map.
 */
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

  // The real class declares private fields that no object literal can
  // satisfy structurally, so the stub crosses the boundary via `unknown`.
  return modelRegistry as unknown as ModelRegistry;
}
