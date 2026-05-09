## MODIFIED Requirements

### Requirement: Save / Cancel / Test actions

The editor SHALL expose three actions:

- **Save**: validates required fields and name uniqueness in the chosen scope, then routes through `addPreset` (new) or `updatePreset` (existing) from the storage CRUD primitives. On scope change for an existing preset, the package SHALL prompt for confirmation and on yes perform a move (write to new scope, remove from old).
- **Cancel**: closes without writing.
- **Test (apply temporarily)**: applies the current form state for the session by invoking activation `apply` directly, without persisting any changes to disk. The Test button SHALL be rendered only when the caller wires a test callback.

The editor SHALL distinguish between **field-tied** validation errors and **flow-state** errors:

- Field-tied errors describe a problem with a specific form row's value (e.g. Name is empty, Hotkey is malformed, Name collides with another preset in the same scope). Each is attached to the row that owns the failing value.
- Flow-state errors describe a problem with the user's interaction flow that does not belong to a single row (e.g. `"Save cancelled."` after the user declines a confirmation dialog).

Field-tied errors SHALL render inline beneath the offending row, in the editor's `error` colour, at the same 4-space indentation other inline hints use. They SHALL co-exist with any existing inline status hints on the same row (e.g. the Tools session-mode hint, the Thinking dimmed-levels hint), appearing after the status hint when both are present. Flow-state errors SHALL render in the dialog's bottom message strip, alongside the hotkey-reload notice.

Save and Test SHALL run the full validation pipeline and SHALL surface ALL field-tied failures simultaneously in a single render pass, not just the first failure encountered. The previously-combined error for empty Provider and empty Model SHALL be split into two row-specific messages: `"Provider is required."` (attached to the Provider row) and `"Model is required."` (attached to the Model row). When both rows are empty, both messages SHALL render simultaneously.

The validation pipeline SHALL run all pure data checks (required fields, name collision, hotkey parse) BEFORE any confirmation dialogs (Pi-builtin hotkey, hotkey conflict). This ordering guarantees that when the user declines a confirmation dialog, every field-level problem detectable by data-only checks has already been collected and is preserved across the decline. When the user declines, the editor SHALL retain the collected field errors AND SHALL surface the flow-state message `"Save cancelled."` in the bottom message strip; the field errors SHALL render inline beside the flow message in the same render pass.

#### Scenario: Save with valid data

- **WHEN** the user fills required fields with valid values and presses Save
- **THEN** the file SHALL be written atomically and the editor SHALL close

#### Scenario: Save with name collision

- **WHEN** the chosen name already exists in the chosen scope (excluding the preset being edited)
- **THEN** save SHALL be refused with an inline error attached to the Name row reading `"A preset named \"<name>\" already exists in <scope>."`
- **AND** the user SHALL remain in the editor

#### Scenario: Save with multiple empty required fields

- **WHEN** the user opens the editor for a new preset (Name, Provider, and Model all empty) and presses Save
- **THEN** the editor SHALL render three inline errors simultaneously: `"Name is required."` beneath the Name row, `"Provider is required."` beneath the Provider row, and `"Model is required."` beneath the Model row
- **AND** no error SHALL appear in the bottom message strip

#### Scenario: Save with only Provider empty

- **WHEN** the user opens the editor for a new preset, types a Name, leaves Provider unselected, and presses Save
- **THEN** the editor SHALL render `"Provider is required."` beneath the Provider row
- **AND** the editor SHALL NOT render `"Model is required."` (Model is allowed to be empty when Provider is the unselected blocker)

> Note: in practice the Model row's value is empty whenever Provider is empty (Model is filtered by Provider), so the Save attempt above produces both errors. The scenario above is illustrative — the contract is "an error fires only when its own check fails", not "errors are deduplicated against each other".

#### Scenario: Cancel

- **WHEN** the user presses Cancel
- **THEN** the editor SHALL close and no file write SHALL occur

#### Scenario: Test temporary apply

- **WHEN** the user invokes Test
- **THEN** the activation flow SHALL run with the current form state; the editor SHALL close
- **AND** no file SHALL be written

#### Scenario: Test reports the candidate preset

- **WHEN** the user invokes Test and activation succeeds
- **THEN** the editor's resolved result SHALL identify the candidate preset that was activated (so the picker's outer notification surface names the right preset)

#### Scenario: Renaming the currently-active preset

