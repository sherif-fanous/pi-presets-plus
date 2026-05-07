## Why

When the user activates a preset from inside the `/presets` picker
and activation fails — most commonly because the preset is marked
`unavailable: "no-key"` — `apply()` calls `ctx.ui.notify` with the
error. The picker is still open as an overlay, so the error message
lands on the main pi window underneath it; users see a flash, then
the picker, and have no idea what went wrong until they dismiss the
picker and scroll back. The reproducer in the user's report ("tried
to activate `virtasant-claude-opus-4-7` with `status: Unavailable —
missing API key`") is exactly this scenario.

This change makes picker-driven activation failures visible without
requiring the user to dismiss the picker.

## What Changes

- Route picker-driven activation failures through the shared
  info-dialog overlay introduced by
  `route-picker-info-output-through-overlay` (tone: `error`). The
  user dismisses the dialog with Esc / Enter and lands back in the
  picker.
- Plumb a structured failure reason out of `apply()` rather than
  having `apply()` write to the UI itself: `apply()` returns
  `{ ok: false, reason: string }` and the caller decides how to
  surface it. Today `apply()` returns `{ ok: boolean }` and emits
  notifications inline; this change inverts that.
- Picker calls render the reason in the info-dialog and stay open
  on `{ ok: false }` (the picker already keeps itself open on
  failure today; only the surface for the message changes).
- Out of scope: hotkey-triggered activation (`hotkeys.ts`) and
  `--preset` flag activation (`flag.ts`). At those moments there
  is typically no overlay competing for the screen, so
  `ctx.ui.notify` remains correct. Both call sites adopt the new
  `apply()` return shape and surface the reason via notify with
  `error` tone and vocabulary matching `align-extension-vocabulary`.
- Failure cases covered: `preset.unavailable` (no-key / no-model),
  `modelRegistry.find` returns nothing, `setModel` returns false,
  unknown-tools warnings (these stay at `warning` tone).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `preset-activation`: `apply()` returns a structured failure
  reason instead of writing to `ctx.ui.notify` directly; callers
  surface the reason. Behavior on success is unchanged.
- `preset-picker`: Picker-driven activation failures render in the
  shared info-dialog overlay introduced by
  `route-picker-info-output-through-overlay`; the picker stays
  open on failure (unchanged) but the user can now read the
  reason without dismissing it.

## Impact

- Touches: `src/activation/apply.ts` (return shape, removed
  notifies), `src/ui/picker.ts` (failure-handling branch), all
  current callers of `apply()` (`hotkeys.ts`, `flag.ts`,
  `index.ts` session restore, `commands/presets/router.ts`).
- Depends on `route-picker-info-output-through-overlay` for the
  info-dialog component. Landing this change without that one
  would require the dialog to be defined here instead.
- Test impact: every test that asserts `apply()` calls
  `ctx.ui.notify` on failure shifts to asserting on the returned
  reason; new picker tests cover the dialog branch.
- No storage or activation-state changes.
