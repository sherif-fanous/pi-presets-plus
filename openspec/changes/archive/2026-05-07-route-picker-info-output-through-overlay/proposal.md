## Why

When a user opens `/presets`, the picker takes over the screen as
an overlay. From inside that overlay they can clear the active
preset, and (today) they cannot read its status — `/presets status`
only works from the prompt. Both of those output paths use
`ctx.ui.notify`, which writes to the main pi window underneath the
overlay; the user has to dismiss the picker to even see the message.

We want a Status action available from inside the picker, and we
want both Status and Clear results to render in a way the user can
actually read while the picker is still visible.

## What Changes

- Add a Status action to the picker footer alongside the existing
  controls (activate, edit, etc.). Selecting it computes the same
  `formatStatus` payload that `/presets status` produces, and
  renders it in a new shared info-dialog overlay anchored above the
  picker.
- Add a `presets-plus` info-dialog overlay component (a sibling to
  `confirm.ts`) that takes a title, body text, and an `info |
warning | error` tone, and resolves on Enter / Esc. It owns
  layout and dismissal only; callers pass pre-formatted text.
- Route picker-initiated `clear` through the same info-dialog
  overlay: `clear()` already produces a styled summary; the picker
  caller renders it in the dialog instead of `ctx.ui.notify`.
- Keep the prompt-driven paths (`/presets status`, `/presets clear`
  invoked from the prompt) on `ctx.ui.notify` exactly as they are
  today. Differentiation is by call site, not by command name.
- Provide a small `formatStatus` / `renderClearSummary` adapter so
  the same payload renders cleanly in either notify (single-line
  joined) or overlay (line-broken with frame chrome) modes.

## Capabilities

### New Capabilities

_None._ The shared info-dialog component is an internal UI
primitive that lives inside the `preset-picker` capability for now;
if a future caller outside the picker needs it (see
`surface-picker-activation-errors-in-overlay`), the spec for that
change can promote it.

### Modified Capabilities

- `preset-picker`: Adds a Status action to the picker footer, and
  routes Status and Clear results through a new shared info-dialog
  overlay instead of writing them to the main window.
- `preset-activation`: `runStatus` and `clear` gain an explicit
  output-target parameter (or equivalent seam) so the same
  formatter feeds both notify and overlay surfaces; default
  remains notify for direct prompt invocation.

## Impact

- New file: `src/ui/info-dialog.ts` (component) plus matching
  tests.
- Touches: `src/ui/picker.ts` (footer action + dialog wiring),
  `src/commands/presets/status.ts`, `src/activation/clear.ts`,
  `src/commands/presets/clear.ts`.
- No storage, schema, or activation-state changes. The information
  surfaced is identical; only its rendering surface differs by call
  site.
- Depends on (but does not strictly require) the vocabulary
  alignment from `align-extension-vocabulary`; if landed first, the
  overlay text already matches the editor.
