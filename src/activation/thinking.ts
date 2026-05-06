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

/**
 * Return the levels meaningful for a model; unknown models are permissive.
 *
 * `model.reasoning === false` is authoritative and allows only `"off"`.
 * Reasoning models mirror pi-ai's supported-level parser: a level is
 * unsupported when the map explicitly stores `null`; missing keys fall through
 * to provider defaults for levels through `"high"`; `"xhigh"` must be
 * explicitly mapped to a non-null value. Optional-chained reads keep older
 * pi-ai bundles that predate `thinkingLevelMap` on the legacy up-to-high
 * behavior.
 */
export function validThinkingLevels(
  model: Model<Api> | undefined,
): ThinkingLevel[] {
  if (!model) return [...ALL_THINKING_LEVELS];
  if (model.reasoning === false) return ["off"];

  return ALL_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];

    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;

    return true;
  });
}
