# Preset Editor Specification

## Purpose

Define the interactive editor UI that creates, edits, and temporarily
tests a single preset; the picker CRUD action keys (`n`/`e`/`d`/`x`/`c`
and `⌃↑`/`⌃↓`) that route through the editor and storage primitives;
the hotkey input field with format / conflict / pi-builtin validation
(capture-only until `preset-hotkeys` lands); and the load-time
`clampWarning` flag with its picker indicator. All preset CRUD flows
through the picker dialog — `/presets` does not expose `save`, `edit`,
or `rm` subcommands.

## Requirements

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

The editor's thinking-level radio SHALL render greyed and unselectable for any level not in `validThinkingLevels(currentlySelectedModel)`. `validThinkingLevels` mirrors pi-ai's `getSupportedThinkingLevels`: if the model has `reasoning: false` (or falsy), only `"off"` SHALL be valid; otherwise, for each level other than `"xhigh"` the level is valid unless `thinkingLevelMap?.[level]` is exactly `null`, and `"xhigh"` is valid only when `thinkingLevelMap?.["xhigh"]` is defined and not `null`.

When the user changes the model field such that the currently-selected thinking level becomes invalid, the radio SHALL snap the selection to `"off"`. The auto-snap SHALL be triggered only by user-driven model or provider changes; opening the editor SHALL NOT mutate the form's selected thinking level. The editor SHALL NOT render any inline notice or message accompanying the snap; the visible state of the radio (selected `"off"`, every other dot dimmed and unselectable) and the inline dimmed-levels hint together convey both the resulting state and the reason.

When at least one level is dimmed for the currently-selected model (i.e. `validThinkingLevels(model).length < 6`), the editor SHALL render a single dim hint line beneath the Thinking row. The hint SHALL branch on the model's reasoning capability:

- When the model has `reasoning: false`, the hint SHALL read exactly `"This model does not support thinking."`. This case occurs precisely when the only valid level is `"off"`.
- Otherwise (the model has `reasoning: true` and at least one level is dimmed because `thinkingLevelMap` nulls it or because `xhigh` is not explicitly mapped), the hint SHALL read exactly `"Dimmed levels are unavailable for this model."`.

When no model is selected (`model` is undefined), the dimmed-levels hint SHALL NOT render: `validThinkingLevels(undefined)` returns the full set of levels, and there is genuinely nothing to warn about.

The validity check SHALL access `thinkingLevelMap` defensively so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain selectable; `"xhigh"` is not).

