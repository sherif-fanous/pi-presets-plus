## Context

`pi-presets-plus` has accumulated two domain concepts whose
implementation is spread across multiple files coordinating through
module-scoped mutable singletons:

**The active preset attachment.** What "is a preset currently
applied" means is owned in pieces by:

- `src/activation/active-state.ts` — a 4-line `let active` cell with
  `getActive` / `setActive` / `clearActive` accessors that six other
  files import and call directly.
- `src/activation/apply.ts` — a module-level `selfTriggeredModelSetDepth`
  counter guarding `pi.setModel` re-entry, plus a `pi.appendEntry(
"presets-plus:active", { name, scope })` write.
- `src/activation/clear.ts` — a parallel `pi.appendEntry(
"presets-plus:active", { name: null })` write with the magic
  null-name shape duplicated as a clear marker.
- `src/activation/dirty.ts` — flips `active.dirty` and refreshes
  the status badge by **fabricating a synthetic `LoadedPreset` from
  the cached drift snapshot** to satisfy the badge renderer's
  `(name, scope) => LoadedPreset | undefined` lookup callback.g
- `src/index.ts` — `restoreActiveFromBranch` reaches into
  `setActive` / `clearActive` / `snapshotPresetForDrift` to
  rebuild the cell from `ctx.sessionManager.getBranch()`, knowing
  the persistence channel name and the snapshot shape.
- `src/ui/status.ts` — the badge renderer takes a lookup callback
  whose only consumer is `name`, but every caller has to construct
  one (or fabricate a fake preset) to call it.

Effect: changing the persistent-entry shape requires editing three
files in lock-step; the badge renderer's interface is shaped around
a parameter (`(name, scope) => LoadedPreset | undefined`) that none
of its callers can satisfy honestly; the test seam is "reset the
module-level cell between cases."

**The runtime hotkey bindings.** What "what hotkeys are bound, and
does the user need `/reload`" means is owned in pieces by:

- `src/hotkey-conflicts.ts` — pure analysis: parses, annotates
  `LoadedPreset.hotkeyConflict` / `.hotkeyShadowsBuiltin`, emits
  `HotkeyAnalysis`.
- `src/hotkeys.ts` — imperative: registers shortcuts with `pi`,
  emits session-start notifications.
- `src/hotkey-reload-baseline.ts` — two module-scoped `Map`s
  (`runtimeHotkeys`, `acknowledgedPendingHotkeys`) with a
  test-only `clearRuntimeHotkeyBaseline()` reset.

The editor and picker import from all three files plus
`src/ui/hotkey-input.ts`. The "what's bound, what's pending" state
is the second module-level mutable cell in the codebase, with the
same test-reset escape hatch.

**Cross-cutting friction.** Six call sites duplicate
`presets.find((p) => p.name === X && p.scope === Y)`. The
`PresetIdentity` type that captures this domain primitive lives
inside `src/hotkey-conflicts.ts`, hidden behind a hotkey-shaped
import path despite being used by storage, activation, restore,
status, and editor.

The OpenSpec `presets-package` umbrella spec captures repository
shape, manifest, peer deps, and toolchain — but says nothing about
internal module boundaries. This change uses that umbrella to record
the post-refactor structure as a spec-level commitment.

## Goals / Non-Goals

**Goals:**

- Reduce `ActivePresetSession` and `HotkeyRegistry` each to one class
  with a single, small interface, eliminating the module-scoped
  mutable cells and their test-only reset hatches.
- Make the status-badge channel (`ctx.ui.setStatus("presets-plus",
…)`) a single-writer surface — the session module is the only
  module that calls `ctx.ui.setStatus` for that key.
- Drop the synthetic-`LoadedPreset` workaround in `dirty.ts` by
  removing the unused lookup-callback parameter from the badge
  renderer.
- Centralize `PresetIdentity` and its lookup helper as a shared
  domain primitive imported from one module, replacing the six
  duplicated `presets.find(name+scope)` literals.
- Pull the pure clear-summary renderer out of `src/activation/clear.ts`
  so the engine file (decide → execute → orchestrate) stays focused
  and the renderer is independently testable.
