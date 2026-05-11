## MODIFIED Requirements

### Requirement: Instructions text area

The editor's instructions row SHALL remain a single-line preview in the form. The preview SHALL flatten newlines to the literal three characters `" ↵ "` (space, U+21B5 downwards arrow with corner leftwards, space) and truncate with the U+2026 horizontal ellipsis so that the row's rendered width does not exceed the form's row budget.

The instructions row SHALL NOT carry an in-row editable cursor. The previous `instructionsCursor` state, the per-character left / right / backspace / insert input handling for the row, and the in-row `Enter inserts \n` behavior SHALL NOT be present.

When the instructions row is focused, pressing the Enter key SHALL push a dedicated prompt-editor overlay (see "Prompt-editor overlay"). All other keys SHALL behave as elsewhere in the form: Tab / arrow keys cycle row focus through the focus manager; printable characters do not insert into the row.

When the prompt-editor overlay resolves with a confirmed edit, the form's in-memory `state.instructions` SHALL be replaced with the overlay's resolved text. When the overlay resolves with cancellation, the form's `state.instructions` SHALL remain unchanged. The outer editor's Save / Cancel / Test contracts SHALL operate on the form's `state.instructions` as they do today; overlay confirmation does not persist to disk, and overlay cancellation does not affect any prior overlay confirmation that was already merged into form state during the same outer-editor session.

#### Scenario: Activate-to-push from the instructions row

- **WHEN** the user focuses the instructions row and presses Enter
- **THEN** a prompt-editor overlay SHALL open
- **AND** the overlay's initial text SHALL equal the form's current `state.instructions` value

#### Scenario: Confirmed overlay edit lands in form state

- **WHEN** the user confirms an overlay edit (Ctrl-S) with text `T`
- **THEN** the form's `state.instructions` SHALL equal `T`
- **AND** the form's Prompt row preview SHALL re-render reflecting `T` (with newlines flattened to `" ↵ "` and width-truncated)

#### Scenario: Cancelled overlay leaves form state untouched

- **WHEN** the user cancels the overlay (Esc) after typing in it
- **THEN** the form's `state.instructions` SHALL equal its value at the moment the overlay opened
- **AND** the form's Prompt row preview SHALL render that prior value

#### Scenario: Outer-editor Cancel discards a confirmed overlay edit

- **WHEN** the user confirms an overlay edit and then cancels the outer editor (without pressing Save)
- **THEN** the on-disk preset's `instructions` field SHALL remain at its prior value
- **AND** no overlay-confirmed edit SHALL be persisted

#### Scenario: Outer-editor Save persists the overlay-confirmed edit

- **WHEN** the user confirms an overlay edit with text `T` and then presses Save on the outer editor (with all other validation passing)
- **THEN** the on-disk preset's `instructions` field SHALL be exactly `T`

#### Scenario: Non-Enter input on the instructions row is inert

- **WHEN** the instructions row is focused and the user presses a printable character (e.g. `a`)
- **THEN** the form's `state.instructions` SHALL NOT change
- **AND** the prompt-editor overlay SHALL NOT open

#### Scenario: Newline insertion happens only inside the overlay

- **WHEN** the instructions row is focused (overlay not open) and the user presses Enter
- **THEN** the overlay SHALL open
- **AND** the form's `state.instructions` SHALL NOT receive a `\n` character

## ADDED Requirements

### Requirement: Prompt-editor overlay

The package SHALL provide a prompt-editor delegate (`openPromptEditor(ctx, options)`) used by the editor's instructions row activate flow. The delegate SHALL call Pi's built-in `ctx.ui.editor(title, prefill)` multi-line editor rather than owning a custom `pi-tui` editor wrapper.

The delegate SHALL accept `{ presetName: string | undefined; initialText: string }` and SHALL resolve to one of:

- `{ confirmed: true; text: string }` — `text` is the string returned by `ctx.ui.editor`.
- `{ confirmed: false }` — `ctx.ui.editor` returned `undefined` for cancellation.

The delegate SHALL pass `initialText` as the built-in editor prefill. It SHALL pass a title of the form `Edit prompt: <presetName>` when `presetName` is defined and non-empty, or `Edit prompt` otherwise. Text-editing mechanics, keybindings, paste behavior, and rendering belong to Pi's built-in editor.

#### Scenario: Overlay opens with the supplied initial text

- **WHEN** the overlay is opened with `initialText = "# A\n\nB"`
- **THEN** `ctx.ui.editor` SHALL be called with prefill `"# A\n\nB"`

#### Scenario: Built-in editor returns confirmed text

- **WHEN** `ctx.ui.editor` resolves to text `T`
- **THEN** the delegate SHALL resolve to `{ confirmed: true; text: T }`

#### Scenario: Built-in editor cancellation is preserved

- **WHEN** `ctx.ui.editor` resolves to `undefined`
- **THEN** the delegate SHALL resolve to `{ confirmed: false }`

#### Scenario: Header reflects the preset name when supplied

- **WHEN** the overlay is opened with `presetName = "plan"`
- **THEN** the overlay header SHALL read `Edit prompt: plan`

#### Scenario: Header omits the preset name when absent

- **WHEN** the overlay is opened with `presetName = undefined` (e.g. a new preset whose name has not been entered yet)
- **THEN** the overlay header SHALL read `Edit prompt`
