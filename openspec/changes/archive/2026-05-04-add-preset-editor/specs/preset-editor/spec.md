## ADDED Requirements

### Requirement: Editor UI for one preset

The package SHALL provide an editor UI (opened via `openEditor(ctx, preset?)` or the picker's `e` / `n` keys) that exposes form rows for: name, scope (radio user/project), provider (select sourced from `ctx.modelRegistry`), model (select sourced from `ctx.modelRegistry.getAll()` filtered to the chosen provider; entries without configured auth SHALL remain selectable and SHALL be marked inline — for example with a dim `(no key)` suffix — so a preset whose model lost its key can still be edited), thinking level (radio), tools (toggle between `session` — session tools pass through unchanged — and `preset` — an explicit multi-select), instructions (multi-line text area), hotkey (text input with format validation), and Save / Cancel / Test action buttons.

#### Scenario: Model dropdown surfaces unavailable models

- **WHEN** the editor is opened for an existing preset whose resolved model has no configured auth (`hasConfiguredAuth` returns false)
- **THEN** that model SHALL appear in the Model row's dropdown selection
- **AND** the entry SHALL carry a visual availability hint (e.g. a dim `(no key)` suffix) distinguishing it from fully-configured models
- **AND** the user SHALL be able to cycle back to the entry after navigating away

#### Scenario: Open editor for existing preset

- **WHEN** the editor is opened for an existing preset
- **THEN** all form fields SHALL be pre-populated with the preset's current values

#### Scenario: Open editor for a new preset

- **WHEN** `openEditor(ctx)` is called with no preset
- **THEN** the form SHALL open with sensible defaults (empty name, scope = user, provider/model unselected, thinking = off, tools = session, instructions empty, hotkey empty)

### Requirement: Thinking-level radio respects model capability

The editor's thinking-level radio SHALL render greyed and unselectable for any level not in `validThinkingLevels(currentlySelectedModel)`. When the user changes the model field such that the currently-selected thinking level becomes invalid, the radio SHALL snap the selection to `"off"` and SHALL display an inline notice explaining that the new model does not support extended thinking. The auto-snap SHALL be triggered only by user-driven model or provider changes; opening the editor SHALL NOT mutate the form's selected thinking level.

#### Scenario: Reasoning model selected

- **WHEN** the editor's selected model has `reasoning: true`
- **THEN** all six thinking levels SHALL be selectable

#### Scenario: Non-reasoning model selected

- **WHEN** the editor's selected model has `reasoning: false`
- **THEN** thinking-level options other than `"off"` SHALL be visually disabled and SHALL NOT be selectable

#### Scenario: Changing model invalidates current selection

- **WHEN** the user changes the model field from a reasoning model to a non-reasoning model while a non-`"off"` thinking level is selected
- **THEN** the thinking selection SHALL snap to `"off"` and an inline notice SHALL appear naming the new model

#### Scenario: Opening editor for a clamp-warning preset does not mutate selection

- **WHEN** the editor is opened for an existing preset whose declared `thinkingLevel` is non-`"off"` and whose resolved model has `reasoning: false`
- **THEN** the form's selected thinking level SHALL remain at the declared value
- **AND** no "switched to off" notice SHALL appear
- **AND** if the user presses Save without further edits the persisted preset's `thinkingLevel` SHALL equal the original declared value

### Requirement: Tools row supports session and preset modes

The editor's tools row SHALL offer two modes: `session` (the saved preset has no `tools` field — session tools pass through unchanged at apply time) and `preset` (the saved preset has an explicit `tools` array). When `preset` is chosen, a multi-toggle list of all tools from `pi.getAllTools()` SHALL be shown, pre-checked from the preset's current `tools` value or from `pi.getActiveTools()` if the preset has no tools yet. The pre-check SHALL be computed when the editor opens, not when the user first enters `preset` mode, so the initial selection reflects a consistent snapshot of the live session regardless of later activity.

#### Scenario: Session mode

- **WHEN** the user saves the preset with the tools row set to `session`
- **THEN** the persisted preset SHALL omit the `tools` field

#### Scenario: Preset mode

- **WHEN** the user toggles `preset` and selects three tools
- **THEN** the persisted preset SHALL contain `tools: [<the three names>]`

#### Scenario: Pre-check seeded at open time for a preset without tools

- **WHEN** the editor is opened for a preset with no `tools` field while `pi.getActiveTools()` returns a non-empty list
- **THEN** the multi-toggle SHALL be pre-checked with those active tool names
- **AND** the tools row SHALL remain in `session` mode so the persisted preset still omits `tools` until the user explicitly toggles to `preset` mode

### Requirement: Instructions text area

The editor's instructions row SHALL include a multi-line text area supporting basic editing (typing, backspace, left/right cursor movement). Pressing Enter while focused on the text area SHALL insert a newline character into the buffer; the user SHALL leave the text area via the row-cycling keys (Tab / arrow keys consumed by the form's focus manager). The package SHALL NOT spawn an external editor in this change.

