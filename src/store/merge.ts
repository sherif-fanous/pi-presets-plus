/**
 * Scope merge for preset storage.
 *
 * Owns combining the per-scope loader outputs into the single ordered
 * `LoadedPreset[]` exposed by `loadAll`, including scope tagging,
 * shadowing, and availability tagging. Pure: no I/O, no logging.
 */
import type { LoadedPreset, Preset } from "../types.js";
import { computeAvailability } from "./validate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Per-scope inputs to {@link mergeScopes}. */
interface MergeScopesInput {
  /** Presets from the global / user-scope file, in file order. */
  user: readonly Preset[];
  /** Presets from the project-scope file, in file order. */
  project: readonly Preset[];
}

/**
 * Merge two scopes into a single ordered list.
 *
 * Globals are emitted first, then projects, each preserving file order.
 * Globals that share a name with a project entry are tagged
 * `shadowed: true` (still emitted, never dropped). Availability is
 * computed for every entry.
 */
export function mergeScopes(
  input: MergeScopesInput,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): LoadedPreset[] {
  const projectNames = new Set(input.project.map((preset) => preset.name));
  const out: LoadedPreset[] = [];

  for (const userPreset of input.user) {
    out.push({
      ...userPreset,
      scope: "user",
      ...(projectNames.has(userPreset.name) ? { shadowed: true } : {}),
      ...availabilityField(userPreset, ctx),
    });
  }

  for (const projectPreset of input.project) {
    out.push({
      ...projectPreset,
      scope: "project",
      ...availabilityField(projectPreset, ctx),
    });
  }

  return out;
}

/**
 * Spread-helper that returns either `{}` or `{ unavailable: <reason> }`.
 *
 * Keeps `LoadedPreset.unavailable` cleanly absent for available presets
 * (rather than serializing `unavailable: undefined`) and avoids the
 * caller having to do conditional assignment at every call site.
 */
function availabilityField(
  preset: Pick<Preset, "provider" | "model">,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): { unavailable?: "no-key" | "no-model" } {
  const reason = computeAvailability(preset, ctx);

  return reason ? { unavailable: reason } : {};
}
