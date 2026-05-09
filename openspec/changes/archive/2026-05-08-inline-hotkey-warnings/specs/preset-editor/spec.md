## MODIFIED Requirements

### Requirement: Hotkey input field with validation and warnings

The editor's hotkey field SHALL accept a free-text key combination string (e.g. `ctrl+shift+1`). On save, the package SHALL validate the format.

If the entered key is unparseable, the editor SHALL set a row-tied **error** diagnostic on the Hotkey row reading the parser's `reason`. Errors block Save (Save is refused; user remains in the editor).

If the entered key parses successfully and matches a documented pi built-in OR is already claimed by another preset, the editor SHALL set a row-tied **warning** diagnostic on the Hotkey row. Warnings render inline beneath the Hotkey row in the theme's `warning` color (yellow), with a `⚠` glyph prefix and a sentence-cased message ending with a terminal period. Warnings do NOT block Save — the user is informed but can proceed by pressing Save again. The wording is:

- For a Pi-builtin shadow: `"⚠ <normalized> shadows a Pi built-in; saving will replace Pi's behavior for this key."` where `<normalized>` is the parsed-and-normalized hotkey form (e.g. `Ctrl+Shift+1`).
- For another-preset conflict: `"⚠ <normalized> is already used by preset \"<name>\"; this preset's binding will be skipped."` where `<name>` is the conflicting preset's name.

The editor SHALL NOT open modal confirmation dialogs for these warnings. The previous `HOTKEY_SHADOWS_TITLE` / `HOTKEY_CONFLICT_TITLE` confirm flows are removed.

The editor SHALL recompute the Hotkey diagnostic eagerly after every Hotkey edit, not only at Save time, so the user sees the warning while they are still typing rather than only after pressing Save. The Save pipeline SHALL still re-check as a backstop.

When the field is changed from a previously-saved value (or cleared from one), the editor SHALL display a notice that the hotkey change requires `/reload` (because pi exposes no `unregisterShortcut`). This notice is unrelated to the warning diagnostic and renders in the dim color via the existing `formatHotkeyReloadNotice` path.

#### Scenario: Invalid format

- **WHEN** the user enters an unparseable key combination
- **THEN** the editor SHALL set an **error** diagnostic on the Hotkey row reading the parser's `reason`
- **AND** if the user presses Save, save SHALL be refused and the user SHALL remain in the editor

#### Scenario: Conflict with another preset's hotkey

- **WHEN** the entered hotkey matches another preset's `hotkey` field
- **THEN** the editor SHALL set a **warning** diagnostic on the Hotkey row reading exactly `"⚠ <normalized> is already used by preset \"<conflicting-name>\"; this preset's binding will be skipped."`
- **AND** no modal confirmation dialog SHALL appear
- **AND** if the user presses Save, save SHALL proceed (the warning is non-blocking)

#### Scenario: Conflict with pi built-in

- **WHEN** the entered hotkey matches a documented pi built-in (e.g. `ctrl+l`, `ctrl+p`)
- **THEN** the editor SHALL set a **warning** diagnostic on the Hotkey row reading exactly `"⚠ <normalized> shadows a Pi built-in; saving will replace Pi's behavior for this key."`
- **AND** no modal confirmation dialog SHALL appear
- **AND** if the user presses Save, save SHALL proceed

#### Scenario: Hotkey change requires /reload notice

- **WHEN** the hotkey field changes from a previously-saved non-empty value to any other value (including empty)
- **THEN** the editor SHALL display a notice that the change takes effect after `/reload`

#### Scenario: Warning recomputes proactively as the user types

- **GIVEN** another preset already uses the hotkey `ctrl+m`
- **WHEN** the user types `ctrl+m` into the Hotkey row (without yet pressing Save)
- **THEN** the editor SHALL render the inline warning beneath the Hotkey row before the user presses Save

#### Scenario: Warning clears when the user changes the hotkey

- **GIVEN** the editor has rendered an inline warning beneath the Hotkey row
- **WHEN** the user edits the Hotkey value to something that no longer triggers a warning
- **THEN** the inline warning SHALL no longer render

### Requirement: Save / Cancel / Test actions

The editor SHALL expose three actions:

