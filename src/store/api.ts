/**
 * Reads and mutates presets across both scopes through `loadAll`,
 * `saveScope`, and the create, update, delete, move, and reorder
 * primitives. Every call re-reads from disk, and a mutation that would
 * break a file invariant returns an error result instead of throwing.
 */
import { analyzeHotkeys, type HotkeyAnalysis } from "../hotkey-registry.js";
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
import { computeClampWarning } from "./validate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Result of {@link loadAll}. */
interface LoadAllResult {
  hotkeyAnalysis: HotkeyAnalysis;
  presets: LoadedPreset[];
  warnings: string[];
}
/** Result type for mutating operations: success carries no payload. */
type SaveResult = { ok: true } | { ok: false; reason: string };
/** Presets read from one scope, or the reason the read is not usable. */
type ScopeReadResult =
  | { ok: true; presets: Preset[] }
  | { ok: false; reason: string };
/** Subset of `ExtensionContext` the storage API actually needs. */
type StorageContext = Pick<ExtensionContext, "cwd" | "modelRegistry">;
/** Persists one scope's preset list; the seam `movePreset` writes through. */
type WriteScope = (
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
) => Promise<void>;

/**
 * Append a preset to the named scope.
 *
 * Returns an error result when the name collides with a preset that
 * already exists in the same scope.
 */
export async function addPreset(
  preset: Preset,
  presetScope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(presetScope, ctx);

  if (!loaded.ok) return loaded;

  const current = loaded.presets;

  if (current.some((existing) => existing.name === preset.name)) {
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
  ).map((preset) => ({
    ...preset,
    ...(computeClampWarning(preset, ctx)
      ? { clampWarning: true as const }
      : {}),
  }));

  const hotkeyAnalysis = analyzeHotkeys(presets);

  return {
    hotkeyAnalysis,
    presets,
    warnings: [...user.warnings, ...project.warnings],
  };
}

/**
 * Move a preset between scopes, preserving the source until the destination
 * write succeeds. If the source write fails, restore the previous destination
 * contents before rethrowing the source error.
 */
export async function movePreset(
  oldName: string,
  sourceScope: PresetScope,
  destinationScope: PresetScope,
  next: Preset,
  ctx: StorageContext,
  writeScope: WriteScope = saveScope,
): Promise<SaveResult> {
  if (sourceScope === destinationScope) {
    return {
      ok: false,
      reason: "Source and destination scopes must be different.",
    };
  }

  const [loadedSource, loadedDestination] = await Promise.all([
    readScope(sourceScope, ctx),
    readScope(destinationScope, ctx),
  ]);

  if (!loadedSource.ok) return loadedSource;
  if (!loadedDestination.ok) return loadedDestination;

  const source = loadedSource.presets;
  const destination = loadedDestination.presets;
  const sourceIndex = source.findIndex((preset) => preset.name === oldName);

  if (sourceIndex === -1) {
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${sourceScope}".`,
    };
  }

  if (destination.some((preset) => preset.name === next.name)) {
    return {
      ok: false,
      reason: `A preset named "${next.name}" already exists in scope "${destinationScope}".`,
    };
  }

  const nextSource = source.filter((_preset, index) => index !== sourceIndex);

  await writeScope(destinationScope, [...destination, next], ctx);

  try {
    await writeScope(sourceScope, nextSource, ctx);
  } catch (sourceError) {
    try {
      await writeScope(destinationScope, destination, ctx);
    } catch (rollbackError) {
      throw new AggregateError(
        [sourceError, rollbackError],
        "The preset move failed, and Pi Presets Plus could not restore the destination scope.",
        { cause: rollbackError },
      );
    }

    throw sourceError;
  }

  return { ok: true };
}

/**
 * Remove a preset by name.
 *
 * Removing a name that does not exist succeeds and leaves the file alone.
 */
export async function removePreset(
  name: string,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if (!loaded.ok) return loaded;

  const current = loaded.presets;
  const next = current.filter((existing) => existing.name !== name);

  if (next.length === current.length) return { ok: true };
  await saveScope(scope, next, ctx);

  return { ok: true };
}

/**
 * Reorder a scope's presets to follow `orderedNames`.
 *
 * Names missing from `orderedNames` keep their relative file order and
 * follow the ordered entries. Names matching no preset are ignored, so a
 * caller whose snapshot went stale still gets a usable write.
 */
export async function reorderWithinScope(
  scope: PresetScope,
  orderedNames: readonly string[],
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if (!loaded.ok) return loaded;

  const current = loaded.presets;
  const byName = new Map(
    current.map((preset) => [preset.name, preset] as const),
  );
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

  return { ok: true };
}

/**
 * Atomically rewrite a single scope's file with the given preset list.
 *
 * The serialized shape is always `{ version: 1, presets }` carrying only
 * the fields `Preset` declares. The caller owns ordering and uniqueness.
 */
export async function saveScope(
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
): Promise<void> {
  const file: PresetsFile = {
    version: 1,
    presets: presets.map(toPersistedPreset),
  };
  const path = pathForScope(scope, ctx);

  await atomicWrite(path, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * Project any `Preset`-shaped value onto the on-disk shape.
 *
 * Undefined optional fields drop out, `tools` is copied so later mutation
 * of the source cannot reach persisted state, and merge metadata such as
 * `scope`, `shadowed`, `unavailable`, and the hotkey annotations falls
 * away because `Preset` does not declare it. Every preset headed for disk
 * or compared against an on-disk shape passes through here, so a caller
 * that needs to drop more fields does so before calling.
 */
export function toPersistedPreset(preset: Preset): Preset {
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

/**
 * Replace an existing preset by name.
 *
 * `next.name` may differ from `oldName` to rename the preset, which keeps
 * its position in the file. Returns an error result when no preset named
 * `oldName` exists in `scope`, or when the new name collides with another
 * preset in that scope.
 */
export async function updatePreset(
  oldName: string,
  scope: PresetScope,
  next: Preset,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if (!loaded.ok) return loaded;

  const current = loaded.presets;
  const index = current.findIndex((existing) => existing.name === oldName);

  if (index === -1) {
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${scope}".`,
    };
  }

  if (
    next.name !== oldName &&
    current.some(
      (existing, existingIndex) =>
        existingIndex !== index && existing.name === next.name,
    )
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

/** Read a scope only when every entry can survive a later rewrite. */
async function readScope(
  presetScope: PresetScope,
  ctx: StorageContext,
): Promise<ScopeReadResult> {
  const path = pathForScope(presetScope, ctx);
  const result = await loadFile(path);

  if (result.warnings.length > 0) {
    return {
      ok: false,
      reason: `Pi Presets Plus did not change the ${presetScope} preset file at ${path}. It could not load the complete file. Fix the file and try again.`,
    };
  }

  return { ok: true, presets: result.presets };
}
