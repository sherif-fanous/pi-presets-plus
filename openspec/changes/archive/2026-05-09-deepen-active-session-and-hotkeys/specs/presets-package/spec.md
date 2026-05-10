# presets-package Delta — `deepen-active-session-and-hotkeys`

## ADDED Requirements

### Requirement: Active preset attachment is owned by a single class

The package SHALL own the active-preset attachment in exactly one
module: `src/activation/session.ts`, exporting a class
`ActivePresetSession`. The `presetsPlus(pi)` default export SHALL
construct one instance per invocation and thread it through every
lifecycle handler and command runner that needs to read or mutate
the attachment.

The class SHALL own:

1. The in-memory active-preset cell (the value previously held in
   the deleted `src/activation/active-state.ts`).
2. The self-triggered-`pi.setModel` re-entry counter (the value
   previously held at the top of `src/activation/apply.ts`),
   exposed as `withSelfTriggeredModelSet(fn)` and
   `isSelfTriggered()`.
3. The persistent session-entry writes for the
   `presets-plus:active` channel (`pi.appendEntry(
"presets-plus:active", { name, scope } | { name: null })`).
   The shape of the persisted payload SHALL remain
   `{ name: string; scope: PresetScope } | { name: null }` — the
   class encapsulates the channel name and the null-clear marker
   so no other module references either.
4. The status-badge refresh: the class is the single writer of
   `ctx.ui.setStatus("presets-plus", …)` in the codebase.
5. The dirty / clean transitions previously in
   `src/activation/dirty.ts`.
6. Session-restore reconstruction from a session branch: a method
   `restoreFromBranch(branch, presets)` SHALL return
   `{ state: ActivePresetState | undefined; warnings: string[] }`
   so the UI boundary in `src/index.ts` can roll the warnings
   into a single `surfaceWarnings(ctx, warnings)` call.

The session class SHALL NOT contain the apply or clear decision
logic; those stay in `src/activation/apply.ts` and
`src/activation/clear.ts` respectively, and they SHALL invoke
`session.start({ preset, baseline, lastApplied, owned })` and
`session.clear(ctx, pi)` rather than calling `pi.appendEntry`,
`ctx.ui.setStatus`, or mutating the cell directly.

The deleted modules `src/activation/active-state.ts` and
`src/activation/dirty.ts` SHALL NOT exist after this change.

#### Scenario: Session class is the only writer of the active-preset cell

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/activation/session.ts` SHALL hold
  module-scoped mutable state representing the active preset
- **AND** no file outside `src/activation/session.ts` SHALL call
  `pi.appendEntry("presets-plus:active", …)`
- **AND** no file outside `src/activation/session.ts` SHALL call
  `ctx.ui.setStatus("presets-plus", …)`

#### Scenario: Apply and clear go through the session class

- **WHEN** `apply(preset, ctx, pi, session)` succeeds
- **THEN** it SHALL call `session.start(...)` exactly once
- **AND** it SHALL NOT call `pi.appendEntry` directly
- **AND** it SHALL NOT call `ctx.ui.setStatus` directly

- **WHEN** `clear(ctx, pi, session)` clears an active preset
- **THEN** it SHALL call `session.clear(ctx, pi)` exactly once
- **AND** it SHALL NOT call `pi.appendEntry` directly
- **AND** it SHALL NOT call `ctx.ui.setStatus` directly

#### Scenario: Self-triggered model set guard lives on the session

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/activation/session.ts` SHALL define
  module-scoped state for the self-triggered-`pi.setModel` counter
- **AND** `src/activation/drift-handlers.ts` SHALL consult
  `session.isSelfTriggered()` rather than a free function

#### Scenario: Restore returns warnings instead of notifying

- **WHEN** `session.restoreFromBranch(branch, presets)` finds the
  referenced preset is not loaded, or is unavailable
- **THEN** it SHALL return `{ state: undefined, warnings: [...] }`
  with composed warning strings
