/**
 * Current-state comparison for active presets.
 *
 * Owns deciding whether pi's current state already matches a preset; it
 * does NOT mutate state or notify users.
 */
import type { LoadedPreset } from "../types.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

/** Minimal context surface needed for comparison. */
type StateMatchesContext = Pick<ExtensionContext, "model" | "modelRegistry">;

/** Minimal pi surface needed for comparison. */
type StateMatchesPi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;

/** Return true when current model/thinking/tools equal declared preset state. */
export function stateMatches(
  preset: LoadedPreset,
  pi: StateMatchesPi,
  ctx: StateMatchesContext,
): boolean {
  if (
    ctx.model?.provider !== preset.provider ||
    ctx.model.id !== preset.model
  ) {
    return false;
  }

  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (pi.getThinkingLevel() !== effectiveThinkingLevel(preset, model)) {
    return false;
  }

  if (preset.tools && preset.tools.length > 0) {
    return sameSet(pi.getActiveTools(), preset.tools);
  }

  return true;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);

  return left.every((value) => rightSet.has(value));
}