- **Save**: validates required fields and name uniqueness in the chosen scope, then routes through `addPreset` (new) or `updatePreset` (existing) from the storage CRUD primitives. On scope change for an existing preset, the package SHALL prompt for confirmation and on yes perform a move (write to new scope, remove from old).
- **Cancel**: closes without writing.
- **Test (apply temporarily)**: applies the current form state for the session by invoking activation `apply` directly, without persisting any changes to disk. The Test button SHALL be rendered only when the caller wires a test callback.

The editor SHALL associate row-level **diagnostics** with form rows via a `Map<EditorRowId, FieldDiagnostic>` where `FieldDiagnostic` carries a `severity` of either `"error"` or `"warning"` and a `message` string. Errors block Save / Test; warnings render inline but do not block. Each is attached to the row that owns the failing or warning value.

The editor SHALL also distinguish **flow-state errors** that do not belong to a single row (e.g. an I/O failure during persist). Flow-state errors render in the dialog's bottom message strip; row-level diagnostics render inline beneath their row.

Field-tied diagnostics SHALL render inline beneath the offending row at the same 4-space indentation other inline hints use. Errors render in the `error` colour (red); warnings render in the `warning` colour (yellow). They SHALL co-exist with any existing inline status hints on the same row, appearing after the status hint when both are present.

Save and Test SHALL run the full validation pipeline and SHALL surface ALL field-tied diagnostics simultaneously in a single render pass, not just the first failure encountered. The previously-combined error for empty Provider and empty Model SHALL be split into two row-specific messages: `"Provider is required."` (attached to the Provider row) and `"Model is required."` (attached to the Model row). When both rows are empty, both messages SHALL render simultaneously.

The validation pipeline SHALL run all pure data checks (required fields, name collision, hotkey parse, hotkey warning recomputation) BEFORE any confirmation dialogs. Save SHALL be blocked if and only if at least one collected diagnostic has `severity: "error"`; warnings alone permit Save to proceed while still rendering the warning to the user during the (brief) period before the editor closes on success.

The editor SHALL no longer surface the flow-state message `"Save cancelled."`. With hotkey conflicts and Pi-builtin shadows now expressed as inline warnings, no validation-pipeline path produces a user-decline outcome. The flow-state surface in `renderMessages()` remains available for I/O failures and any future flow events.

#### Scenario: Save with valid data

- **WHEN** the user fills required fields with valid values and presses Save
- **THEN** the file SHALL be written atomically and the editor SHALL close

#### Scenario: Save with name collision

- **WHEN** the chosen name already exists in the chosen scope (excluding the preset being edited)
- **THEN** save SHALL be refused with an inline **error** attached to the Name row reading `"A preset named \"<name>\" already exists in <scope>."`
- **AND** the user SHALL remain in the editor

#### Scenario: Save with multiple empty required fields

- **WHEN** the user opens the editor for a new preset (Name, Provider, and Model all empty) and presses Save
- **THEN** the editor SHALL render three inline errors simultaneously: `"Name is required."` beneath the Name row, `"Provider is required."` beneath the Provider row, and `"Model is required."` beneath the Model row
- **AND** no error SHALL appear in the bottom message strip

#### Scenario: Save with only warnings proceeds

- **GIVEN** all required fields are valid AND the entered Hotkey shadows a Pi built-in (warning only, no error)
- **WHEN** the user presses Save
- **THEN** save SHALL proceed and the file SHALL be written
- **AND** the editor SHALL close

#### Scenario: Save with both warnings and errors is refused

- **GIVEN** the Name field is empty AND the entered Hotkey conflicts with another preset
- **WHEN** the user presses Save
- **THEN** save SHALL be refused
- **AND** the inline error `"Name is required."` SHALL render beneath the Name row
- **AND** the inline warning `"⚠ ... is already used by preset ..."` SHALL render beneath the Hotkey row

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

#### Scenario: No "Save cancelled." flow message exists

- **WHEN** the editor's source is read
- **THEN** the literal string `"Save cancelled."` SHALL NOT appear in the editor's flow-error vocabulary
- **AND** no validation-pipeline path SHALL set a flow error from a user-decline outcome