#### Scenario: Inline edit

- **WHEN** the user types into the text area
- **THEN** the saved preset's `instructions` field SHALL contain the typed content

#### Scenario: Newline insertion

- **WHEN** the user presses Enter while focused on the instructions text area
- **THEN** a `\n` SHALL be inserted at the cursor position
- **AND** the saved preset's `instructions` field SHALL contain the newline

### Requirement: Hotkey input field with validation and warnings

The editor's hotkey field SHALL accept a free-text key combination string (e.g. `ctrl+shift+1`). On save, the package SHALL validate the format. If the chosen key matches a documented pi built-in or is already claimed by another preset, the package SHALL warn and require explicit confirmation before completing the save. When the field is changed from a previously-saved value (or cleared from one), the editor SHALL display a notice that the hotkey change requires `/reload` (because pi exposes no `unregisterShortcut`).

#### Scenario: Invalid format

- **WHEN** the user enters an unparseable key combination and clicks Save
- **THEN** save SHALL be refused with an inline error and the user SHALL remain in the editor

#### Scenario: Conflict with another preset's hotkey

- **WHEN** the entered hotkey matches another preset's `hotkey` field
- **THEN** a confirmation prompt SHALL appear naming the conflicting preset before save proceeds

#### Scenario: Conflict with pi built-in

- **WHEN** the entered hotkey matches a documented pi built-in (e.g. `ctrl+l`, `ctrl+p`)
- **THEN** a confirmation prompt SHALL appear before save proceeds

#### Scenario: Hotkey change requires /reload notice

- **WHEN** the hotkey field changes from a previously-saved non-empty value to any other value (including empty)
- **THEN** the editor SHALL display a notice that the change takes effect after `/reload`

### Requirement: Save / Cancel / Test actions

The editor SHALL expose three actions:

- **Save**: validates required fields and name uniqueness in the chosen scope, then routes through `addPreset` (new) or `updatePreset` (existing) from the storage CRUD primitives. On scope change for an existing preset, the package SHALL prompt for confirmation and on yes perform a move (write to new scope, remove from old).
- **Cancel**: closes without writing.
- **Test (apply temporarily)**: applies the current form state for the session by invoking activation `apply` directly, without persisting any changes to disk. The Test button SHALL be rendered only when the caller wires a test callback.

#### Scenario: Save with valid data

- **WHEN** the user fills required fields with valid values and presses Save
- **THEN** the file SHALL be written atomically and the editor SHALL close

#### Scenario: Save with name collision

- **WHEN** the chosen name already exists in the chosen scope (excluding the preset being edited)
- **THEN** save SHALL be refused with an inline error and the user SHALL remain in the editor

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

### Requirement: Picker CRUD action keys are functional