- **AND** it SHALL NOT call `ctx.ui.notify` directly
- **AND** the caller in `src/index.ts` SHALL forward the warnings
  through the existing `surfaceWarnings` helper

### Requirement: Status-badge renderer is a pure exported formatter with no lookup callback

`src/ui/status.ts` SHALL export only:

1. The `STATUS_KEY` constant `"presets-plus"`.
2. A pure function `renderStatusBadge(active, theme): string` that
   takes only the `ActivePresetState | undefined` value (and a
   `Theme | undefined` for color application) and returns the
   rendered badge string.

The previously-exported `updateStatus(ctx, active, lookup)` runner
SHALL be removed. The lookup-callback parameter
`(name: string, scope: PresetScope) => LoadedPreset | undefined`
SHALL NOT appear in the renderer's signature. Modules that
previously satisfied it by fabricating a synthetic `LoadedPreset`
from a drift snapshot SHALL no longer do so.

#### Scenario: Renderer signature has no lookup callback

- **WHEN** `src/ui/status.ts` is inspected after the change
- **THEN** the public API SHALL consist of `STATUS_KEY` and
  `renderStatusBadge`
- **AND** no exported function SHALL accept a
  `(name, scope) => LoadedPreset | undefined` parameter

#### Scenario: Synthetic LoadedPreset workaround is gone

- **WHEN** the source tree is searched for the
  `dirty.ts`-style `LoadedPreset` synthesis used to satisfy the
  old lookup callback
- **THEN** no occurrence SHALL remain
- **AND** badge updates emitted from dirty / clean transitions
  SHALL render directly from `ActivePresetState`

### Requirement: Runtime hotkey bindings are owned by a single class

The package SHALL own the runtime hotkey bindings in exactly one
module: `src/hotkey-registry.ts`, exporting a class
`HotkeyRegistry`. The `presetsPlus(pi)` default export SHALL
construct one instance per invocation.

The class SHALL replace and consolidate the deleted modules
`src/hotkey-conflicts.ts`, `src/hotkeys.ts`, and
`src/hotkey-reload-baseline.ts`. Its public surface SHALL be:

1. `analyze(presets: LoadedPreset[]): HotkeyAnalysis` — parses,
   marks `LoadedPreset.hotkeyConflict` and
   `LoadedPreset.hotkeyShadowsBuiltin` as a side effect for
   downstream UI read sites, and returns the analysis. Called by
   `loadAll` on every storage read.
2. `bindForSession(presets, analysis, ctx, pi, loadCurrent): void`
   — registers `pi` shortcuts, emits session-start
   conflict/shadow/invalid notifications, and captures the
   runtime baseline internally. Called once at `session_start`.
3. `saveNeedsReload(initial, saved): boolean` — query for the
   editor's post-Save reload prompt.
4. `deleteNeedsReload(identity): boolean` — query for the
   picker's post-Delete reload prompt.
5. `recordReloadPromptDeclined(identity, hotkey?): void` —
   remembers a declined prompt so the same pending state is not
   re-prompted.

The class SHALL NOT expose a public method for setting the
runtime baseline; "what was just bound" is captured as part of
`bindForSession` and is not externally writable.

The class SHALL NOT carry module-scoped mutable state; every
mutable cell (the runtime baseline map, the
acknowledged-pending-prompts map) SHALL live as instance state.
The previously-exposed test-only
`clearRuntimeHotkeyBaseline()` reset hatch SHALL NOT exist after
this change — tests construct a fresh `HotkeyRegistry` instance
per case.

The deleted modules `src/hotkey-conflicts.ts`,
`src/hotkey-reload-baseline.ts`, and `src/hotkeys.ts` SHALL NOT
exist after this change.

