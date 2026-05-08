## ADDED Requirements

### Requirement: Single-line text rows hide the cursor when unfocused

The editor's single-line text rows (Name and Hotkey) SHALL render with no cursor character when the row is not the currently-focused row. While unfocused, the rows SHALL render via the same plain key/value renderer used by Provider, Model, and other read-only-when-unfocused rows; the focus indicator on these rows in the unfocused state SHALL therefore be the existing left-margin accent marker (`▌`) alone.

When the row becomes focused, the editor SHALL render it via pi-tui's `Input` widget, which provides the `> ` prompt prefix and inverse-video cursor used during editing. The focused vs. unfocused render forms differ visually (cursor + prompt prefix vs. plain text), and that transition is the primary focus cue alongside the accent marker.

#### Scenario: Name row unfocused renders no cursor

- **WHEN** the editor is open with focus on any row other than Name (and the Name field has a non-empty value)
- **THEN** the Name row's rendered output SHALL contain neither an inverse-video cursor character nor the `> ` prompt prefix
- **AND** the row SHALL render the value as plain text via the same renderer used by other unfocused value rows

#### Scenario: Name row focused renders Input widget

- **WHEN** the user moves focus to the Name row
- **THEN** the Name row SHALL render via pi-tui's `Input` widget, including its `> ` prompt prefix and cursor

#### Scenario: Hotkey row unfocused renders no cursor

- **WHEN** the editor is open with focus on any row other than Hotkey (and the Hotkey field has a non-empty value)
- **THEN** the Hotkey row's rendered output SHALL contain neither an inverse-video cursor character nor the `> ` prompt prefix

#### Scenario: Cursor returns when focus returns

- **WHEN** the user moves focus away from Name and then back to Name
- **THEN** the Name row SHALL again render the `Input` widget with cursor and prompt prefix
- **AND** the value entered before the focus change SHALL be preserved

### Requirement: Empty single-line text rows show a consistent placeholder

When the Name or Hotkey row is unfocused AND its current value is empty, the row SHALL render the placeholder text `"—"` (a single em-dash) in `dim` color, matching the empty-state placeholder used by the Prompt row. The placeholder SHALL be a pure visual indicator with no English copy, deliberately avoiding the word "empty" and any reference to a specific keystroke (the editor accepts both Tab and the arrow keys for navigation, so the placeholder must not privilege one over the others). When the row is focused (regardless of value), the placeholder SHALL NOT render — the `Input` widget's native empty rendering takes over.

When the row's value is non-empty and the row is unfocused, the row SHALL render the value itself (not the placeholder).

#### Scenario: Empty unfocused Name row shows placeholder

- **WHEN** the editor opens for a new preset (Name field is empty) and focus is on a row other than Name
- **THEN** the Name row SHALL display the dim text `"—"` in place of the value
- **AND** no cursor character SHALL be rendered on the row

#### Scenario: Empty unfocused Hotkey row shows placeholder

- **WHEN** the Hotkey field is empty and focus is on a row other than Hotkey
- **THEN** the Hotkey row SHALL display the dim text `"—"` in place of the value

#### Scenario: Non-empty unfocused row shows the value

- **WHEN** the Name field has the value `my-preset` and focus is on a row other than Name
- **THEN** the Name row SHALL display `my-preset` (not the placeholder)

#### Scenario: Focused empty row does not show the placeholder

- **WHEN** the Name field is empty and the user moves focus to the Name row
- **THEN** the Name row SHALL render the `Input` widget's normal empty state (cursor + `> ` prefix), NOT the dim placeholder text

### Requirement: Editor accepts global keyboard shortcuts for Save / Test / Cancel

The editor SHALL accept the following keyboard shortcuts at any focus state, including while the user is typing into a text field. These shortcuts SHALL be intercepted at the top of the editor's input handler, before delegating to the focused row's handler, so that single-line and multi-line text rows do not consume the keystrokes:

