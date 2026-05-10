## Why

Two of the extension's central domain concepts — **the active preset
attachment** and **the runtime hotkey bindings** — are spread across
multiple modules each, coordinated through module-scoped mutable
singletons that every collaborating file pokes directly. The "active
preset" cell lives in `src/activation/active-state.ts` as a 4-line
`let` that six other files read and mutate; alongside it sit a
self-triggered-`setModel` counter at the top of `src/activation/apply.ts`,
a persistent-session-entry write (`pi.appendEntry("presets-plus:active",
…)`) duplicated across `apply.ts` and `clear.ts` with the `{ name: null }`
clear-marker as a magic value, a status-badge refresh that every
mutation site has to remember to call (with a hand-built lookup callback
that one site satisfies by fabricating a `LoadedPreset` from a drift
snapshot), and a `restoreActiveFromBranch` function in `src/index.ts`
that knows the persistence channel name and the snapshot shape. The
"runtime hotkey bindings" concept is split across three top-level
files — `src/hotkey-conflicts.ts`, `src/hotkeys.ts`, and
`src/hotkey-reload-baseline.ts` — coordinating through two module-scoped
`Map`s plus a test-only `clearRuntimeHotkeyBaseline()` reset hatch.
The result is shallow seams: each module's interface is nearly as
complex as its implementation, the same identity-equality
`presets.find((p) => p.name === X && p.scope === Y)` is duplicated
across six call sites, and tests must remember to reset module-level
state between cases.

This change consolidates each concept into one **deep module** with a
single, small, testable interface, eliminating the module-scoped
singletons and the parallel "fabricate a fake `LoadedPreset` to satisfy
a lookup callback" workarounds. It also graduates `PresetIdentity` to a
domain primitive with a shared `findPreset` helper.

## What Changes

- Introduce `src/activation/session.ts` — a class `ActivePresetSession`
  that owns the active-preset cell, the persistent session-entry writes
  (`pi.appendEntry("presets-plus:active", …)`), the status-badge refresh,
  the dirty/clean transitions, the self-triggered-`setModel` counter, and
  a `restoreFromBranch(branch, presets)` method that returns
  `{ state, warnings: string[] }`. This module becomes the single writer
  of `ctx.ui.setStatus("presets-plus", …)`.
- Introduce `src/hotkey-registry.ts` — a class `HotkeyRegistry` that
  consolidates today's `src/hotkey-conflicts.ts`, `src/hotkeys.ts`, and
  `src/hotkey-reload-baseline.ts` into one module. Public surface:
  `analyze(presets)`, `bindForSession(presets, analysis, ctx, pi,
loadCurrent)`, `saveNeedsReload(initial, saved)`,
  `deleteNeedsReload(identity)`, `recordReloadPromptDeclined(identity,
hotkey?)`. Annotation of `LoadedPreset.hotkeyConflict` /
  `LoadedPreset.hotkeyShadowsBuiltin` continues as a side effect of
  `analyze`, preserving the existing single-canonical-marker pattern that
  picker / editor / status all read.
- Introduce `src/preset-identity.ts` — exports the `PresetIdentity` type
  (moved from `src/hotkey-conflicts.ts`), `findPreset(presets, identity)`
  (replaces the duplicated `presets.find(name+scope)` literal at six call
  sites), and `samePresetIdentity(a, b)`.
- Introduce `src/ui/clear-summary.ts` — the pure renderer extracted from
  `src/activation/clear.ts`: `renderClearSummary`, `chooseClearLead`,
  `formatRowValue`, `formatModel`, `formatTools`, `isKeptLike`,
  `isRestoreLike`, the `Styler` type and `IDENTITY_STYLER`, and the
  `FIELD_LABELS` map. `src/activation/clear.ts` shrinks to the decide /
  execute / orchestrate engine.
- Modify `src/ui/status.ts` to export only the pure formatter
  `renderStatusBadge(active, theme): string` plus `STATUS_KEY`. The
  `updateStatus(ctx, active, lookup)` runner is removed; the session
  module is the only caller of `ctx.ui.setStatus`. The lookup-callback
  parameter (and the fabricated `LoadedPreset` in `dirty.ts` that fed it)
  go away entirely.
- Modify `src/activation/apply.ts` to take `session` as an explicit
  parameter, drop the module-level `selfTriggeredModelSetDepth` counter
  (moved into the session module), and stop calling `pi.appendEntry`,
  `setActive`, and `updateStatus` directly — those become
  `session.start({ preset, baseline, lastApplied, owned })`.
