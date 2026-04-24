/**
 * High-level storage API consumed by the rest of the extension.
 *
 * The lower-level modules in this folder (`paths`, `validate`, `load`,
 * `merge`, `save`) are pure / single-purpose. This module composes them
 * into the operations later changes will call:
 *
 * - `loadAll(ctx)`           — read both scopes, merge, return ordered list
 * - `saveScope(scope, ...)`  — atomic-write a full scope file
 * - `addPreset` / `updatePreset` / `removePreset` / `reorderWithinScope`
 *                              — CRUD primitives that read-modify-write the
 *                                affected scope's file only
 *
 * Each mutating operation re-reads from disk (no in-memory cache) so
 * callers always operate against the latest committed state. Mutations
 * that would violate the file's invariants (e.g. duplicate name) return
 * an `Err` result instead of throwing — UI callers in later changes can
 * map these to user-facing notifications without try/catch boilerplate.
 */
import type {
  LoadedPreset,
  Preset,
  PresetScope,
  PresetsFile,
} from "../types.js";
import { loadFile } from "./load.js";
import { mergeScopes } from "./merge.js";
import { getGlobalPresetsPath, getProjectPresetsPath } from "./paths.js";
import { atomicWrite } from "./save.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Result of {@link loadAll}. */
export interface LoadAllResult {
  presets: LoadedPreset[];
  warnings: string[];
}
/** Result type for mutating operations: success carries no payload. */
export type SaveResult = { ok: true } | { ok: false; reason: string };
/** Subset of `ExtensionContext` the storage API actually needs. */
export type StorageContext = Pick<ExtensionContext, "cwd" | "modelRegistry">;

/**
 * Append a preset to the named scope.
 *
 * Returns an `Err` result when the new name collides with an existing
 * preset in the same scope. Callers in later UI changes can map this to
 * a friendly "name already exists" notification.
 */
export async function addPreset(
  preset: Preset,
  presetScope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const current = await readScope(presetScope, ctx);

  if (current.some((p) => p.name === preset.name)) {
    return {
      ok: false,
      reason: `A preset named "${preset.name}" already exists in scope "${presetScope}".`,
    };
  }

  const next = [...current, preset];

  await saveScope(presetScope, next, ctx);

  return { ok: true };
}

/**
 * Read both scope files and return the merged, ordered, scope-tagged
 * preset list with availability computed.
 */
export async function loadAll(ctx: StorageContext): Promise<LoadAllResult> {
  const [user, project] = await Promise.all([
    loadFile(getGlobalPresetsPath()),
    loadFile(getProjectPresetsPath(ctx.cwd)),
  ]);
  const presets = mergeScopes(
    { user: user.presets, project: project.presets },
    ctx,
  );

  return {
    presets,
    warnings: [...user.warnings, ...project.warnings],
  };
}

/**
 * Read a single scope file, ignoring warnings. Used by the CRUD helpers
 * which don't have a UI to surface warnings to. The next `loadAll` call
 * (and therefore the next `/presets list` / `/presets reload`) will see
 * any persistent warnings.
 */
async function readScope(
  presetScope: PresetScope,
  ctx: StorageContext,
): Promise<Preset[]> {
  const path = pathForScope(presetScope, ctx);
  const result = await loadFile(path);

  return result.presets;
}

/**
 * Remove a preset by name. No-op (returns `{ ok: true }`) when the named
 * preset does not exist; this matches the "idempotent delete" expectation
 * the spec calls out.
 */
export async function removePreset(
  name: string,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const current = await readScope(scope, ctx);
  const next = current.filter((p) => p.name !== name);

  if (next.length === current.length) return { ok: true };
  await saveScope(scope, next, ctx);

  return { ok: true };
}

/**
 * Reorder presets within a scope according to the supplied name list.
 *
 * Defensive behavior: any names not present in `orderedNames` keep their
 * relative file order and are appended after the explicitly-ordered
 * entries. Names in `orderedNames` that don't match any existing preset
 * are silently ignored — this matters when the caller's UI snapshot is
 * slightly stale (e.g. a delete happened between picker render and reorder
 * commit).
 */
export async function reorderWithinScope(
  scope: PresetScope,
  orderedNames: readonly string[],
  ctx: StorageContext,
): Promise<void> {
  const current = await readScope(scope, ctx);
  const byName = new Map(current.map((p) => [p.name, p] as const));
  const seen = new Set<string>();
  const ordered: Preset[] = [];

  for (const name of orderedNames) {
    const preset = byName.get(name);

    if (!preset || seen.has(name)) continue;
    ordered.push(preset);
    seen.add(name);
  }

  for (const preset of current) {
    if (!seen.has(preset.name)) {
      ordered.push(preset);
    }
  }

  await saveScope(scope, ordered, ctx);
}

/**
 * Atomically rewrite a single scope's file with the given preset list.
 *
 * The serialized shape is always `{ version: 1, presets }`; only typed
 * fields on `Preset` are emitted. Callers are responsible for ordering
 * and uniqueness; this function just persists.
 */
export async function saveScope(
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
): Promise<void> {
  const file: PresetsFile = {
    version: 1,
    presets: presets.map(serializePreset),
  };
  const path = pathForScope(scope, ctx);

  await atomicWrite(path, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * Replace an existing preset by name.
 *
 * Supports renaming: `next.name` may differ from `oldName`. Position in
 * the file is preserved. Returns `Err` when:
 * - no preset with `oldName` exists in `scope`
 * - the rename would collide with another preset's name
 */
export async function updatePreset(
  oldName: string,
  scope: PresetScope,
  next: Preset,
  ctx: StorageContext,
): Promise<SaveResult> {
  const current = await readScope(scope, ctx);
  const index = current.findIndex((p) => p.name === oldName);

  if (index === -1) {
    return {
      ok: false,
      reason: `No preset named "${oldName}" in scope "${scope}".`,
    };
  }

  if (
    next.name !== oldName &&
    current.some((p, i) => i !== index && p.name === next.name)
  ) {
    return {
      ok: false,
      reason: `A preset named "${next.name}" already exists in scope "${scope}".`,
    };
  }

  const updated = [...current];

  updated[index] = next;
  await saveScope(scope, updated, ctx);

  return { ok: true };
}

function pathForScope(presetScope: PresetScope, ctx: StorageContext): string {
  return presetScope === "user"
    ? getGlobalPresetsPath()
    : getProjectPresetsPath(ctx.cwd);
}

/**
 * Serialize a `Preset` into the on-disk shape, dropping `undefined`
 * fields so the JSON stays clean. Round-tripping `LoadedPreset`-derived
 * values (which carry merge metadata) strips `scope`, `shadowed`, and
 * `unavailable` automatically.
 */
function serializePreset(preset: Preset): Preset {
  const out: Preset = {
    name: preset.name,
    provider: preset.provider,
    model: preset.model,
  };

  if (preset.thinkingLevel !== undefined)
    out.thinkingLevel = preset.thinkingLevel;
  if (preset.tools !== undefined) out.tools = [...preset.tools];
  if (preset.instructions !== undefined) out.instructions = preset.instructions;
  if (preset.hotkey !== undefined) out.hotkey = preset.hotkey;
  if (preset.order !== undefined) out.order = preset.order;

  return out;
}