- `Ctrl+S` SHALL trigger the same code path as activating the Save button.
- `Ctrl+T` SHALL trigger the same code path as activating the Test button. The shortcut SHALL be a no-op (and the keystroke SHALL fall through to the focused row's handler) when the caller has not wired a test callback (i.e. when the Test button is not rendered).
- `Esc` SHALL trigger the same code path as activating the Cancel button (this preserves existing behavior).

Save invoked via `Ctrl+S` SHALL run the same validation, name-collision handling, scope-change confirmation, and post-save plumbing as Save invoked via the on-screen button. Test invoked via `Ctrl+T` SHALL run the same activation flow as Test invoked via the on-screen button.

The on-screen Save / Cancel / Test buttons SHALL remain in the dialog and remain reachable by Tab-cycling; the shortcuts are an additional path, not a replacement.

#### Scenario: Ctrl+S saves from a text field

- **GIVEN** the user has filled all required fields and focus is on the Prompt text area
- **WHEN** the user presses `Ctrl+S`
- **THEN** the editor SHALL run the Save flow as if the user had Tab-cycled to the Save button and activated it
- **AND** the Prompt text area SHALL NOT receive the `Ctrl+S` keystroke

#### Scenario: Ctrl+S surfaces validation errors

- **GIVEN** the user has not filled a required field
- **WHEN** the user presses `Ctrl+S`
- **THEN** the editor SHALL surface the same validation error that the Save button would surface
- **AND** the editor SHALL remain open

#### Scenario: Ctrl+T tests when the Test callback is wired

- **GIVEN** the editor was opened with a test callback
- **WHEN** the user presses `Ctrl+T` while focused on any row
- **THEN** the editor SHALL run the temporary-apply Test flow as if the Test button had been activated

#### Scenario: Ctrl+T is a no-op when the Test callback is not wired

- **GIVEN** the editor was opened without a test callback (the Test button is not rendered)
- **WHEN** the user presses `Ctrl+T`
- **THEN** no test flow SHALL run
- **AND** the editor SHALL NOT close

#### Scenario: Esc cancels from a text field

- **GIVEN** focus is on the Prompt text area
- **WHEN** the user presses `Esc`
- **THEN** the editor SHALL close without writing
- **AND** the Prompt text area SHALL NOT receive the `Esc` keystroke

### Requirement: Footer hint surfaces the editor shortcuts

The editor's footer SHALL include hint lines listing both the navigation keys and the global keyboard shortcuts. The footer SHALL render two dim-colored hint lines:

- A **navigation hint line** containing tokens for the keys that move focus, change radio values, toggle checkboxes, and activate buttons. The line SHALL contain at minimum the tokens `Tab/↑/↓ Move`, `←/→ Change`, `Space Toggle`, and `Enter Action`.
- A **shortcut hint line** containing the global keyboard shortcuts. The line SHALL contain `^S Save` and `Esc Cancel`. The `^T Test` token SHALL appear on this line if and only if the editor was opened with a test callback (matching the rule that the Test button is not rendered in that case).

The two hint lines SHALL render in this order: navigation first, shortcuts second. The on-screen Save / Cancel / Test buttons remain reachable via Tab-cycling regardless of the hint lines.

#### Scenario: Footer renders navigation hints

- **WHEN** the editor is rendered
- **THEN** the footer SHALL contain a navigation hint line including the tokens `Tab/↑/↓ Move`, `←/→ Change`, `Space Toggle`, and `Enter Action`

#### Scenario: Footer renders shortcut hints with Save and Cancel

- **WHEN** the editor is rendered
- **THEN** the footer SHALL contain a shortcut hint line including the tokens `^S Save` and `Esc Cancel`

#### Scenario: Footer renders Test shortcut when wired

- **GIVEN** the editor was opened with a test callback
- **WHEN** the editor is rendered
- **THEN** the footer's shortcut hint line SHALL contain a `^T Test` token

#### Scenario: Footer omits Test shortcut when unwired

- **GIVEN** the editor was opened without a test callback
- **WHEN** the editor is rendered
- **THEN** the footer's shortcut hint line SHALL NOT contain a `^T Test` token
