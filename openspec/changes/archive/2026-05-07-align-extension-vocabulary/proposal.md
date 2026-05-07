## Why

The extension speaks in two voices today. The custom editor uses
Title-Case row labels (`Name`, `Scope`, `Provider`, …) and full
sentences ending in periods, while every other surface — `/presets
status`, `/presets clear`, `/presets reload`, the `--preset` flag,
hotkey activation, session restore, store warnings, and apply-time
notices — uses lowercase labels (`preset:`, `scope:`) and lowercase
fragments without terminal punctuation. The mismatch is jarring when
a user moves between the editor and any other surface, and it makes
the extension feel half-finished compared to pi itself.

This change does one editorial pass across the entire extension so
every user-visible string follows the editor's voice. It is
sequenced **last** among the five concurrent changes so it also
scrubs every new string introduced by
`route-picker-info-output-through-overlay`,
`surface-picker-activation-errors-in-overlay`,
`prompt-reload-on-hotkey-mutation`, and
`gate-thinking-levels-by-model-map` in one editorial pass.

## What Changes

- Adopt the editor's vocabulary as the project-wide standard:
  Title-Case labels with a trailing colon (`Preset:`,
  `Baseline model:`, `Scope:`); sentence-case prose with terminal
  periods (`Restored your previous settings.`); proper-noun
  casing for `Pi` and `/reload` references.
- Rewrite all `ctx.ui.notify` call sites to match: `apply.ts`,
  `clear.ts`, `status.ts`, `reload.ts`, `hotkeys.ts`, `flag.ts`,
  `index.ts` (session restore), `commands/presets/router.ts`,
  `commands/presets/notify.ts`.
- Rewrite editor inline notices (`formatHotkeyReloadNotice`,
  `snapThinkingIfInvalid` notice text, validation errors, footer
  legend) so they share the same voice as their row labels.
- Rewrite `formatStatus` row labels and `renderClearSummary` lead
  sentences and field labels to match.
- Rewrite store-layer warnings (`store/load.ts`,
  `store/validate.ts`, `store/merge.ts`) — these surface verbatim
  via `surfaceWarnings`, so they must conform.
- **Rewrite all strings introduced by the four concurrent changes**
  that this change deliberately lands after:
  - `Activation failed` dialog title and `failureReason` helper
    output (from `surface-picker-activation-errors-in-overlay`).
  - `Preset Status` and `Preset cleared` info-dialog titles (from
    `route-picker-info-output-through-overlay`).
  - `Reload Pi?` prompt title and body (from
    `prompt-reload-on-hotkey-mutation`).
  - Picker `Status` footer entry (from
    `route-picker-info-output-through-overlay`).
  - Existing editor confirm overlay titles (`Move preset?`,
    `Hotkey shadows pi`, `Hotkey conflict`) that predate this
    change — sourced from the shared labels module here so the
    editor's overlays use the same source of truth as the
    overlays introduced by the four concurrent changes.
- Centralize all repeated labels and dialog titles in a shared
  module (`src/ui/labels.ts` or extension to `src/ui/frame.ts`)
  so no string lives in two places.
- Update every test that asserts on these strings (status
  formatter goldens, clear summary goldens, router warnings,
  overlay-title tests added by the four concurrent changes, etc.)
  in lockstep.
- Add a one-paragraph "User-facing strings" subsection to
  `AGENTS.md` codifying the convention so future code stays
  aligned.
- Add a lint-style test that scans `src/` for known old-voice
  patterns and reports any matches as failures — a regression
  guardrail for future contributions.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `presets-package`: Adds a project-wide "User-facing strings"
  requirement that all extension surfaces (notifications,
  overlays, formatters, store warnings, router messages,
  hotkey messages, etc.) follow one voice convention. The
  per-capability output sites are governed by this single
  cross-cutting rule rather than being respecified inside each
  capability's own spec.

## Impact

- Every `ctx.ui.notify` call site in `src/` and the editor's
  inline text are touched. Behavior is unchanged; only string
  contents shift.
- Every overlay title introduced by the four concurrent changes
  is sourced from the shared labels module rather than from
  inline literals.
- Test goldens across the matching `tests/` files must update.
- A new convention paragraph is added to `AGENTS.md` to guide
  future strings, plus a lint-style test as a regression
  guardrail.
- No changes to storage formats, public APIs, or extension
  configuration.
- This change SHALL land after the four concurrent changes
  (`route-picker-info-output-through-overlay`,
  `surface-picker-activation-errors-in-overlay`,
  `prompt-reload-on-hotkey-mutation`,
  `gate-thinking-levels-by-model-map`). Landing earlier would
  leave the new strings introduced by those changes in the old
  voice until a follow-up scrub.