- **WHEN** the user renames the currently-active preset and saves
- **THEN** the in-memory active preset's name SHALL update in place and a fresh `presets-plus:active` custom entry SHALL be appended with the new name

#### Scenario: Scope change for existing preset

- **WHEN** the user changes scope for an existing preset and saves
- **THEN** a confirmation prompt SHALL appear; on yes, the preset SHALL be added to the new scope and removed from the old scope

#### Scenario: Save cancelled via confirmation dialog

- **WHEN** the user presses Save and a confirmation dialog (e.g. for a Pi built-in hotkey or a hotkey conflict) appears, and the user declines
- **THEN** the dialog SHALL close and the editor SHALL display the flow-state message `"Save cancelled."` in the bottom message strip
- **AND** no inline field error SHALL be set as a result of the cancellation

#### Scenario: Save cancelled retains pre-collected field errors

- **GIVEN** the user has an empty Name and a Hotkey that conflicts with another preset's hotkey
- **WHEN** the user presses Save and declines the conflict-confirmation dialog
- **THEN** the editor SHALL display the flow-state message `"Save cancelled."` in the bottom message strip
- **AND** the inline error `"Name is required."` SHALL remain rendered beneath the Name row in the same render pass
- **AND** the user SHALL NOT need to press Save a second time to surface the Name error

#### Scenario: Name-collision check runs before confirmation dialogs

- **GIVEN** the user has changed Name to a value that collides with another preset in the same scope AND set a Hotkey that triggers a Pi-builtin or conflict confirmation
- **WHEN** the user presses Save
- **THEN** the inline name-collision error SHALL be rendered beneath the Name row regardless of whether the user accepts or declines the confirmation
- **AND** the name-collision error SHALL never be skipped because a confirmation interrupted the validation pipeline

## ADDED Requirements

### Requirement: Field errors clear on user input that could resolve them

When the editor has rendered a field-tied error, that error SHALL be cleared from the editor's state when the user makes a change to a field whose new value could plausibly resolve the error. The clearing rules SHALL apply on the input event (typing into an input, cycling a radio, etc.), not at the next Save.

The clearing rules:

- Editing the Name input SHALL clear the Name field error.
- Editing the Hotkey input SHALL clear the Hotkey field error.
- Changing the Scope row's selection SHALL clear the Name field error (a name collision in one scope may not collide in another).
- Changing the Provider row's selection SHALL clear BOTH the Provider field error AND the Model field error (the previously-selected Model is implicitly invalidated by the Provider change).
- Changing the Model row's selection SHALL clear the Model field error.

The editor SHALL also clear ALL field errors and the flow error at the start of every Save or Test attempt, before re-running the validator. This guarantees that a stale error from a prior Save attempt is never visible alongside fresh validator output.

#### Scenario: Typing into Name clears the Name error

- **GIVEN** the user pressed Save with Name empty and the editor rendered `"Name is required."` beneath the Name row
- **WHEN** the user types one or more characters into Name
- **THEN** the inline error beneath the Name row SHALL no longer render

#### Scenario: Changing Provider clears Provider AND Model errors

- **GIVEN** the user pressed Save with Provider empty and Model empty, and the editor rendered both `"Provider is required."` and `"Model is required."` inline
- **WHEN** the user selects a Provider value
- **THEN** the inline errors beneath the Provider row AND beneath the Model row SHALL both no longer render
- **AND** the user SHALL be able to subsequently select a Model and Save without the prior errors leaking back

#### Scenario: Changing Scope clears the Name error

- **GIVEN** the user pressed Save with a Name that collides in the current scope, and the editor rendered the collision error beneath the Name row
- **WHEN** the user changes the Scope row to a scope where the Name does not collide
- **THEN** the inline error beneath the Name row SHALL no longer render
- **AND** the user must press Save again to confirm the new scope's collision check

#### Scenario: Save attempt clears all stale errors before re-validating

- **GIVEN** the editor has rendered field errors from a prior Save attempt
- **WHEN** the user presses Save again
- **THEN** the editor SHALL clear all field errors before re-running the validator
- **AND** any errors fired by the new validator pass SHALL reflect only the current form state

#### Scenario: Cycling Thinking does not clear unrelated errors

- **GIVEN** the editor has rendered a field error beneath the Hotkey row
- **WHEN** the user cycles the Thinking row's radio selection (a row with no validation today)
- **THEN** the inline error beneath the Hotkey row SHALL still render unchanged