- Modify `src/activation/clear.ts` to take `session` as an explicit
  parameter, drop `clearActive` / `pi.appendEntry` / `updateStatus`
  in favor of `session.clear(ctx, pi)`, and import its renderer from
  `src/ui/clear-summary.ts`.
- Modify `src/activation/drift-handlers.ts` to take `session` as an
  explicit parameter; `getActive()` and `isSelfTriggeredModelSet()`
  become `session.current()` and `session.isSelfTriggered()`.
- Modify `src/index.ts` to instantiate `ActivePresetSession` and
  `HotkeyRegistry` once inside the `presetsPlus` default export and
  thread them through every lifecycle handler. The inline
  `restoreActiveFromBranch` function is replaced by
  `session.restoreFromBranch(...)`.
- Modify `src/store/api.ts`'s `loadAll` to consume the registry's
  `analyze` instead of the standalone `annotateAndAnalyzeHotkeys`.
- Replace duplicated `presets.find((p) => p.name === X && p.scope === Y)`
  literals across `src/index.ts`, `src/commands/presets/status.ts`,
  `src/hotkeys.ts`, `src/activation/apply.ts`, and any picker / editor
  sites with `findPreset(presets, identity)`.
- Delete `src/activation/active-state.ts`, `src/activation/dirty.ts`,
  `src/hotkey-conflicts.ts`, `src/hotkey-reload-baseline.ts`, and
  `src/hotkeys.ts`. The test-only `clearRuntimeHotkeyBaseline()` reset
  hatch goes away — tests construct fresh `HotkeyRegistry` and
  `ActivePresetSession` instances per case.
- Retarget tests: `tests/activation/dirty.test.ts` →
  `tests/activation/session.test.ts`;
  `tests/hotkey-conflicts.test.ts` and `tests/hotkeys.test.ts` →
  `tests/hotkey-registry.test.ts`; `tests/ui/status.test.ts` becomes a
  pure-formatter test on `renderStatusBadge`. Add new
  `tests/ui/clear-summary.test.ts` and `tests/preset-identity.test.ts`.

No user-visible behavior changes. `--preset`, `/presets`, `/presets clear`,
`/presets status`, `/presets reload`, hotkey activation, drift detection,
session restore, status badge, and reload prompts behave identically;
only the internal module structure moves.

## Capabilities

### New Capabilities

_(none — this change is purely a refactor of existing capabilities)_

### Modified Capabilities

- `presets-package`: Adds a "Module structure" requirement that pins the
  refactored architecture as a spec-level commitment: the active-preset
  attachment is owned by one class with a single writer of the status
  badge channel, the runtime hotkey bindings are owned by one class with
  no module-scoped mutable singletons, `PresetIdentity` and its
  helpers live in a shared module rather than inside `hotkey-conflicts`,
  and the clear-summary renderer is split out from the clear engine.
  Future changes touching these surfaces SHALL preserve this layering.

## Impact

- Five files deleted (`src/activation/active-state.ts`,
  `src/activation/dirty.ts`, `src/hotkey-conflicts.ts`,
  `src/hotkey-reload-baseline.ts`, `src/hotkeys.ts`).
- Four files added (`src/activation/session.ts`,
  `src/hotkey-registry.ts`, `src/preset-identity.ts`,
  `src/ui/clear-summary.ts`).
- Modified: `src/activation/apply.ts`, `src/activation/clear.ts`,
  `src/activation/drift-handlers.ts`, `src/activation/drift.ts` (import
  rewrites only), `src/activation/baseline.ts` (import rewrites only),
  `src/activation/state-matches.ts` (import rewrites only),
  `src/commands/presets/status.ts`, `src/flag.ts`, `src/index.ts`,
  `src/store/api.ts`, `src/types.ts` (re-export shuffle for
  `PresetIdentity`), `src/ui/editor.ts`, `src/ui/picker.ts`,
  `src/ui/status.ts`.
- Test files retargeted as listed above; goldens are unchanged because
  no user-visible string moves.
- `mise run check` MUST pass at every commit boundary; `fallow dead-code`
  SHOULD be re-run after the refactor to confirm no orphan exports.
- No changes to the on-disk preset file format, the persistent session
  entry shape (`presets-plus:active`), the `pi` extension API surface,
  CLI flags, or any user-facing string.
- No changes to dependencies or `package.json`.
