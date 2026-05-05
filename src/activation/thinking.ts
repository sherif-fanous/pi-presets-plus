/**
 * Thinking-level capability helpers for preset activation.
 *
 * Owns the mapping from a resolved model to the thinking levels a preset
 * may legally apply; it does NOT mutate pi state or surface notifications.
 */
import type { Preset, ThinkingLevel } from "../types.js";
import type { Api, Model } from "@mariozechner/pi-ai";

const ALL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

/** Return the level pi will effectively use for the preset/model pair. */
export function effectiveThinkingLevel(
  preset: Pick<Preset, "thinkingLevel">,
  model: Model<Api> | undefined,
): ThinkingLevel {
  const declared = preset.thinkingLevel ?? "off";

  return validThinkingLevels(model).includes(declared) ? declared : "off";
}

/** Return the levels meaningful for a model; unknown models are permissive. */
export function validThinkingLevels(
  model: Model<Api> | undefined,
): ThinkingLevel[] {
  if (!model) return [...ALL_THINKING_LEVELS];

  return model.reasoning === false ? ["off"] : [...ALL_THINKING_LEVELS];
}
