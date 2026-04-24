## Why

This is the second of seven changes building `pi-presets-plus` (see `openspec/breakdown.md`). The package shell exists from change 1 but does nothing useful. This change introduces the storage layer: reading preset definitions from versioned JSON files in two scopes (global and project), validating their shape, computing availability, merging the two scopes with shadowing, and writing changes back atomically. It also exposes a text-only `/presets list` subcommand so users can verify storage works end-to-end before any UI exists.

## What Changes

- Add `src/types.ts` types: `Preset`, `PresetsFile`, `PresetScope`, `LoadedPreset`, `ThinkingLevel`. (No `ActivePresetState` yet — that arrives in change 3.)
- Add `src/store/paths.ts` exporting helpers for the two storage paths: `~/.pi/agent/presets-plus/presets.json` (global) and `<cwd>/.pi/presets-plus/presets.json` (project).
- Add `src/store/load.ts` that reads both files, parses JSON, validates `version: 1`, tags scopes, applies shadowing rules, and returns a single ordered `LoadedPreset[]`.
- Add `src/store/validate.ts` exporting `validatePresetShape(p)` (required fields, enum check, no duplicate names within file) and `computeAvailability(p, ctx)` (returns `"no-model" | "no-key" | undefined`).
- Add `src/store/save.ts` implementing atomic writes (write-tmp, fsync, rename) for both scope files, creating parent directories as needed.
- Add `src/store/api.ts` exposing the storage API to the rest of the extension: `loadAll(ctx)`, `saveScope(scope, presets, ctx)`, `addPreset(p, scope, ctx)`, `updatePreset(name, scope, p, ctx)`, `removePreset(name, scope, ctx)`, `reorderWithinScope(scope, names, ctx)`. These operate on the in-memory store and persist via atomic writes.
- Reload preset files during `session_start` and during `ctx.reload()` (no caches survive reload).
- Replace the no-op `/presets` handler from change 1 with subcommand routing for **just** `/presets list` (text dump), `/presets reload` (force reload from disk), and the bare `/presets` invocation (still shows a "no UI yet, use list" notification). All other subcommands remain reserved for later changes.
- Add unit tests for load/validate/merge/save covering all spec scenarios.

## Capabilities

### New Capabilities

- `preset-storage`: Read/write versioned JSON files in global and project scopes; validation and availability computation; atomic writes; merge with shadowing; reload on session_start.

### Modified Capabilities

(None in delta-spec form. The `/presets` command's behavior is extended in this change — it now routes `list` and `reload` subcommands — but the new behavior is captured under `preset-storage` requirements rather than as a delta against `presets-package`. When change 1's specs are archived to `openspec/specs/`, change 2's storage spec will already cover the routing additions.)

## Impact

- **New filesystem files** (created lazily on first save): `~/.pi/agent/presets-plus/presets.json`, `.pi/presets-plus/presets.json`. Neither is created by this change unless the user explicitly invokes a save-causing operation, which is not exposed yet — load is the only operation users can trigger here.
- **No coexistence concerns**: paths are distinct from the example `preset.ts`'s `~/.pi/agent/presets.json` and `.pi/presets.json`.
- **No model, thinking, tools, or system-prompt changes** in this change. Activation arrives in change 3.
- **Test surface added**: `tests/store/` for unit tests of load, validate, merge, save.
