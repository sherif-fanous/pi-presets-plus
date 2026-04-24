## 1. Types

- [x] 1.1 Extend `src/types.ts` with `Preset`, `PresetsFile`, `PresetScope`, `LoadedPreset`, `ThinkingLevel` types per design

## 2. Paths

- [x] 2.1 Create `src/store/paths.ts` with `getGlobalPresetsPath()` (uses `getAgentDir()` from `@mariozechner/pi-coding-agent`) and `getProjectPresetsPath(cwd)`
- [x] 2.2 Unit-test path resolution given a fake agent dir / cwd

## 3. Validation

- [x] 3.1 Create `src/store/validate.ts` exporting `validatePresetShape(p)` returning `{ ok: boolean; reason?: string }`
- [x] 3.2 Implement enum check for `thinkingLevel`
- [x] 3.3 Implement duplicate-name detection for an array of presets
- [x] 3.4 Implement `computeAvailability(p, ctx)` returning `"no-model" | "no-key" | undefined`
- [x] 3.5 Unit tests covering: minimal preset, missing required field, invalid thinking level, duplicate names, model not in registry, provider with no key, fully available preset

## 4. Load

- [x] 4.1 Create `src/store/load.ts` exporting `loadFile(path)` that returns `{ presets: Preset[]; warnings: string[] }` and treats missing/malformed files as empty with warnings
- [x] 4.2 Validate top-level shape and `version: 1`; treat unsupported versions as empty + warn
- [x] 4.3 Apply per-preset shape validation; collect warnings; skip invalid presets
- [x] 4.4 Unit tests for: missing file, invalid JSON, unsupported version, missing top-level fields, mix of valid and invalid presets in one file

## 5. Merge

- [x] 5.1 Create `src/store/merge.ts` exporting `mergeScopes({ user, project }, ctx)` returning a `LoadedPreset[]`
- [x] 5.2 Tag each preset with its scope; preserve file order within each scope (globals first, then projects)
- [x] 5.3 Apply availability via `computeAvailability`
- [x] 5.4 Apply shadowing: when a project preset shares a name with a global preset, mark the global as `shadowed: true`
- [x] 5.5 Unit tests for shadowing, ordering, and availability tagging

## 6. Save

- [x] 6.1 Create `src/store/save.ts` exporting `atomicWrite(path, contents)` (mkdir, tmp file, fsync, rename)
- [x] 6.2 Unique tmp-file naming using PID + timestamp
- [x] 6.3 Unit test that simulating a crash between write and rename leaves the destination unchanged
- [x] 6.4 Unit test that the destination contains exactly the requested contents on success

## 7. Storage API

- [x] 7.1 Create `src/store/api.ts` exporting `loadAll`, `saveScope`, `addPreset`, `updatePreset`, `removePreset`, `reorderWithinScope`
- [x] 7.2 `loadAll(ctx)` reads both files via `loadFile`, runs `mergeScopes`, returns `{ presets, warnings }`
- [x] 7.3 `saveScope(scope, presets, ctx)` serializes to `PresetsFile` shape and atomic-writes the appropriate file
- [x] 7.4 `addPreset` reads, appends, writes; refuses on name collision within the chosen scope (returns an error result, not a throw, for caller-friendly handling in later UI changes)
- [x] 7.5 `updatePreset` supports renaming (caller passes old name + new preset)
- [x] 7.6 `removePreset` removes by name within scope; no-op if missing
- [x] 7.7 `reorderWithinScope` accepts an ordered list of names; preserves any names not mentioned at the end (defensive)
- [x] 7.8 Unit tests for all CRUD primitives covering happy path, name collision, missing target, and idempotency where applicable

## 8. Command routing

- [x] 8.1 Update `src/index.ts` to route `/presets` arguments to `list`, `reload`, or the bare-invocation handler
- [x] 8.2 Implement `getArgumentCompletions` returning `list` and `reload` subcommands filtered by prefix
- [x] 8.3 Implement `runList(ctx)` that calls `loadAll` and prints a multi-line text block per preset (name, scope badge, provider/model, thinking, tools count or "inherit", hotkey, availability indicator, shadowed indicator)
- [x] 8.4 Implement `runReload(ctx)` that calls `loadAll` and shows a notification with the loaded count and any warnings
- [x] 8.5 Update the bare-invocation handler to point users at `/presets list` and `/presets reload`

## 9. Session lifecycle

- [x] 9.1 In `session_start`, call `loadAll(ctx)` once and surface any warnings via a single rolled-up notification
- [x] 9.2 Verify that `ctx.reload()` causes a fresh `loadAll` (no caches survive)

## 10. Manual verification

- [x] 10.1 Hand-create a `~/.pi/agent/presets-plus/presets.json` with two valid presets; run `/presets list`; verify output
- [x] 10.2 Hand-create a project file at `.pi/presets-plus/presets.json` with one preset that shares a name with a global; verify shadowing in `/presets list`
- [x] 10.3 Hand-edit the file to introduce a syntax error; run `/presets reload`; verify a warning fires and previously-loaded presets are not lost from disk
- [x] 10.4 Run a CRUD operation via a tiny test harness (`addPreset`, `updatePreset`, `removePreset`, `reorderWithinScope`) and verify the file contents update correctly
- [x] 10.5 Verify availability flags for: a preset with a working provider/model, a preset with a missing model, a preset with a model whose provider has no API key
