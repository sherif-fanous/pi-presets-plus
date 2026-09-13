/**
 * Loads and mutates consolidated configuration across both scopes.
 * Every operation reads current files again so reloads and direct edits take effect.
 */
import { analyzeHotkeys, type HotkeyAnalysis } from "../hotkey-registry.js";
import type {
  LoadedPreset,
  Preset,
  PresetScope,
  ScopeConfig,
} from "../types.js";
import { loadScope } from "./config.js";
import { mergeScopes } from "./merge.js";
import { getGlobalConfigPath, getProjectConfigPath } from "./paths.js";
import { loadPolicy } from "./policy.js";
import { atomicWrite } from "./save.js";
import { computeClampWarning } from "./validate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Result of loading all presets. */
export interface LoadAllResult {
  readonly hotkeyAnalysis: HotkeyAnalysis;
  readonly presets: LoadedPreset[];
  readonly showInactiveStatus: boolean;
  readonly warnings: string[];
}
/** Result type for mutating operations. */
export type SaveResult = { ok: true } | { ok: false; reason: string };
/** Subset of context needed by storage operations. */
type StorageContext = Pick<ExtensionContext, "cwd" | "modelRegistry">;
/** Test seam for move writes. */
type WriteScope = (
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
  previousDocument: ScopeConfig["document"],
) => Promise<void>;

/** Append a preset to a safe scope. */
export async function addPreset(
  preset: Preset,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  if (loaded.presets.some((existing) => existing.name === preset.name)) {
    return {
      ok: false,
      reason: `A preset named "${preset.name}" already exists in scope "${scope}".`,
    };
  }

  await writeDocument(
    scope,
    loaded.document,
    [...loaded.presets, preset],
    ctx,
    loaded.path,
  );

  return { ok: true };
}

/** Load both consolidated scopes, preserving user then project merge order. */
export async function loadAll(ctx: StorageContext): Promise<LoadAllResult> {
  const [user, project] = await Promise.all([
    loadScope("user", ctx.cwd),
    loadScope("project", ctx.cwd),
  ]);
  // Policy warnings for the user scope belong to loadPolicy. The project
  // scope has no other reader, so its policy warnings surface here.
  const warnings = [
    ...loadableWarnings(user),
    ...loadableWarnings(project),
    ...project.warnings.policy,
  ];
  const presets = mergeScopes(
    { user: user.presets, project: project.presets },
    ctx,
  ).map((preset) => ({
    ...preset,
    ...(computeClampWarning(preset, ctx)
      ? { clampWarning: true as const }
      : {}),
  }));

  return {
    hotkeyAnalysis: analyzeHotkeys(presets),
    presets,
    showInactiveStatus:
      project.showInactiveStatus ?? user.showInactiveStatus ?? true,
    warnings,
  };
}

