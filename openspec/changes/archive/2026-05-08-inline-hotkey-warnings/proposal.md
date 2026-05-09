## Why

The preset editor's Save pipeline today treats hotkey conflicts and
Pi-builtin shadowing as **modal confirmation dialogs**: when the
user types a hotkey that conflicts with another preset OR matches
a documented Pi built-in, pressing Save opens a `Yes/No` dialog
asking whether to save anyway.

This is inconsistent with the inline-error pattern introduced by
`surface-editor-validation-inline`. Field problems now render
inline beneath the offending row in `error` color. The hotkey
warnings are also non-blocking observations about the user's
choice, but they get a different presentation — a modal interrupt
rather than an inline annotation.

The asymmetry has three concrete costs:

- **Modal interruption.** The user typed a hotkey and pressed Save;
  rather than seeing the result, they get a dialog that requires a
  choice before the editor's flow can resume.
- **Sequential dialog cascade.** A user who picks a hotkey that
  both shadows a Pi built-in AND conflicts with another preset
  faces two confirmations in sequence (the editor checks Pi-builtin
  first, then conflict). Add scope-change confirmation for an
  edited preset and that's three dialogs.
- **Mixed mental model.** "Why is Name showing me an inline error
  but Hotkey opening a dialog?" The user has to learn two
  patterns for what is functionally the same kind of feedback.

Both warning conditions are non-blocking and self-revealing in
practice — Pi's hotkey-conflict resolver silently skips conflicting
later-bound presets, and the Pi-builtin-shadow case is now
visible in the picker card via `hotkeyShadowsBuiltin` (added by
`unify-picker-status-and-shadow-flag`). Users who type a problematic
hotkey will see warnings inline at edit time AND see the persisted
status post-save in the picker — they don't need a modal to acknowledge.

## What Changes

- The editor's `validateForSave` SHALL no longer open confirmation
  dialogs for hotkey conflicts or Pi-builtin shadows. The
  `openConfirm` calls keyed on `HOTKEY_SHADOWS_TITLE` and
  `HOTKEY_CONFLICT_TITLE` SHALL be removed from the validation
  pipeline.
- Both conditions SHALL be surfaced as **inline warnings** beneath
  the Hotkey row in the editor, rendered in the theme's `warning`
  color (yellow), with sentence-cased prose:
  - Hotkey conflicts another preset: `"⚠ <normalized> is already
used by preset \"<name>\"; this preset's binding will be
skipped."`
  - Hotkey shadows a Pi built-in: `"⚠ <normalized> shadows a Pi
built-in; saving will replace Pi's behavior for this key."`
- The editor's per-row diagnostic state SHALL gain a severity
  dimension: `Map<EditorRowId, { severity: "error" | "warning";
message: string }>`. Errors continue to block Save. Warnings do
  NOT block Save — they are informational annotations the user
  acknowledges by pressing Save anyway.
- The render path SHALL distinguish severities by color: errors in
  `error` (red), warnings in `warning` (yellow), with the existing
  4-space inline indentation. Both render in the same beneath-row
  position used today.
- Field clearing rules from `surface-editor-validation-inline`
  apply to both severities: typing into Hotkey clears the Hotkey
  diagnostic regardless of severity. Cross-field rules
  (scope→name, provider→model) operate on errors only — warnings
  are not coupled across fields in this change.
- The Save flow SHALL run the warning checks before checking
  `fieldErrors.size === 0`, so warnings can populate the
  diagnostic map even when validation otherwise succeeds. A Save
  attempt with only warnings SHALL proceed (write or test as
  applicable); a Save attempt with at least one error SHALL be
  refused regardless of warnings present.
- The `"Save cancelled."` flow message produced by the existing
  decline path SHALL be removed because nothing produces it
  anymore: with no confirmation dialogs in the validate pipeline,
  there is no decline path. The flow-error surface in
  `renderMessages()` SHALL remain (it stays available for any
  future flow-state messages, such as I/O failures during persist).
- The picker card behavior is unchanged by this change — the
  post-save status rendering for `hotkeyConflict` and the new
  `hotkeyShadowsBuiltin` (added by the prerequisite
  `unify-picker-status-and-shadow-flag`) continues to surface
  these conditions on the picker.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: replaces the modal confirmation dialogs for
  hotkey conflicts and Pi-builtin shadows with inline warnings of
  a new `warning` severity, generalizes per-row diagnostics to
  carry severity, and removes the corresponding confirm-decline
  flow path.

## Impact

- `src/ui/editor.ts`:
  - Replace `private fieldErrors: Map<EditorRowId, string>` with
    `private fieldDiagnostics: Map<EditorRowId, FieldDiagnostic>`
    where `FieldDiagnostic = { severity: "error" | "warning";
message: string }`. Update `clearValidationErrors`,
    `clearFieldErrorsFor`, `applyValidationFailure`, and the
    render helpers (`withFieldError` → `withFieldDiagnostic`,
    `renderFieldError` → `renderFieldDiagnostic`) accordingly.
  - Refactor `validateForSave` to: - Skip the `if (isPiBuiltin(...))` confirm; instead set a
    warning diagnostic on the hotkey row with the new prose. - Skip the `if (conflict)` confirm; instead set a warning
    diagnostic on the hotkey row with the new prose. - Drop the early-return decline paths (`return { ...,
flowError: "Save cancelled.", ok: false }`).
  - Refactor the `ValidationResult` shape: the failure variant's
    `fieldErrors` rename to `fieldDiagnostics` (carrying both
    severities); add a `hasError(): boolean` helper for "should we
    block Save?" The failure result fires only when `hasError()`.
    Warnings alone return `{ ok: true, fieldDiagnostics }` so the
    Save proceeds while diagnostics still render.
  - Remove the `HOTKEY_SHADOWS_TITLE` and `HOTKEY_CONFLICT_TITLE`
    imports and constants if they're not used elsewhere.
  - Update `applyValidationFailure` to populate
    `fieldDiagnostics` from a result whose `ok: false`.
- Tests:
  - `tests/ui/editor-input-ux.test.ts` — drop the `openConfirm`
    mock for the hotkey-conflict / Pi-builtin paths; new tests
    asserting the inline warning text and `warning` color when a
    conflicting or shadowing hotkey is set; existing
    `keeps Save-cancelled flow errors in the bottom message strip`
    test SHOULD be deleted (no decline path produces it anymore)
    or repurposed to assert another flow error (e.g. persist
    failure).
  - Add tests asserting Save proceeds when only warnings are
    present (no errors), and Save is refused when at least one
    error is present even if warnings also exist.
  - Add a test asserting `clearFieldErrorsFor("hotkey")` clears
    both errors and warnings keyed on `hotkey`.
- No spec or implementation change to `preset-shortcuts` or to
  `LoadedPreset`'s shape — those were addressed in the prerequisite
  change.
- This change MUST land after `unify-picker-status-and-shadow-flag`
  so that the picker can surface the shadowing condition. Without
  the prerequisite, removing the editor confirm would leave the
  Pi-builtin-shadow case invisible post-save.