The picker's `n`, `e`, `d`, `x`, `c`, `⌃↑`, and `⌃↓` keys SHALL perform real actions: new (open editor with sensible defaults for a new preset), edit (open editor for selected), duplicate (with confirmation; create copy with unique name suffix and cleared hotkey), delete (with confirmation), clear active preset (with confirmation), and reorder up/down within the selected preset's scope (persists via `reorderWithinScope`). After every successful CRUD operation the picker SHALL refresh by calling `loadAll`.

#### Scenario: New from picker

- **WHEN** the user presses `n` in the picker
- **THEN** the editor SHALL open with sensible defaults for a new preset (no preset pre-loaded)

#### Scenario: Edit from picker

- **WHEN** the user presses `e` on a selected preset
- **THEN** the editor SHALL open pre-populated for that preset

#### Scenario: Duplicate from picker

- **WHEN** the user presses `d` on selected preset `plan` and confirms
- **THEN** a new preset SHALL be created in the same scope via `addPreset` with name `plan-copy` (or the next available `plan-copy-N`), with `hotkey` cleared, then placed immediately after the source in file order via `reorderWithinScope`

#### Scenario: Delete with confirmation

- **WHEN** the user presses `x` on a selected preset and confirms the prompt
- **THEN** the preset SHALL be removed from its source file and the picker SHALL refresh

#### Scenario: Clear active preset from picker

- **WHEN** the user presses `c` and confirms
- **THEN** activation `clear` SHALL be invoked

#### Scenario: Reorder up

- **WHEN** the user presses `⌃↑` on a selected preset
- **THEN** the preset SHALL swap positions with the preset above it within the same scope and the file SHALL be persisted

#### Scenario: Reorder boundary

- **WHEN** the user presses `⌃↑` on the topmost preset of its scope
- **THEN** the operation SHALL be a no-op (no file write)

### Requirement: Preset CRUD is exposed through the picker, not subcommands

The `/presets` command SHALL NOT add `save`, `edit`, or `rm` subcommands for preset CRUD in this change. Users SHALL reach create, edit, duplicate, delete, reorder, and clear actions through the picker dialog.

#### Scenario: save subcommand is not added

- **WHEN** the user runs `/presets save quickfix`
- **THEN** the package SHALL NOT open the editor from that subcommand

#### Scenario: edit subcommand is not added

- **WHEN** the user runs `/presets edit plan`
- **THEN** the package SHALL NOT open the editor from that subcommand

#### Scenario: rm subcommand is not added

- **WHEN** the user runs `/presets rm plan`
- **THEN** the package SHALL NOT remove the preset from that subcommand

### Requirement: Thinking-level clamp warning at load time

For each loaded preset whose `thinkingLevel` is non-`"off"` and whose resolved model has `reasoning: false`, the package SHALL tag the in-memory preset with `clampWarning: true`. The preset SHALL still load and remain available for activation (no fail). The user's preset file SHALL NOT be modified by the package.

#### Scenario: Reasoning model with non-off thinking level

- **WHEN** a preset declares `thinkingLevel: "high"` and its resolved model has `reasoning: true`
- **THEN** the preset SHALL NOT carry a `clampWarning` flag

#### Scenario: Non-reasoning model with non-off thinking level

- **WHEN** a preset declares `thinkingLevel: "high"` and its resolved model has `reasoning: false`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

#### Scenario: Off thinking level with non-reasoning model

- **WHEN** a preset declares `thinkingLevel: "off"` (or omits the field) and its resolved model has `reasoning: false`
- **THEN** the preset SHALL NOT carry a `clampWarning` flag

#### Scenario: Unknown model

- **WHEN** a preset's model does not resolve in the registry
- **THEN** `clampWarning` SHALL NOT be set (the preset is already marked `unavailable: "no-model"`)

### Requirement: Picker renders clamp warning indicator

When a preset card is rendered in the picker and the underlying preset has `clampWarning: true`, the card SHALL show a small `⚠ thinking will be clamped` hint.

#### Scenario: Card with clamp warning

- **WHEN** a preset with `clampWarning: true` appears in the picker
- **THEN** its card SHALL include the clamp warning hint