#### Scenario: Registry is the only writer of runtime-binding state

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/hotkey-registry.ts` SHALL hold
  module-scoped mutable state for runtime hotkey bindings or
  acknowledged-pending prompts

#### Scenario: Loader uses the registry's analyze

- **WHEN** `loadAll(ctx)` runs
- **THEN** it SHALL invoke `hotkeys.analyze(presets)` exactly once
- **AND** the returned `HotkeyAnalysis` SHALL be threaded to
  callers exactly as today's `annotateAndAnalyzeHotkeys` was

#### Scenario: bindForSession captures the baseline internally

- **WHEN** `bindForSession(presets, analysis, ctx, pi, loadCurrent)`
  completes
- **THEN** the registry's runtime baseline SHALL reflect the
  hotkeys that were just registered
- **AND** there SHALL NOT be a separate public method to set the
  baseline

#### Scenario: Tests use per-case instances, not module reset

- **WHEN** a test exercises hotkey-registration or reload-prompt
  logic
- **THEN** it SHALL construct a fresh `HotkeyRegistry` instance
- **AND** it SHALL NOT call any module-scoped reset function

### Requirement: PresetIdentity is a shared domain primitive

The package SHALL own the `PresetIdentity` type and its
identity-equality / lookup helpers in `src/preset-identity.ts`,
exporting:

1. `interface PresetIdentity { readonly name: string; readonly scope: PresetScope }`.
2. `findPreset<T extends PresetIdentity>(presets, identity): T | undefined`.
3. `samePresetIdentity(a, b): boolean`.

The previously-defined `PresetIdentity` interface in
`src/hotkey-conflicts.ts` SHALL be deleted; the new
`hotkey-registry.ts` SHALL import the type from
`src/preset-identity.ts` and MAY re-export it for downstream
consumers that already import hotkey-related types from one place.

Every existing call site that performs the identity-equality
lookup `presets.find((p) => p.name === X && p.scope === Y)` over
a `LoadedPreset[]` or `Preset[]` SHALL be replaced with
`findPreset(presets, identity)`.

#### Scenario: Identity lookup is centralized

- **WHEN** the source tree is searched for the literal pattern
  `\.name === [A-Za-z_.]+\.name` paired with
  `\.scope === [A-Za-z_.]+\.scope` inside an `Array.find`
  callback
- **THEN** no occurrences SHALL remain in `src/`
- **AND** every former occurrence SHALL have been replaced with
  `findPreset(presets, identity)`

#### Scenario: PresetIdentity is no longer hotkey-shaped

- **WHEN** `src/preset-identity.ts` is inspected after the change
- **THEN** it SHALL export `PresetIdentity`, `findPreset`, and
  `samePresetIdentity`
- **AND** `src/hotkey-conflicts.ts` SHALL NOT exist

### Requirement: Clear-summary renderer is split from the clear engine

The package SHALL split the pure clear-summary rendering surface
out of `src/activation/clear.ts` into a new module
`src/ui/clear-summary.ts`. The pure rendering surface previously
living in `src/activation/clear.ts` SHALL move to that new module, exporting at minimum
`renderClearSummary`, `chooseClearLead`, and any helpers required
to render a `ClearPart[]` (`formatRowValue`, `formatModel`,
`formatTools`, `isKeptLike`, `isRestoreLike`, the `Styler` type,
`IDENTITY_STYLER`, `normalizeStyler`, and the `FIELD_LABELS`
table).

The engine module `src/activation/clear.ts` SHALL retain
`decideClear`, `executeClear`, `clear`, `clearReturning`, and the
`ClearDecision` / `ClearPart` / `ClearWrites` / `ClearSnapshot` /
`ClearAction` / `ClearField` types. After this change
`src/activation/clear.ts` SHALL NOT import any rendering helper
from `src/ui/clear-summary.ts` except inside the `clear` runner
that produces the user-visible notification.

The renderer module SHALL be importable by both the `clear`
runner and `src/ui/picker.ts` (which renders the same
`ClearPart[]` inline after `clearReturning` returns).

#### Scenario: Renderer module exists with the documented exports

- **WHEN** `src/ui/clear-summary.ts` is inspected after the change
- **THEN** it SHALL export `renderClearSummary` and
  `chooseClearLead` at minimum
- **AND** the engine file `src/activation/clear.ts` SHALL NOT
  define `renderClearSummary` or `chooseClearLead`

#### Scenario: Engine and renderer are separately testable

- **WHEN** the test files for clear are inspected after the change
- **THEN** decision logic tests (e.g.
  `tests/activation/clear-decide.test.ts`) SHALL import from
  `src/activation/clear.ts` only
- **AND** the new `tests/ui/clear-summary.test.ts` SHALL import
  from `src/ui/clear-summary.ts` only

### Requirement: Apply, clear, drift, and flag take session as an explicit parameter

Functions that mutate or read the active-preset attachment SHALL
declare `session: ActivePresetSession` as an explicit parameter
rather than reaching for a module-scoped accessor. Concretely:

- `apply(preset, ctx, pi, session)` in `src/activation/apply.ts`.
- `clear(ctx, pi, session)` and `clearReturning(ctx, pi, session)`
  in `src/activation/clear.ts`.
- `handleModelSelectDrift(event, ctx, pi, session)` and
  `syncDirtyFromCurrentState(ctx, pi, session)` in
  `src/activation/drift-handlers.ts`.
- `applyPresetFlag(pi, ctx, presets, session)` in `src/flag.ts`.
- The hotkey activation handler invoked by
  `HotkeyRegistry.bindForSession` SHALL receive the session through
  the registry's binding closure.

The single construction site for the session SHALL be the
`presetsPlus(pi)` default export in `src/index.ts`, which threads
the same instance to every consumer for the lifetime of the
extension.

#### Scenario: Functions declare their session dependency

- **WHEN** the signatures of `apply`, `clear`, `clearReturning`,
  `handleModelSelectDrift`, `syncDirtyFromCurrentState`, and
  `applyPresetFlag` are inspected after the change
- **THEN** each SHALL accept an `ActivePresetSession` parameter
- **AND** none SHALL import a free `getActive()` /
  `setActive()` / `clearActive()` from a module-scoped cell

#### Scenario: Session has one construction site

- **WHEN** the source tree is searched for `new ActivePresetSession(`
- **THEN** there SHALL be exactly one occurrence in `src/`,
  inside the `presetsPlus(pi)` default export of
  `src/index.ts`

### Requirement: No user-visible behavior change

This refactor SHALL preserve every user-visible behavior of the
extension. Concretely:

1. Every existing test golden in `tests/` for `/presets *` output,
   notifications, status-badge text, clear-summary text, and
   editor / picker rendering SHALL continue to match without
   string edits.
2. The on-disk preset file format (
   `{ version: 1, presets: Preset[] }`) and field set SHALL be
   unchanged.
3. The persistent session-entry shape on the
   `presets-plus:active` channel (
   `{ name: string; scope: PresetScope } | { name: null }`)
   SHALL be unchanged.
4. The pi extension API surface registered by the package
   (`/presets` command, `--preset` flag, message renderer for
   `ACTIVATED_MESSAGE_TYPE`, lifecycle handlers) SHALL be
   unchanged.
5. CLI flags, command names, command argument completions, and
   subcommand routing SHALL be unchanged.

#### Scenario: Existing tests pass without golden edits

- **WHEN** `mise run check` is run after the change
- **THEN** all tests SHALL pass
- **AND** no golden assertion in
  `tests/user-facing-strings.test.ts`,
  `tests/activation/apply-clear.test.ts`,
  `tests/commands/presets/status.test.ts`,
  `tests/commands/presets/router.test.ts`, or any picker / editor
  test SHALL require a string update as part of this change

#### Scenario: On-disk and session-entry shapes are unchanged

- **WHEN** a preset is applied or cleared after the change
- **THEN** the JSON written to either scope file SHALL match the
  pre-change format byte-for-byte for the same input
- **AND** the entry written to the `presets-plus:active` channel
  SHALL carry the same payload shape
