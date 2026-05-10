## Why

When the user presses `c` (clear) inside the picker and no preset
is currently active, the picker today opens the "Clear active
preset?" confirm dialog regardless. If the user accepts, the
underlying `clearReturning` returns `undefined` (no active preset
to clear), the `if (result)` branch is skipped, and the user is
left staring at the picker after a confirm-then-nothing flow. If
the user declines, no confirm-then-nothing happens — but the
confirm should never have been shown.

The current behavior was preserved verbatim by the v0.1.1
deepening refactor; both pre-refactor and post-refactor code
contain the same `if (!confirmed) return; const result = await
clearReturning(...); if (result) { ... }` shape. The bug is
pre-existing UX: prompt for confirmation of an action that has
nothing to do.

This change short-circuits the picker's `c` action when no preset
is active: instead of opening the confirm dialog, the picker shows
an info-dialog stating "No preset is active." and returns. The
confirm dialog is only opened when there is actually something to
clear.

## What Changes

- The `c` action in the picker SHALL check `session.current()`
  before opening the confirm dialog. When no preset is active, it
  SHALL show an info-dialog with the body "No preset is active."
  and the title "Clear Unavailable", then return without opening
  the confirm dialog or invoking the clear flow.
- When a preset is active, the existing confirm → clear → summary
  flow runs unchanged.
- Add a new requirement to the `preset-picker` capability
  formalizing the short-circuit and its scenarios.

## Capabilities

### New Capabilities

_(none — this change adds a requirement to an existing capability)_

### Modified Capabilities

- `preset-picker`: adds a requirement "Picker clear short-circuits
  when no preset is active" alongside the existing "Picker routes
  Clear and Status output through an info-dialog overlay"
  requirement. The new requirement governs the gating step that
  precedes the existing confirm-then-clear flow.

## Impact

- One change in `src/ui/picker.ts` `clearActivePreset()`: an early
  return that opens an info-dialog when `session.current()` is
  undefined.
- One ADDED requirement on `preset-picker` with two scenarios
  ("active preset present → confirm flow runs" and "no active
  preset → info-dialog shown, no confirm").
- Two new test cases in `tests/ui/picker-info-actions.test.ts`
  covering the short-circuit path. Existing assertions on the
  confirm-flow path remain valid.
- One new user-facing string ("No preset is active." body and
  "Clear Unavailable" title); both follow the project's voice
  convention (sentence-case prose with terminal period for the
  body; Title-Case dialog title without trailing punctuation).
- No change to storage, command surfaces, hotkey activation, or
  any non-picker-driven clear flow. The slash-command
  `/presets clear` already shows "No preset is active." via
  `ctx.ui.notify` and is unaffected.
