/**
 * Combines the two scope files into the single ordered `LoadedPreset[]`
 * that `loadAll` returns, tagging each entry with its scope, its
 * shadowing, and its availability.
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
 * A global preset that shares a name with a project entry is tagged
 * `shadowed: true` and still emitted. Availability is computed for every
 * entry.
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
 * Return `{ unavailable: <reason> }` for a preset that cannot be
 * activated, and `{}` otherwise so the field stays absent rather than
 * spreading as `unavailable: undefined`.
 */
function availabilityField(
  preset: Pick<Preset, "provider" | "model">,
  ctx: Pick<ExtensionContext, "modelRegistry">,
): { unavailable?: "no-key" | "no-model" } {
  const reason = computeAvailability(preset, ctx);

  return reason ? { unavailable: reason } : {};
}
