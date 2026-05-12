/**
 * Current-state comparison for active presets.
 *
 * Owns deciding whether pi's current state already matches a preset; it
 * does NOT mutate state or notify users.
 */
import type { LoadedPreset } from "../types.js";
import { detectDriftReasons, snapshotPresetForDrift } from "./drift.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

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
  return (
    detectDriftReasons(snapshotPresetForDrift(preset), pi, ctx).length === 0
  );
}
