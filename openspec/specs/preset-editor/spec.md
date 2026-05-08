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

When the user changes the model field such that the currently-selected thinking level becomes invalid, the radio SHALL snap the selection to `"off"`. The auto-snap SHALL be triggered only by user-driven model or provider changes; opening the editor SHALL NOT mutate the form's selected thinking level. The editor SHALL NOT render any inline notice or message accompanying the snap; the visible state of the radio (selected `"off"`, every other dot dimmed and unselectable) and the static "Dimmed levels are unavailable for this model." hint together convey both the resulting state and the reason.

The validity check SHALL access `thinkingLevelMap` defensively so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain selectable; `"xhigh"` is not).

#### Scenario: Reasoning model with no thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** the five levels `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"` SHALL be selectable
- **AND** `"xhigh"` SHALL be visually disabled and SHALL NOT be selectable

#### Scenario: Reasoning model with partial thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** all six thinking levels SHALL be selectable (missing non-xhigh keys fall through to provider defaults, and xhigh is explicitly mapped)

#### Scenario: Reasoning model nulls a level in thinkingLevelMap

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** the `"low"` radio entry SHALL be visually disabled and SHALL NOT be selectable
- **AND** `"xhigh"` SHALL also be visually disabled (not explicitly mapped)
- **AND** the remaining four levels SHALL be selectable

#### Scenario: Non-reasoning model selected

- **WHEN** the editor's selected model has `reasoning: false`
- **THEN** thinking-level options other than `"off"` SHALL be visually disabled and SHALL NOT be selectable

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
- **AND** the rendered output SHALL contain the static `"Dimmed levels are unavailable for this model."` hint beneath the Thinking row (the existing capability is unaffected)
- **AND** the Thinking row's radio SHALL show `● off` with every other level visually dimmed

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