/** Move a preset between scopes and restore the complete destination on source failure. */
export async function movePreset(
  oldName: string,
  sourceScope: PresetScope,
  destinationScope: PresetScope,
  nextPreset: Preset,
  ctx: StorageContext,
  writeScope: WriteScope = saveScope,
): Promise<SaveResult> {
  if (sourceScope === destinationScope)
    return {
      ok: false,
      reason: "Source and destination scopes must be different.",
    };

  const [source, destination] = await Promise.all([
    readScope(sourceScope, ctx),
    readScope(destinationScope, ctx),
  ]);

  if ("ok" in source) return source;
  if ("ok" in destination) return destination;

  const sourceIndex = source.presets.findIndex(
    (preset) => preset.name === oldName,
  );

  if (sourceIndex < 0)
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${sourceScope}".`,
    };

  if (destination.presets.some((preset) => preset.name === nextPreset.name)) {
    return {
      ok: false,
      reason: `A preset named "${nextPreset.name}" already exists in scope "${destinationScope}".`,
    };
  }

  const nextSource = source.presets.filter(
    (_preset, index) => index !== sourceIndex,
  );

  await writeScope(
    destinationScope,
    [...destination.presets, nextPreset],
    ctx,
    destination.document,
  );

  try {
    await writeScope(sourceScope, nextSource, ctx, source.document);
  } catch (sourceError) {
    try {
      await writeScope(
        destinationScope,
        destination.presets,
        ctx,
        destination.document,
      );
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

/** Remove a preset by name, treating an absent name as a no-op. */
export async function removePreset(
  name: string,
  scope: PresetScope,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const next = loaded.presets.filter((preset) => preset.name !== name);

  if (next.length !== loaded.presets.length)
    await writeDocument(scope, loaded.document, next, ctx, loaded.path);

  return { ok: true };
}

/** Reorder one scope while retaining omitted entries in their original order. */
export async function reorderWithinScope(
  scope: PresetScope,
  orderedNames: readonly string[],
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const byName = new Map(
    loaded.presets.map((preset) => [preset.name, preset] as const),
  );
  const seen = new Set<string>();
  const next: Preset[] = [];

  for (const name of orderedNames) {
    const preset = byName.get(name);

    if (preset && !seen.has(name)) {
      next.push(preset);
      seen.add(name);
    }
  }

  for (const preset of loaded.presets)
    if (!seen.has(preset.name)) next.push(preset);
  await writeDocument(scope, loaded.document, next, ctx, loaded.path);

  return { ok: true };
}

/** Replace only a scope's presets section, preserving the complete loaded document. */
export async function saveScope(
  scope: PresetScope,
  presets: readonly Preset[],
  ctx: StorageContext,
  previousDocument: ScopeConfig["document"],
): Promise<void> {
  await writeDocument(scope, previousDocument, presets, ctx);
}

/** Project a preset onto its persisted fields. */
export function toPersistedPreset(preset: Preset): Preset {
  const output: Preset = {
    name: preset.name,
    provider: preset.provider,
    model: preset.model,
  };

  if (preset.thinkingLevel !== undefined)
    output.thinkingLevel = preset.thinkingLevel;
  if (preset.tools !== undefined) output.tools = [...preset.tools];
  if (preset.instructions !== undefined)
    output.instructions = preset.instructions;
  if (preset.hotkey !== undefined) output.hotkey = preset.hotkey;
  if (preset.order !== undefined) output.order = preset.order;

  return output;
}

/** Replace an existing preset in place, including renames without reordering. */
export async function updatePreset(
  oldName: string,
  scope: PresetScope,
  nextPreset: Preset,
  ctx: StorageContext,
): Promise<SaveResult> {
  const loaded = await readScope(scope, ctx);

  if ("ok" in loaded) return loaded;

  const index = loaded.presets.findIndex((preset) => preset.name === oldName);

  if (index < 0)
    return {
      ok: false,
      reason: `No preset named "${oldName}" exists in scope "${scope}".`,
    };

  if (
    nextPreset.name !== oldName &&
    loaded.presets.some(
      (preset, i) => i !== index && preset.name === nextPreset.name,
    )
  ) {
    return {
      ok: false,
      reason: `A preset named "${nextPreset.name}" already exists in scope "${scope}".`,
    };
  }

  const next = [...loaded.presets];

  next[index] = nextPreset;
  await writeDocument(scope, loaded.document, next, ctx, loaded.path);

  return { ok: true };
}

/** Warnings from the sections every scope loads, leaving policy aside. */
function loadableWarnings(loaded: ScopeConfig): string[] {
  return [
    ...loaded.warnings.file,
    ...loaded.warnings.settings,
    ...loaded.warnings.presets,
  ];
}

function pathForScope(scope: PresetScope, ctx: StorageContext): string {
  return scope === "user"
    ? getGlobalConfigPath()
    : getProjectConfigPath(ctx.cwd);
}

async function readScope(
  scope: PresetScope,
  ctx: StorageContext,
): Promise<(ScopeConfig & { path: string }) | { ok: false; reason: string }> {
  const path = pathForScope(scope, ctx);
  const result = await loadScope(scope, ctx.cwd);
  // Compiled-rule warnings only come from loadPolicy, which also carries
  // the user policy bucket, so the raw bucket is read here for project only.
  const policyWarnings =
    scope === "user"
      ? (await loadPolicy(undefined, ctx.cwd)).warnings
      : result.warnings.policy;
  const warnings = [...loadableWarnings(result), ...policyWarnings];

  if (warnings.length > 0) {
    return {
      ok: false,
      reason: `Pi Presets Plus did not change the ${scope} configuration file at ${path}. It could not load the complete file. Fix the file and try again.`,
    };
  }

  return { ...result, path };
}

async function writeDocument(
  scope: PresetScope,
  document: ScopeConfig["document"],
  presets: readonly Preset[],
  ctx: StorageContext,
  targetPath: string = pathForScope(scope, ctx),
): Promise<void> {
  const nextDocument = {
    ...document,
    version: 2,
    presets: presets.map(toPersistedPreset),
  };

  await atomicWrite(targetPath, `${JSON.stringify(nextDocument, null, 2)}\n`);
}
