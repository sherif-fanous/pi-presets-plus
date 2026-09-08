/**
 * Maps a resolved model to the thinking levels a preset may apply to it, and
 * clamps a preset's declared level to that range.
 */
import { THINKING_LEVELS, type Preset, type ThinkingLevel } from "../types.js";
import {
  clampThinkingLevel,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";

/** Return the level Pi will effectively use for the preset and model pair. */
export function effectiveThinkingLevel(
  preset: Pick<Preset, "thinkingLevel">,
  model: Model<Api> | undefined,
): ThinkingLevel {
  const declared = preset.thinkingLevel ?? "off";

  if (!model || validThinkingLevels(model).includes(declared)) return declared;

  return clampThinkingLevel(model, "off");
}

/**
 * Return the levels meaningful for a model; an unknown model allows them all.
 *
 * `model.reasoning === false` settles the question and leaves only `"off"`.
 * For reasoning models this mirrors the pi-ai supported-level parser: a level
 * is unsupported when `thinkingLevelMap` stores `null` for it, missing keys
 * fall through to provider defaults for levels up to `"high"`, and `"xhigh"`
 * and `"max"` need an explicit non-null entry. The optional chaining keeps
 * pi-ai bundles without `thinkingLevelMap` on the up-to-high behavior.
 */
export function validThinkingLevels(
  model: Model<Api> | undefined,
): ThinkingLevel[] {
  if (!model) return [...THINKING_LEVELS];
  if (model.reasoning === false) return ["off"];

  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];

    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;

    return true;
  });
}
