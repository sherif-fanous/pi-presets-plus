## 1. Preparation: shared domain primitive

- [x] 1.1 Create `src/preset-identity.ts` exporting `interface PresetIdentity`, `findPreset<T extends PresetIdentity>(presets, identity)`, and `samePresetIdentity(a, b)`. Module-level JSDoc per the AGENTS.md "owns / does not own" rule.
- [x] 1.2 Add `tests/preset-identity.test.ts` covering: `findPreset` returns `undefined` for missing, returns the right entry when name+scope both match, does not match when only one of name/scope matches, returns the typed `LoadedPreset` when given `LoadedPreset[]`. `samePresetIdentity` covers undefined inputs.
- [x] 1.3 Run `mise run check`. Fix any lint / format / type issues from the new file.

## 2. Replace duplicated identity-equality lookups

- [x] 2.1 In `src/index.ts` `restoreActiveFromBranch`, replace the inline `presets.find((candidate) => candidate.name === data.name && candidate.scope === (data.scope ?? "user"))` with `findPreset(presets, { name: data.name, scope: data.scope ?? "user" })`.
- [x] 2.2 In `src/index.ts` `before_agent_start`, replace the `presets.find` call with `findPreset(presets, active)`.
- [x] 2.3 In `src/commands/presets/status.ts` `formatStatusBody`, replace the `presets.find` call with `findPreset(presets, active)`.
- [x] 2.4 In `src/hotkeys.ts` per-press handler, replace the `currentPresets.find` call with `findPreset(currentPresets, { name: registeredName, scope: registeredScope })`. (This file will be deleted in section 5; doing the rewrite first keeps the diff for the deletion focused.)
- [x] 2.5 In `src/activation/apply.ts` `apply`, replace the `current?.name === preset.name && current.scope === preset.scope` identity-equality with `samePresetIdentity(current, preset)`.
- [x] 2.6 Audit the rest of `src/` (picker, editor) for the same pattern with `rg "name === .*\.name" src/ tests/` style searches; rewrite any remaining occurrences.
- [x] 2.7 Run `mise run check` and verify all existing tests still pass with no golden edits required.

## 3. Status renderer becomes a pure formatter

- [x] 3.1 In `src/ui/status.ts`, rewrite the public surface to export only `STATUS_KEY` and `renderStatusBadge(active: ActivePresetState | undefined, theme: Theme | undefined): string`. Remove the `updateStatus(ctx, active, lookup)` runner.
- [x] 3.2 Update `tests/ui/status.test.ts` to assert on the pure formatter directly. Remove any tests that constructed lookup callbacks; their coverage is duplicated by the formatter test.
- [x] 3.3 Temporarily route every existing `updateStatus(ctx, active, lookup)` call site (in `apply.ts`, `clear.ts`, `dirty.ts`, `index.ts`) through an inline `ctx.ui.setStatus(STATUS_KEY, renderStatusBadge(active, ctx.ui.theme))` until section 4 absorbs them into the session class. This keeps `mise run check` green between commits.
- [x] 3.4 Run `mise run check`.

## 4. Introduce `ActivePresetSession` class