- Preserve every user-visible behavior, copy string, persistent file
  format, persistent session-entry shape, and pi extension API
  surface. Tests goldens for `/presets *` outputs remain unchanged.

**Non-Goals:**

- The `commands/presets/*` thin-runner / pure-formatter pattern stays
  exactly as `AGENTS.md` mandates. No collapsing of `runClear`,
  `runReload`, `runStatus`.
- Picker (`src/ui/picker.ts`, ~982 lines) and editor
  (`src/ui/editor.ts`, ~1617 lines) are not split. The pure-state
  seam in `picker-state.ts` is already extracted; remaining content
  is unavoidable TUI input/render plumbing.
- Storage's "re-read on every call" discipline (`AGENTS.md`) is
  preserved. `loadAll` keeps re-parsing on every invocation.
- The annotation side-effect on `LoadedPreset` (
  `hotkeyConflict` / `hotkeyShadowsBuiltin`) stays a side effect
  of `analyze()` — switching consumers to query a parallel map
  would touch every picker / editor / status read site for
  marginal benefit.
- No change to the apply or clear decision logic. `decideClear`
  stays in `src/activation/clear.ts` paired with `executeClear`;
  splitting them is mostly cosmetic.

## Decisions

### D1: `ActivePresetSession` is a class, constructed once per `presetsPlus(pi)` invocation

**Choice.** The default export of `src/index.ts` constructs
`new ActivePresetSession()` and `new HotkeyRegistry()` once and
threads them through every lifecycle handler (`session_start`,
`before_agent_start`, `model_select`, `thinking_level_select`,
`turn_start`) and every command runner (`apply`, `clear`,
`drift-handlers`, `flag`).

**Alternatives considered.**

- _Module-scoped singleton (status quo, just merged)._ Keeps current
  static-import style. Rejected: the existing
  `clearRuntimeHotkeyBaseline()` test-reset hatch is a smell, not a
  feature, and the only argument for the singleton is "pi calls
  `default export` once." That makes the singleton work; it doesn't
  make it the better shape. Per-instance construction makes test
  setup obviously correct (each test gets a fresh instance) instead
  of requiring contributors to remember a reset call.
- _Pass session through a project-local extended context type._
  Rejected: stretches the AGENTS.md convention "minimum surface via
  `Pick<ExtensionContext, …>`" — `session` isn't on `ExtensionContext`,
  and smuggling it via context hides the dependency.
- _Closure injection (wrap exported functions in `index.ts` to bind
  session, then pass the bound versions to handlers)._ Rejected:
  hides the dependency at call sites, making test-time injection
  harder to reason about.

**Consequence.** Functions in `apply.ts`, `clear.ts`,
`drift-handlers.ts`, and `flag.ts` declare `session` as an explicit
parameter (typically last, after `ctx` and `pi`). Tests construct a
session, optionally seed it, and pass it directly — no module reset
needed.

### D2: The session module is the single writer of the status badge

**Choice.** `src/ui/status.ts` exports only the pure formatter
`renderStatusBadge(active, theme): string` and the `STATUS_KEY`
constant. The runner that calls `ctx.ui.setStatus(STATUS_KEY, …)`
moves into `ActivePresetSession` and is invoked from `start`,
`clear`, `markDirty`, `markClean`, and `restoreFromBranch`.

**Alternatives considered.**

- _Keep `updateStatus(ctx, active)` exported with a slimmer signature
  (drop the lookup callback, take only `active`)._ Less invasive.
  Rejected: leaves four callers writing the badge channel; if a
  future change adds a fifth status surface (e.g., a different
  badge state), there's no single chokepoint to coordinate them.

**Consequence.** AGENTS.md's "exported pure formatter, thin runner
that touches `ctx.ui`" pattern is preserved at the surface — the
formatter is exported and pure-tested. The thin runner moves into
the session module instead of living in `ui/status.ts`. This is
strictly more honest: the badge is a **side effect of state
transitions**, not an independent operation, and grouping it with
the transitions makes the wiring visible.

### D3: The `(name, scope) => LoadedPreset | undefined` callback on the badge renderer is removed entirely

