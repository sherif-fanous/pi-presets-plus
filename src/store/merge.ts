/**
 * Scope merge for preset storage.
 *
 * Given the per-scope outputs of {@link import("./load.js").loadFile},
 * `mergeScopes` produces the single ordered `LoadedPreset[]` returned by
 * `loadAll`. The order, scope tagging, shadowing, and availability rules
 * are all defined by the storage spec:
 *
 * - Tag each preset with its scope.
 * - Order: globals first (file order), then projects (file order).
 * - When a project preset shares a name with a global preset, the global
 *   stays in the list with `shadowed: true`. The project entry is the one
 *   that activation will consult later.
 * - Each entry's `unavailable` field is computed via `computeAvailability`.
 *
 * Pure (no I/O, no logging). Warning collection happens in `loadFile`.
 */
import type { LoadedPreset, Preset } from "../types.js";
import { computeAvailability } from "./validate.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Per-scope inputs to {@link mergeScopes}. */
export interface MergeScopesInput {
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
  const projectNames = new Set(input.project.map((p) => p.name));
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