- [x] 4.1 Create `src/activation/session.ts` exporting `class ActivePresetSession`. Move the active-preset cell, the `selfTriggeredModelSetDepth` counter (rename to instance field), the dirty/clean transitions, the `withSelfTriggeredModelSet` / `isSelfTriggered` API, and a one-line `setStatus` runner that calls `ctx.ui.setStatus(STATUS_KEY, renderStatusBadge(active, ctx.ui.theme))`. Module-level JSDoc per the AGENTS.md convention.
- [x] 4.2 Add `session.start({ preset, baseline, lastApplied, owned }, ctx, pi)` that writes the cell, calls `pi.appendEntry("presets-plus:active", { name, scope })`, and refreshes the badge. Add `session.clear(ctx, pi)` that clears the cell, calls `pi.appendEntry("presets-plus:active", { name: null })`, and refreshes the badge.
- [x] 4.3 Add `session.markDirty(ctx)` and `session.markClean(ctx)` that flip the dirty flag and refresh the badge. Preserve the existing JSDoc rationale ("preserve restore discriminator").
- [x] 4.4 Add `session.restoreFromBranch(branch, presets): { state: ActivePresetState | undefined; warnings: string[] }`. Move the body of `restoreActiveFromBranch` from `index.ts` here, returning composed warning strings instead of calling `ctx.ui.notify`.
- [x] 4.5 Add `session.current(): ActivePresetState | undefined` (replaces `getActive()` for consumers).
- [x] 4.6 Update `src/activation/apply.ts`: take `session: ActivePresetSession` as the new last parameter. Replace `getActive()` with `session.current()`. Replace `setActive(...)` + `pi.appendEntry(...)` + `updateStatus(...)` with `session.start({...})`. Replace `withSelfTriggeredModelSet` import with the session method. Drop the module-level counter.
- [x] 4.7 Update `src/activation/clear.ts`: take `session` parameter on `clear` and `clearReturning`. Replace `clearActive()` + `pi.appendEntry({name:null})` + `updateStatus(...)` with `session.clear(ctx, pi)`. Remove the now-unused `getActive` import.
- [x] 4.8 Update `src/activation/drift-handlers.ts`: take `session` parameter on `handleModelSelectDrift` and `syncDirtyFromCurrentState`. Replace `getActive()` with `session.current()` and `isSelfTriggeredModelSet()` with `session.isSelfTriggered()`. Replace `markClean(ctx)` / `markDirty(ctx)` from `dirty.ts` with `session.markClean(ctx)` / `session.markDirty(ctx)`.
- [x] 4.9 Update `src/flag.ts`: take `session` parameter on `applyPresetFlag`; pass it through to `apply`.
- [x] 4.10 Update `src/commands/presets/clear.ts`, `src/commands/presets/router.ts`, `src/commands/presets/status.ts` (status reads `session.current()` instead of `getActive()`).
- [x] 4.11 Update `src/index.ts`: instantiate `const session = new ActivePresetSession()` once at the top of `presetsPlus(pi)`; thread it into every handler. Replace `restoreActiveFromBranch` body with `const { warnings } = session.restoreFromBranch(...); surfaceWarnings(ctx, warnings)`.
- [x] 4.12 Update `src/ui/picker.ts` and `src/ui/editor.ts` to take or import `session` for the activation/clear flows they invoke. (Picker: `clearReturning(ctx, pi, session)`, `apply(preset, ctx, pi, session)`. Editor: same for the test/save apply flows.)
- [x] 4.13 Delete `src/activation/active-state.ts` and `src/activation/dirty.ts`.
- [x] 4.14 Move `tests/activation/dirty.test.ts` to `tests/activation/session.test.ts` and rewrite to construct a fresh `ActivePresetSession` per case. Add tests for `start`, `clear`, `markDirty`/`markClean`, `restoreFromBranch` (including the not-loaded and unavailable warning paths).
- [x] 4.15 Run `mise run check`. Fix any breakage. Verify no golden test edits were required.

## 5. Introduce `HotkeyRegistry` class

