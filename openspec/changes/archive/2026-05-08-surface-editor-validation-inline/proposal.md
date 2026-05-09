## Why

When the user presses Save (or Test) in the preset editor and one or
more form fields are invalid, the editor today surfaces a single
error message at the bottom of the dialog, in the message strip
above the action buttons. Two friction points fall out of that
choice:

- **Visually disconnected.** The error names a field
  (`"Name is required."`) but appears far from that field. The user
  has to read the error, then scan back up to find which row needs
  attention.
- **Single-failure-at-a-time.** The validator returns the first
  failure it finds (`validateRequired` checks Name, then
  Provider/Model, then bails on the first miss). A user with three
  empty required fields only learns about one of them per Save
  attempt. Three Save presses to fill out a new preset is
  needlessly tedious.

Additionally, the existing combined error
`"Provider and model are required."` covers two distinct rows
(Provider and Model) with one message, making the inline approach
ambiguous about which row to attach it to.

This change moves field-tied errors to render inline beneath the
offending row, splits the combined Provider+Model error into two
row-specific messages, surfaces all field failures in a single Save
attempt, and clears each error as soon as the user touches a field
that could resolve it.

## What Changes

- The editor SHALL associate validation errors with specific form
  rows via a `Map<EditorRowId, string>` (or equivalent) field on
  the editor state.
- When the user presses Save (or Test), the editor SHALL run the
  full validation pipeline and populate the row-error map with
  ALL failures simultaneously, not just the first. Subsequent
  validation steps that depend on prior steps (e.g. parsing a
  hotkey only if non-empty) still run only when applicable, but
  every independently-failable field SHALL contribute its own
  error if it fails.
- The combined `"Provider and model are required."` message SHALL
  be split into two row-specific messages: `"Provider is
required."` (attached to the provider row) and `"Model is
required."` (attached to the model row). When both are empty,
  both errors render simultaneously.
- The editor SHALL render each row's error as a single dim
  error-coloured line beneath the row, at the existing 4-space
  indentation used by other inline hints. Errors SHALL co-exist
  with the row's other inline hints (e.g. the Tools session
  hint, the dimmed-levels hint) without overlapping or replacing
  them.
- The editor SHALL clear a row's error when the user makes a
  change to a field that could resolve it. The clearing rules:
  - Editing the Name input clears the Name error.
  - Editing the Hotkey input clears the Hotkey error.
  - Changing Scope clears the Name error (a name-collision in
    one scope may not collide in another).
  - Changing Provider clears BOTH the Provider error AND the
    Model error (changing provider invalidates the previously-
    selected model state).
  - Changing Model clears the Model error.
- Flow-state errors that are not tied to a single field — most
  notably `"Save cancelled."` after a confirmation dialog
  declines — SHALL continue to render in the existing bottom
  message strip rather than inline. The bottom strip continues to
  carry the hotkey-reload notice as today.
- The editor SHALL clear all field errors at the start of every
  Save / Test attempt, before re-running the validator, so a
  prior validation run's errors never linger past a successful
  field change.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: refines the validation feedback contract from
  "first failure in bottom strip" to "all failures inline, plus
  flow-state errors in bottom strip", with a new clearing rule on
  field input.

## Impact

- `src/ui/editor.ts`:
  - Replace `private error: string | undefined` with
    `private fieldErrors: Map<EditorRowId, string> = new Map()`
    and `private flowError: string | undefined`. (`flowError`
    keeps the existing bottom-strip behavior for non-field-tied
    messages like `"Save cancelled."`.)
  - Refactor `validateRequired()` and `validateForSave()` to
    return a structured result that includes ALL failures, not
    just the first. The current `{ ok: true } | { ok: false;
reason: string }` shape becomes `{ ok: true } | { ok: false;
fieldErrors: Map<...>; flowError?: string }`.
  - Update each row's render path (`renderNameRow`, `renderHotkeyRow`,
    `renderInstructionsRows`, the provider/model rows, etc.) to
    append a dim error-coloured inline line when
    `this.fieldErrors.get(<row>)` is set. Errors render after
    any existing inline status hints for the row.
  - Remove the bottom-strip render of `this.error` from
    `renderMessages()`. Replace with a render of `this.flowError`
    (when set), preserving the same colour and indentation.
  - In each row's input handler, call a new
    `clearFieldError(row: EditorRowId)` helper that drops the
    appropriate entries from `fieldErrors` per the clearing
    rules above.
  - Provider and Model row's input handlers each clear errors
    according to the cross-row coupling (changing Provider also
    clears Model error).
- Tests:
  - Update existing tests that asserted on the bottom-strip
    `"Name is required."` rendering to assert the inline location.
  - Add tests for the all-failures-at-once contract: open editor
    with empty Name, empty Provider, empty Model, press Save,
    assert all three inline errors render simultaneously.
  - Add tests for the clearing rules: after a Save fails with
    multiple inline errors, type into Name → Name error clears;
    change Provider → Provider AND Model errors clear; etc.
  - Verify `"Save cancelled."` continues to render in the
    bottom strip (flow error path).
- No schema changes, no storage changes, no public-API changes.
- No interaction with `polish-editor-picker-copy` (different rows,
  different render paths) or `add-editor-row-help-overlay` (help
  is on F1, validation errors are on Save). The three changes can
  land in any order.