**Choice.** The badge renders `Preset: <name>` plus a `!` warning
glyph when dirty. Both pieces of information are already on
`ActivePresetState` (`active.name`, `active.dirty`). The lookup
callback never had a non-trivial caller — the closest was `dirty.ts`
fabricating a synthetic `LoadedPreset` from a drift snapshot just to
satisfy the signature.

**Alternatives considered.** None worth listing — this is the
deletion-test win for #2 from the grilling conversation.

**Consequence.** `tests/ui/status.test.ts` retargets to a pure
`renderStatusBadge(active, theme)` test. The test stops constructing
fake lookups.

### D4: `HotkeyRegistry` exposes `analyze` and `bindForSession` as separate operations

**Choice.** `analyze(presets)` is called by `loadAll` on every
read (it parses, annotates `LoadedPreset` markers, and returns
`HotkeyAnalysis`). `bindForSession(presets, analysis, ctx, pi,
loadCurrent)` is called once at `session_start` (it registers `pi`
shortcuts, emits notifications, captures the runtime baseline).

**Alternatives considered.**

- _One method that does both (`bindForSession` analyzes
  internally)._ Rejected: `loadAll` runs on every editor save, every
  picker open, every hotkey press — re-running shortcut registration
  and notifications inside `loadAll` would be wrong. The split exists
  because the operations have different lifetimes.

**Consequence.** `src/store/api.ts` calls `hotkeys.analyze(presets)`
in place of today's standalone `annotateAndAnalyzeHotkeys`. The
loading code reads as if the registry owns the parsing-and-marking
step, which it does.

### D5: `bindForSession` captures the runtime baseline internally

**Choice.** Today `index.ts` calls `setRuntimeHotkeyBaseline(presets)`
and `registerHotkeys(...)` separately. After this change, the registry
captures "what was just bound" as part of `bindForSession` — there's
no public method for the caller to set the baseline.

**Alternatives considered.**

- _Keep them as separate public calls._ Rejected: "what was just
  bound" is by definition the baseline. Exposing them separately
  makes it possible to call register without baseline (or vice
  versa), which is always wrong.

**Consequence.** One fewer public method. Test cases that exercise
"is reload needed" use a registry whose baseline was set by a
preceding `bindForSession` call (or, for direct unit tests of the
reload logic, a constructor-time fixture).

### D6: `LoadedPreset.hotkeyConflict` / `hotkeyShadowsBuiltin` annotation stays a side effect of `analyze()`

**Choice.** Preserve the existing pattern — `analyze` mutates the
passed `LoadedPreset[]` to set the conflict / shadow flags, so every
UI read site (picker card formatting, editor diagnostics, status)
reads one canonical marker.

**Alternatives considered.**

