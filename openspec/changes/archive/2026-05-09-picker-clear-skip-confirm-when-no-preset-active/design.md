## Context

The picker's `c` (clear) action currently follows this flow,
unchanged from before the v0.1.1 refactor:

1. Press `c`.
2. Open confirm dialog: "Clear active preset?" → "Clear the active
   preset and restore managed settings?"
3. If user dismisses → return.
4. If user accepts → call `clearReturning(ctx, pi, session)`.
5. If `clearReturning` returns a result → render the summary in an
   info-dialog.
6. If `clearReturning` returns `undefined` (no active preset) →
   render nothing.

The path through (2)–(3)–(6) — accept, then nothing — happens when
no preset is active. The user experiences a meaningless prompt:
"Are you sure?" "Yes." Silence.

The slash-command `/presets clear` does not have this issue because
its underlying `clear()` runner notifies "No preset is active."
when there's nothing to do. The picker's `c` action bypasses that
runner (it calls `clearReturning` directly to capture the parts
for inline rendering) and so loses the no-active branch's user
feedback.

## Goals / Non-Goals

**Goals:**

- Pressing `c` with no active preset shows the user a single
  info-dialog stating the situation, then returns to the picker.
  The confirm dialog SHALL NOT be opened.
- Pressing `c` with an active preset behaves exactly as today
  (confirm → clear → summary dialog). No regression on the happy
  path.
- The new info-dialog message and title follow the project's
  user-facing voice convention: sentence-case prose with terminal
  period in the body, Title-Case title without terminal period.

**Non-Goals:**

- Changing the slash-command `/presets clear` flow. It already
  handles the no-active case correctly via its own `notify` call.
- Changing the `clearReturning` engine signature or behavior. The
  change lives entirely in the picker's caller layer.
- Suppressing the `c` action altogether when no preset is active
  (e.g., dimming the footer hint or refusing the keypress). The
  short-circuit-with-feedback approach is more discoverable: the
  user learns _why_ the action is unavailable, not just _that_
  it didn't fire.

## Decisions

### D1: Short-circuit via info-dialog, not via notify

The picker already routes its other action outputs (status, clear
summary) through info-dialog overlays per the existing
`preset-picker` requirement "Picker routes Clear and Status output
through an info-dialog overlay." Use the same pattern for the
short-circuit message so the user gets consistent visual treatment
across all picker-driven feedback.

**Alternatives considered:**

- _`ctx.ui.notify("No preset is active.", "info")`._ Rejected: the
  picker is a full-screen overlay; notifications appear underneath
  the picker chrome and are easy to miss. The whole point of the
  existing routing-through-info-dialog requirement was that
  picker-driven feedback should be visible _inside_ the picker
  context.
- _Inline status row inside the picker chrome (e.g., a one-line
  message at the top of the list area)._ Rejected: adding a new
  inline-message surface to the picker is a larger change with
  layout implications. Re-using the existing info-dialog
  infrastructure is the smaller, more idiomatic fix.

### D2: Body text "No preset is active.", title "Clear Unavailable"

The body matches the slash-command's existing copy verbatim
(`/presets clear` says exactly "No preset is active." when there's
nothing to do). The title "Clear Unavailable" matches the existing
picker `showUnavailableDialog` calls (e.g., the `pi`-undefined
fallback uses exactly "Clear Unavailable" / "Status Unavailable"
today). Reusing that exact casing keeps the picker's
short-circuit-dialog vocabulary consistent.

**Alternatives considered:**

- _Body "No active preset to clear."_ Rejected: drifts from the
  vocabulary of `/presets clear`. Reusing the same string keeps the
  user's mental model coherent across surfaces.
- _Title "Clear" or "Preset clear unavailable"._ Rejected: too
  short / too long. "Clear Unavailable" matches the existing
  short-circuit titles already used by the picker.

### D3: Skip the confirm dialog entirely; do not show "Cancelled"

When the picker can already tell there's nothing to clear, opening
a confirm dialog is theatre. The user has no decision to make.
Going straight to the info-dialog is the honest UX.

**Alternatives considered:**

- _Show the confirm dialog anyway, then on accept render the info-
  dialog instead of nothing._ Rejected: forces the user to confirm
  an action that does nothing. Not acceptable.

## Risks / Trade-offs

- **Risk:** Tests that exercised the picker's `c` action with no
  active preset previously (if any) asserted on confirm-dialog
  presence and then on the empty result. → **Mitigation:** the
  change replaces those assertions with "no confirm dialog
  appears; info-dialog with the no-active message appears."
  Concrete update in `tests/ui/picker-info-actions.test.ts`.

- **Risk:** A future change adds a way to attach to a preset whose
  `restore.kind === "unknown"` (session-restored without a
  baseline) where "clear" would still mean something useful. The
  short-circuit guard `!session.current()` would not fire in that
  case (an unknown-restore attachment IS an active preset), and
  the existing flow would run. → **Confirmed not a risk:** the
  current behavior already handles unknown-restore correctly via
  `decideClear`'s `unknown` branch, which produces an "unknown"
  per-field summary. The short-circuit only triggers when there
  is genuinely no attachment, which is the only case it should.

- **Trade-off:** One more user-facing string in the picker's
  vocabulary. The string "No preset is active." is already used
  by `/presets clear`, so this is a reuse, not a net add. The
  title "Clear unavailable" is new but fits the existing
  `<Verb> unavailable` pattern in the picker's short-circuit
  dialogs.