- [x] 5.1 Create `src/hotkey-registry.ts` consolidating the contents of `src/hotkey-conflicts.ts`, `src/hotkeys.ts`, and `src/hotkey-reload-baseline.ts`. Module-level JSDoc per the AGENTS.md convention.
- [x] 5.2 Move the `HotkeyAnalysis`, `HotkeyConflict`, `HotkeyDiagnostic` interfaces and the `formatPresetIdentity` and `hotkeyChanged` helpers into `hotkey-registry.ts`. Import `PresetIdentity` from `src/preset-identity.ts`. Re-export `PresetIdentity`, `formatPresetIdentity`, and `hotkeyChanged` for downstream consumers.
- [x] 5.3 Define `class HotkeyRegistry` with `runtimeHotkeys: Map<string, string | undefined>` and `acknowledgedPendingHotkeys: Map<string, string | undefined>` as private instance fields.
- [x] 5.4 Implement `analyze(presets: LoadedPreset[]): HotkeyAnalysis` (body of today's `annotateAndAnalyzeHotkeys`).
- [x] 5.5 Implement `bindForSession(presets, analysis, ctx, pi, loadCurrent)` (body of today's `registerHotkeys`, plus an internal call to populate `runtimeHotkeys` from `presets` — what was `setRuntimeHotkeyBaseline`). Activation handlers SHALL pass `session` through to `apply`; the closure captures `session` from the outer `bindForSession` call.
- [x] 5.6 Implement `saveNeedsReload`, `deleteNeedsReload`, `recordReloadPromptDeclined` (bodies of today's matching free functions in `hotkey-reload-baseline.ts`, with `runtimeHotkeyFor`, `runtimeMatches`, `commitNeedsHotkeyReload`, `acknowledgedPendingHotkeyMatches`, `identityChanged`, `presetKey` becoming private methods).
- [x] 5.7 Update `src/index.ts`: instantiate `const hotkeys = new HotkeyRegistry()`; call `hotkeys.bindForSession(...)` in place of `registerHotkeys(...)` + `setRuntimeHotkeyBaseline(...)`. Pass `session` to the registry so its activation handlers can forward it.
- [x] 5.8 Update `src/store/api.ts` `loadAll` to accept (or take via DI parameter) the `HotkeyRegistry` instance and call `hotkeys.analyze(presets)` instead of the standalone `annotateAndAnalyzeHotkeys`. Choice: pass as a second argument with sensible default for tests, or accept a small `analyzeHotkeys` callback. Prefer the latter to keep `loadAll` decoupled from the class shape; the index.ts caller binds `hotkeys.analyze.bind(hotkeys)`.
- [x] 5.9 Update `src/ui/editor.ts` and `src/ui/picker.ts` to import `saveNeedsReload`, `deleteNeedsReload`, `recordReloadPromptDeclined`, `formatPresetIdentity`, `hotkeyChanged` from `src/hotkey-registry.ts`. The registry instance is threaded through their call paths the same way `session` is.
- [x] 5.10 Delete `src/hotkey-conflicts.ts`, `src/hotkey-reload-baseline.ts`, and `src/hotkeys.ts`.
- [x] 5.11 Move `tests/hotkey-conflicts.test.ts` and `tests/hotkeys.test.ts` to `tests/hotkey-registry.test.ts`. Rewrite to construct a fresh `HotkeyRegistry` per case; remove all imports of `clearRuntimeHotkeyBaseline`. Cover: `analyze` annotates / does not annotate shadowed entries / handles invalid hotkeys / reports conflicts; `bindForSession` registers + emits notifications + populates baseline; `saveNeedsReload` and `deleteNeedsReload` decision matrix; `recordReloadPromptDeclined` suppresses re-prompts.
- [x] 5.12 Run `mise run check`. Fix any breakage. Verify no golden test edits were required.

## 6. Split clear-summary renderer

- [x] 6.1 Create `src/ui/clear-summary.ts` and move `renderClearSummary`, `chooseClearLead`, `formatRowValue`, `formatModel`, `formatTools`, `isKeptLike`, `isRestoreLike`, the `Styler` type, `IDENTITY_STYLER`, `normalizeStyler`, and the `FIELD_LABELS` table from `src/activation/clear.ts`. Import `ClearPart`, `ClearAction`, `ClearField` from `src/activation/clear.ts`. Module-level JSDoc per AGENTS.md.
- [x] 6.2 Update `src/activation/clear.ts` to import `renderClearSummary` from `src/ui/clear-summary.ts` for use inside the `clear` runner.
- [x] 6.3 Update `src/ui/picker.ts` to import `renderClearSummary` from `src/ui/clear-summary.ts` instead of from `src/activation/clear.ts`.
- [x] 6.4 Add `tests/ui/clear-summary.test.ts` covering: every `chooseClearLead` priority branch (priorUnknown, restore-failed, all-already-baseline, all-restore-like with and without restored-partial, all-kept-like, mixed); `renderClearSummary` row formatting for each `ClearAction`; styler fallback when `theme` is undefined.
- [x] 6.5 If existing tests in `tests/activation/apply-clear.test.ts` or similar covered the renderer in addition to the engine, leave the engine-side assertions in place but remove pure-rendering assertions (now covered by the new test file).
- [x] 6.6 Run `mise run check`.

## 7. Final validation

- [x] 7.1 Run `mise run check`.
- [x] 7.2 Run `mise run fallow` and confirm no new orphan exports were introduced. (The `dead-code` and `dupes` reports are advisory; review by hand.)
- [x] 7.3 Manual smoke test (or verify via existing tests): startup with `--preset` flag, `/presets` picker, `/presets clear`, `/presets status`, `/presets reload`, hotkey activation, drift detection on `/model`, session restore. All behaviors and copy strings unchanged.
- [x] 7.4 Run `openspec validate deepen-active-session-and-hotkeys --strict` and confirm clean.