- _Switch to a parallel `Map<LoadedPreset, ConflictInfo>` returned
  from `analyze`._ Rejected: every picker / editor read site would
  have to thread the map through. The current side-effect pattern
  has a documented locality argument
  (`src/hotkey-conflicts.ts` JSDoc: "Mutates freshly-loaded presets
  so every UI path can read one canonical annotation without
  maintaining a parallel conflict map").

**Consequence.** None — bug-for-bug compatible with today.

### D7: Split `clear.ts` into engine and renderer

**Choice.** Move the pure rendering surface (`renderClearSummary`,
`chooseClearLead`, `formatRowValue`, `formatModel`, `formatTools`,
`isKeptLike`, `isRestoreLike`, `Styler`, `IDENTITY_STYLER`,
`normalizeStyler`, `FIELD_LABELS`) to `src/ui/clear-summary.ts`.
Keep `decideClear`, `executeClear`, `clear`, `clearReturning`, and
the `ClearDecision` / `ClearPart` / `ClearWrites` / `ClearSnapshot`
/ `ClearAction` / `ClearField` types in `src/activation/clear.ts`.

**Alternatives considered.**

- _Also split `decideClear` into `clear-decide.ts`._ Rejected: under
  deletion test, the complexity of `decideClear` mostly vanishes
  back into `clear.ts` — the decision logic and the pi-side
  execution are read as a unit. Their pairing is real depth, not
  boilerplate.
- _Leave `clear.ts` as-is._ Rejected: the rendering chunk (~150
  lines) is a real seam. Two adapters consume it (the `clear`
  notifier and the picker's inline render after `clearReturning`),
  matching LANGUAGE.md's "two adapters = real seam" rule.

**Consequence.** `clear.ts` falls from ~434 lines (after removing
the cell/entry/badge work that moves into the session module) to
roughly 200 lines. Tests in `tests/activation/clear-decide.test.ts`
and `tests/activation/apply-clear.test.ts` keep working unchanged
(they import the engine surface). New
`tests/ui/clear-summary.test.ts` covers the renderer.

### D8: `PresetIdentity` graduates to a domain primitive

**Choice.** Move the `PresetIdentity` type from
`src/hotkey-conflicts.ts` to a new `src/preset-identity.ts`, which
also exports `findPreset(presets, identity)` and
`samePresetIdentity(a, b)`. `findPreset` has a generic signature so
it returns `LoadedPreset | undefined` for `LoadedPreset[]` inputs
and `Preset | undefined` for `Preset[]` inputs.

**Alternatives considered.**

- _Add helpers inline in `src/types.ts`._ Rejected: `types.ts`
  is currently entirely declarative (interfaces, JSDoc, no runtime
  code). Mixing in two functions is a slippery slope; a separate
  30-line file has zero cost and a clean import path.
- _Leave `PresetIdentity` inside the registry module._ Rejected:
  the identity concept is used by storage, activation, restore,
  picker, editor, and status — far beyond hotkey concerns. Hiding
  it inside `hotkey-registry.ts` mislocates a shared primitive.

**Consequence.** Six call sites switch from
`presets.find((p) => p.name === X && p.scope === Y)` to
`findPreset(presets, identity)`. The hotkey registry imports
`PresetIdentity` from the new module and re-exports it for
downstream consumers (editor / picker) that already import
hotkey-related types from one place.

## Risks / Trade-offs

- **Risk:** Threading `session` as an explicit parameter is more
  verbose than today's "just import `getActive()`" pattern.
  Touchpoints: `apply.ts`, `clear.ts`, `drift-handlers.ts`,
  `flag.ts`, hotkey activation handlers (which currently call
  `apply` after a `loadAll`), and command runners. → **Mitigation:**
  the verbosity is bounded — most call sites already accept `ctx`
  and `pi`, so adding `session` is one more arg. The honesty win
  (every function declares its dependencies) is consistent with
  AGENTS.md's "minimum surface via `Pick<ExtensionContext, …>`"
  rule.

- **Risk:** Folding `setRuntimeHotkeyBaseline` into `bindForSession`
  is a **behavior** change in the sense that `index.ts` no longer
  exposes a separate point to set the baseline. → **Mitigation:**
  the only caller in production was `index.ts` itself, immediately
  before `registerHotkeys`. The current ordering is preserved
  exactly; the externally observable timing is identical.

- **Risk:** The existing `clearRuntimeHotkeyBaseline()` test-only
  reset is removed. If any test imports it that we didn't catch,
  it fails to compile. → **Mitigation:** `tsc` in
  `mise run check` catches dangling imports immediately. The
  retargeting of `tests/hotkey-conflicts.test.ts` and
  `tests/hotkeys.test.ts` into `tests/hotkey-registry.test.ts`
  rewrites those imports as part of the change.

- **Risk:** The session class accumulates broad responsibility
  (cell + persistent entry + status badge + dirty/clean +
  restore + self-call counter). Could become a god object. →
  **Mitigation:** the surface is narrow (six methods +
  `current()`) and each method maps to one verb in the existing
  domain model. The decision logic for apply and clear stays
  outside the session class, exactly to prevent it from absorbing
  unbounded scope.

- **Risk:** Annotation side-effect on `LoadedPreset` continues to
  surprise readers. → **Mitigation:** the existing JSDoc on the
  registry's `analyze` method is preserved verbatim and explains
  the "one canonical marker" rationale.

- **Trade-off:** Splitting `clear-summary.ts` out adds a new file
  (and new test file). For a 982-line picker file the extension
  doesn't split, splitting a ~150-line renderer might seem
  inconsistent. The difference is that the renderer has a clean
  pure-function boundary and two real adapters; the picker
  doesn't.