#### Scenario: Reasoning model with no thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** the five levels `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"` SHALL be selectable
- **AND** `"xhigh"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Reasoning model with partial thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** all six thinking levels SHALL be selectable (missing non-xhigh keys fall through to provider defaults, and xhigh is explicitly mapped)
- **AND** no inline dimmed-levels hint SHALL be rendered

#### Scenario: Reasoning model nulls a level in thinkingLevelMap

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** the `"low"` radio entry SHALL be visually disabled and SHALL NOT be selectable
- **AND** `"xhigh"` SHALL also be visually disabled (not explicitly mapped)
- **AND** the remaining four levels SHALL be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Non-reasoning model selected

- **WHEN** the editor's selected model has `reasoning: false`
- **THEN** thinking-level options other than `"off"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"This model does not support thinking."`

#### Scenario: Changing model invalidates current selection

- **WHEN** the user changes the model field such that the previously-selected thinking level is no longer valid for the new model (because the new model has `reasoning: false`, because the new model's `thinkingLevelMap` maps that level to `null`, or because the level is `"xhigh"` and the new model does not explicitly map it)
- **THEN** the thinking selection SHALL snap to `"off"`
- **AND** no inline notice or message SHALL be rendered as a result of the snap

#### Scenario: Opening editor for a clamp-warning preset does not mutate selection

- **WHEN** the editor is opened for an existing preset whose declared `thinkingLevel` is non-`"off"` and whose resolved model would clamp the level (`reasoning: false`, `thinkingLevelMap` maps the level to `null`, or the level is `"xhigh"` and the model does not explicitly map it)
- **THEN** the form's selected thinking level SHALL remain at the declared value
- **AND** if the user presses Save without further edits the persisted preset's `thinkingLevel` SHALL equal the original declared value

#### Scenario: No notice rendered after a snap

- **GIVEN** the user changed model from a reasoning model with `thinkingLevel: "high"` to a non-reasoning model, causing a snap to `"off"`
- **WHEN** the editor renders the dialog
- **THEN** the rendered output SHALL NOT contain any text of the form `"<model> does not support extended thinking"` or any other inline notice produced by the snap
- **AND** the rendered output SHALL contain the new branched dimmed-levels hint, reading `"This model does not support thinking."`
- **AND** the Thinking row's radio SHALL show `● off` with every other level visually dimmed

### Requirement: Tools row supports session and preset modes

The editor's tools row SHALL offer two modes: `session` (the saved preset has no `tools` field — session tools pass through unchanged at apply time) and `preset` (the saved preset has an explicit `tools` array). When `preset` is chosen, a multi-toggle list of all tools from `pi.getAllTools()` SHALL be shown, pre-checked from the preset's current `tools` value or from `pi.getActiveTools()` if the preset has no tools yet. The pre-check SHALL be computed when the editor opens, not when the user first enters `preset` mode, so the initial selection reflects a consistent snapshot of the live session regardless of later activity.

When the row's mode is `session`, the editor SHALL render an inline dim hint beneath the row reading `"Session: inherits the active tool set."`. When the row's mode is `preset`, the editor SHALL render the multi-toggle list directly (no inline explanatory hint is required because the toggle list is self-explanatory).

#### Scenario: Session mode

- **WHEN** the user saves the preset with the tools row set to `session`
- **THEN** the persisted preset SHALL omit the `tools` field

#### Scenario: Session mode hint wording

- **WHEN** the tools row's mode is `session`
- **THEN** the editor SHALL render an inline dim hint beneath the row reading exactly `"Session: inherits the active tool set."`

#### Scenario: Preset mode

- **WHEN** the user toggles `preset` and selects three tools
- **THEN** the persisted preset SHALL contain `tools: [<the three names>]`
- **AND** the editor SHALL NOT render the session-mode inline hint

#### Scenario: Pre-check seeded at open time for a preset without tools

- **WHEN** the editor is opened for a preset with no `tools` field while `pi.getActiveTools()` returns a non-empty list
- **THEN** the multi-toggle SHALL be pre-checked with those active tool names
- **AND** the tools row SHALL remain in `session` mode so the persisted preset still omits `tools` until the user explicitly toggles to `preset` mode

### Requirement: Instructions text area

The editor's instructions row SHALL include a multi-line text area supporting basic editing (typing, backspace, left/right cursor movement). Pressing Enter while focused on the text area SHALL insert a newline character into the buffer; the user SHALL leave the text area via the row-cycling keys (Tab / arrow keys consumed by the form's focus manager). The package SHALL NOT spawn an external editor in this change.

The editor SHALL NOT render an inline hint beneath the Prompt row describing Enter and Tab semantics. The keystroke information is intentionally omitted from the dialog body and from the F1 help overlay's Prompt entry: the footer hint already names the global keys, and the user reaches the keystroke-specific instructions through pi documentation when needed. STATUS-driven inline hints (e.g. those introduced for Tools and Thinking rows) are unaffected by this rule because their content depends on dynamic state that a static help overlay cannot reflect.

#### Scenario: Inline edit

- **WHEN** the user types into the text area
- **THEN** the saved preset's `instructions` field SHALL contain the typed content

#### Scenario: Newline insertion

- **WHEN** the user presses Enter while focused on the instructions text area
- **THEN** a `\n` SHALL be inserted at the cursor position
- **AND** the saved preset's `instructions` field SHALL contain the newline

#### Scenario: No inline hint beneath Prompt

- **WHEN** the editor is rendered
- **THEN** the rendered output SHALL NOT contain the substring `"Enter inserts a newline. Tab exits."` beneath the Prompt row

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

### Requirement: Reload prompt after hotkey-mutating Save

When the editor's Save action completes successfully and the committed preset's hotkey state differs from the runtime hotkey baseline for this extension runtime, the package SHALL open a confirmation overlay titled `"Reload Pi?"` with body text explaining that hotkey changes take effect after a reload, presenting Yes / No actions with No selected by default. On Yes, the package SHALL close the calling overlay flow and call `ctx.reload()`. On No, the package SHALL close the dialog without calling `ctx.reload()`. The editor SHALL close after the overlay is dismissed regardless of which action the user chose.

If the save returns the preset identity and hotkey to the runtime baseline after an earlier un-reloaded edit, no reload prompt SHALL appear. If a hotkey-bearing preset is renamed or moved to another scope, a reload prompt SHALL appear even when the hotkey string is unchanged, because the registered shortcut handler still targets the old identity.

If `ctx.reload` is not available on the surrounding pi build, the prompt SHALL NOT open and the existing inline `formatHotkeyReloadNotice` SHALL remain the only signal. If `ctx.reload()` throws or rejects, the package SHALL surface the error via `ctx.ui.notify(<text>, "error")` and SHALL NOT let the exception escape.

#### Scenario: Save adds a hotkey

- **WHEN** the user creates a new preset with a non-empty hotkey, presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear with No selected by default
- **AND** if the user chooses Yes, `ctx.reload()` SHALL be called after the editor and picker overlay flow closes
- **AND** if the user chooses No, the dialog SHALL close and the editor SHALL close without calling `ctx.reload()`

#### Scenario: Save changes an existing hotkey

- **WHEN** the user edits an existing preset's hotkey from `ctrl+shift+1` to `ctrl+shift+2`, presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear

#### Scenario: Save removes a hotkey

- **WHEN** the user clears an existing preset's runtime-baseline hotkey field, presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear

#### Scenario: Save reverts to runtime baseline

- **WHEN** the user saves a preset whose identity and hotkey match the runtime baseline after an earlier un-reloaded edit
- **THEN** no reload prompt SHALL appear

#### Scenario: Save with no hotkey change

- **WHEN** the user edits any field other than the hotkey or hotkey-bearing identity, presses Save, and the persistence succeeds
- **THEN** no reload prompt SHALL appear

#### Scenario: Save fails persistence

- **WHEN** the user changes the hotkey, presses Save, and persistence fails
- **THEN** no reload prompt SHALL appear

#### Scenario: Scope move with unchanged hotkey

- **WHEN** the user changes scope on an existing preset whose runtime-baseline hotkey is unchanged, confirms the move, and the move succeeds
- **THEN** exactly one reload prompt SHALL appear

#### Scenario: ctx.reload throws

- **WHEN** the user chooses Yes and `ctx.reload()` throws or rejects
- **THEN** an error notification SHALL surface naming the failure
- **AND** the exception SHALL NOT propagate out of the editor flow

#### Scenario: ctx.reload not available

- **WHEN** the surrounding pi build does not expose `ctx.reload`
- **THEN** the reload prompt SHALL NOT open after Save
- **AND** the existing inline hotkey-reload notice SHALL remain the only signal

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

### Requirement: Picker CRUD action keys are functional

The picker's `n`, `e`, `d`, `x`, `c`, `⌃↑`, and `⌃↓` keys SHALL perform real actions: new (open editor with sensible defaults for a new preset), edit (open editor for selected), duplicate (with confirmation; create copy with unique name suffix and cleared hotkey), delete (with confirmation), clear active preset (with confirmation), and reorder up/down within the selected preset's scope (persists via `reorderWithinScope`). After every successful CRUD operation the picker SHALL refresh by calling `loadAll` unless the user chose to reload Pi and the picker closes to allow `ctx.reload()`.

When the `x` (delete) action successfully removes a preset whose runtime-baseline `hotkey` field was non-empty, the picker SHALL open a `"Reload Pi?"` confirmation overlay with No selected by default. On Yes, `ctx.reload()` SHALL be called after the picker closes. On No, the dialog SHALL close and the picker SHALL refresh and remain open as before. If the deleted preset had no runtime-baseline hotkey, no reload prompt SHALL appear.

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

#### Scenario: Delete a preset without a hotkey

- **WHEN** the user presses `x` on a selected preset whose runtime-baseline `hotkey` is empty/absent and confirms the prompt
- **THEN** the preset SHALL be removed from its source file and the picker SHALL refresh
- **AND** no reload prompt SHALL appear

#### Scenario: Delete a preset with a hotkey

- **WHEN** the user presses `x` on a selected preset whose runtime-baseline `hotkey` is non-empty and confirms the delete prompt
- **THEN** the preset SHALL be removed
- **AND** a `"Reload Pi?"` overlay SHALL appear with No selected by default
- **AND** if the user chooses Yes, `ctx.reload()` SHALL be called after the picker closes
- **AND** if the user chooses No, the dialog SHALL close and the picker SHALL refresh and remain open

#### Scenario: ctx.reload throws on post-delete prompt

- **WHEN** the user chooses Yes on the post-delete reload prompt and `ctx.reload()` throws
- **THEN** an error notification SHALL surface and the exception SHALL NOT propagate

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

For each loaded preset whose `thinkingLevel` is non-`"off"` and whose resolved model would clamp that level (the level is not in `validThinkingLevels(model)`), the package SHALL tag the in-memory preset with `clampWarning: true`. The preset SHALL still load and remain available for activation (no fail). The user's preset file SHALL NOT be modified by the package.

#### Scenario: Reasoning model with no thinkingLevelMap and non-xhigh non-off level

- **WHEN** a preset declares `thinkingLevel: "high"` and its resolved model has `reasoning: true` and no `thinkingLevelMap`
- **THEN** the preset SHALL NOT carry a `clampWarning` flag

#### Scenario: Reasoning model with no thinkingLevelMap and xhigh level

- **WHEN** a preset declares `thinkingLevel: "xhigh"` and its resolved model has `reasoning: true` and no `thinkingLevelMap`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

#### Scenario: Reasoning model with the requested non-xhigh level absent from thinkingLevelMap

- **WHEN** a preset declares `thinkingLevel: "low"` and its resolved model has `thinkingLevelMap: { "xhigh": "max" }` (key absent)
- **THEN** the preset SHALL NOT carry a `clampWarning` flag (missing keys fall through to provider defaults)

#### Scenario: Reasoning model nulling the requested level in thinkingLevelMap

- **WHEN** a preset declares `thinkingLevel: "low"` and its resolved model has `thinkingLevelMap: { "low": null }`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

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

The editor's footer SHALL include a single dim hint line listing both the navigation keys and the global keyboard shortcuts. The hint line SHALL contain at minimum the tokens `⇥/↑/↓ Move`, `←/→ Change`, `Space Toggle`, `Enter Action`, `^S Save`, and `Esc Cancel`. When the editor was opened with a test callback, the line SHALL also contain `^T Test`. When no test callback is wired, the line SHALL NOT contain `^T Test` (matching the rule that the Test button is not rendered in that case).

The token for the Tab key SHALL be the symbol `⇥` (U+21E5 RIGHTWARDS ARROW TO BAR), matching the arrow-symbol convention already used by the up/down and left/right movement tokens.

The footer SHALL render the hint as a single line. Terminals narrower than the rendered line MAY visually wrap it; pi-tui's frame handling preserves the content in that case.

The on-screen Save / Cancel / Test buttons remain reachable via Tab-cycling regardless of the footer hint; the shortcuts and the buttons are independent paths to the same actions.

#### Scenario: Footer renders navigation hints

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain the tokens `⇥/↑/↓ Move`, `←/→ Change`, `Space Toggle`, and `Enter Action`

#### Scenario: Footer renders shortcut hints with Save and Cancel

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain `^S Save` and `Esc Cancel`

#### Scenario: Footer renders Test shortcut when wired

- **GIVEN** the editor was opened with a test callback
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain `^T Test`

#### Scenario: Footer omits Test shortcut when unwired

- **GIVEN** the editor was opened without a test callback
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL NOT contain `^T Test`

#### Scenario: Footer renders on a single line

- **GIVEN** the editor was opened with a test callback in a terminal at least 90 columns wide
- **WHEN** the editor is rendered
- **THEN** the footer SHALL emit one framed line containing all seven tokens
- **AND** the footer SHALL NOT split the navigation tokens and the shortcut tokens onto separate framed lines

### Requirement: Editor accepts F1 to open contextual help

The editor SHALL accept the `F1` key as a global shortcut at any focus state, including while the user is typing into a single-line text input or the multi-line text area. The shortcut SHALL be intercepted at the top of the editor's input handler, before delegating to the focused row's handler, so no row consumes the keystroke.

When `F1` is pressed, the editor SHALL open an `info-dialog` overlay (built via `openInfoDialog`) showing per-row help content scoped to the currently-focused row. The editor SHALL hide its own overlay while the help overlay is up (using the existing `runWithHiddenOverlay` pattern that the confirmation dialogs already use) and SHALL restore its overlay when the help dialog is dismissed.

The help overlay SHALL be dismissible via either `Enter` or `Esc` (the `info-dialog` widget's existing contract).

#### Scenario: F1 opens help for the focused row

- **GIVEN** the editor is open with focus on the Hotkey row
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open an `info-dialog` overlay whose title corresponds to the Hotkey row
- **AND** the overlay's body SHALL contain the authored help text for the Hotkey row

#### Scenario: F1 opens help for whichever row is focused

- **GIVEN** the editor is open with focus on the Tools row
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open the help overlay scoped to the Tools row (not Hotkey, Name, or any other row)

#### Scenario: F1 works while typing in a text field

- **GIVEN** the editor is open with focus on the Prompt text area and the user has typed several characters
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open the Prompt help overlay
- **AND** the Prompt text area SHALL NOT receive the `F1` keystroke
- **AND** the typed content SHALL remain unchanged

#### Scenario: Esc dismisses the help overlay

- **GIVEN** the help overlay is open
- **WHEN** the user presses `Esc`
- **THEN** the help overlay SHALL close
- **AND** focus SHALL return to the editor with the same row focused as before help was opened

#### Scenario: Help overlay dismissal restores the editor

- **GIVEN** the help overlay is open
- **WHEN** the user dismisses it
- **THEN** the editor SHALL render again as the topmost overlay
- **AND** the editor's form state SHALL be unchanged from before help was opened

### Requirement: Editor authors per-row help content as a typed registry

The editor SHALL define a module-level constant typed `Record<EditorRowId, EditorRowHelpEntry>` (where `EditorRowHelpEntry` exposes a `title` string, a `body` array of paragraph strings, and an optional `editAddendum` array of paragraph strings shown only when the editor was opened for an existing preset). The constant SHALL be the single source of truth for help content. Adding a new value to `EditorRowId` SHALL require adding the corresponding help entry, enforced by TypeScript's exhaustiveness check.

Each help entry SHALL provide sentence-cased prose (matching the project's prose conventions) covering at minimum the row's purpose, the rules or constraints relevant to its values, and any non-obvious behavior the user should know. Help text SHALL favor friendly user-facing language over implementation-detail terminology (e.g. "Pi" rather than `pi-coding-agent`, "this project" rather than absolute filesystem paths).

When the editor was opened for an existing preset (`this.initialPreset !== undefined`), `openHelpForFocusedRow` SHALL concatenate `body` and `editAddendum` (in that order) before passing the joined paragraphs to the info-dialog overlay. When the editor was opened for a new preset, `editAddendum` paragraphs SHALL NOT appear in the rendered help body.

#### Scenario: Help content covers every form row

- **WHEN** the editor's source is read
- **THEN** the help registry SHALL contain an entry for each value of `EditorRowId`, including `name`, `scope`, `provider`, `model`, `thinking`, `tools`, `instructions`, `hotkey`, and `buttons`
- **AND** TypeScript SHALL fail to compile if any entry is missing

#### Scenario: Prompt help describes the system-prompt append behavior

- **WHEN** the help overlay is opened on the Prompt row
- **THEN** the rendered body SHALL explain that the user's text is added to Pi's system prompt rather than replacing it

#### Scenario: Tools help explains session vs preset modes in user-facing terms

- **WHEN** the help overlay is opened on the Tools row
- **THEN** the rendered body SHALL describe both `session` and `preset` modes
- **AND** the body SHALL describe the modes in user-facing terms (e.g. what each mode means at apply time) without surfacing storage-format details such as the omitted `tools` field

#### Scenario: Edit-mode addendum appears for an existing preset

- **GIVEN** the editor was opened for an existing preset
- **WHEN** the help overlay is opened on a row whose entry has an `editAddendum` (e.g. Name or Scope)
- **THEN** the rendered body SHALL include both the `body` paragraphs and the `editAddendum` paragraphs

#### Scenario: Edit-mode addendum hidden for a new preset

- **GIVEN** the editor was opened for a new preset (`initialPreset` is `undefined`)
- **WHEN** the help overlay is opened on a row whose entry has an `editAddendum`
- **THEN** the rendered body SHALL contain only the `body` paragraphs
- **AND** the rendered body SHALL NOT contain the `editAddendum` paragraphs

### Requirement: Footer hint surfaces the F1 Help shortcut

The editor's footer hint line SHALL include the token `F1 Help`. The token SHALL be present unconditionally — it does not gate on the test callback, on focus state, or on any row condition.

The token SHALL be placed in the footer hint line between the navigation/action tokens and the save/cancel shortcut tokens, serving as a visual divider between the two groups.

#### Scenario: Footer hint includes F1 Help

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain the token `F1 Help`

#### Scenario: F1 Help token survives the test-callback gate

- **GIVEN** the editor was opened without a test callback (so the `^T Test` token is omitted)
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL still contain `F1 Help`

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
