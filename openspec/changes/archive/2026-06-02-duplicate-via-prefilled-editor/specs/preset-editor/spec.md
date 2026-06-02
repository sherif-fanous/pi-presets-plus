## ADDED Requirements

### Requirement: Editor distinguishes new, edit, and duplicate via an explicit mode

The editor SHALL accept an explicit `mode: "new" | "edit" | "duplicate"` that separates the form *seed* (the values pre-populating the rows) from the edit-*target* identity (the on-disk preset a Save mutates). The seed SHALL drive only row pre-population. The target SHALL be present only in `edit` mode and SHALL be the single source of identity for `updatePreset`/move and for every identity-keyed check (`samePresetIdentity`, the active-preset reference, and reload-prompt identity).

`persist()` SHALL route on `mode`:

- In `new` mode the editor SHALL persist via `addPreset` and SHALL carry no target.
- In `edit` mode the editor SHALL persist via `updatePreset` (or the move-across-scope flow) against the target.
- In `duplicate` mode the editor SHALL seed rows from the source preset but SHALL persist via `addPreset` and SHALL carry no target; it SHALL NOT call `updatePreset` or the move flow.

In `duplicate` mode the editor SHALL seed the name row with the next available `uniqueCopyName(...)` and SHALL clear the hotkey so a Save with no further edits does not collide.

The editor window title SHALL be derived from `mode`: `New preset` in `new` mode, `Edit '<name>'` in `edit` mode (where `<name>` is the target preset's name), and `Duplicate '<name>'` in `duplicate` mode (where `<name>` is the source preset's name).

#### Scenario: Editor title reflects mode

- **WHEN** the editor is opened in `new` mode
- **THEN** the title SHALL read `New preset`
- **WHEN** the editor is opened in `edit` mode targeting preset `plan`
- **THEN** the title SHALL read `Edit 'plan'`
- **WHEN** the editor is opened in `duplicate` mode seeded from preset `plan`
- **THEN** the title SHALL read `Duplicate 'plan'`

#### Scenario: Duplicate mode seeds from source but persists as new

- **WHEN** the editor is opened in `duplicate` mode seeded from preset `plan`
- **THEN** all form rows SHALL be pre-populated from `plan`
- **AND** the name row SHALL be pre-filled with `plan-copy` (or the next available `plan-copy-N`) and the hotkey SHALL be cleared
- **AND** the title SHALL read `Duplicate 'plan'`
- **AND** a Save SHALL persist via `addPreset` and SHALL NOT call `updatePreset` or the move flow

#### Scenario: Duplicate mode does not treat the source as an edit target

- **WHEN** the editor is opened in `duplicate` mode seeded from preset `plan`
- **THEN** the source `plan` SHALL NOT be used as the edit-target identity
- **AND** `samePresetIdentity`, the active-preset reference, and reload-prompt identity SHALL key off `mode`/target rather than the seed

#### Scenario: Cancel in duplicate mode creates no preset

- **WHEN** the editor is opened in `duplicate` mode and the user cancels without saving
- **THEN** no preset SHALL be created and no `-copy` row SHALL be written to disk

## MODIFIED Requirements

### Requirement: Picker CRUD action keys are functional

The picker's `n`, `e`, `d`, `x`, `c`, `⌃↑`, and `⌃↓` keys SHALL perform real actions: new (open editor with sensible defaults for a new preset), edit (open editor for selected), duplicate (open the editor in `duplicate` mode pre-populated from the selected preset with a unique copy name and cleared hotkey; the copy persists only on Save), delete (with confirmation), clear active preset (with confirmation), and reorder up/down within the selected preset's scope (persists via `reorderWithinScope`). After every successful CRUD operation the picker SHALL refresh by calling `loadAll` unless the user chose to reload Pi and the picker closes to allow `ctx.reload()`.

When the `x` (delete) action successfully removes a preset whose runtime-baseline `hotkey` field was non-empty, the picker SHALL open a `"Reload Pi?"` confirmation overlay with No selected by default. On Yes, `ctx.reload()` SHALL be called after the picker closes. On No, the dialog SHALL close and the picker SHALL refresh and remain open as before. If the deleted preset had no runtime-baseline hotkey, no reload prompt SHALL appear.

#### Scenario: New from picker

- **WHEN** the user presses `n` in the picker
- **THEN** the editor SHALL open with sensible defaults for a new preset (no preset pre-loaded)

#### Scenario: Edit from picker

- **WHEN** the user presses `e` on a selected preset
- **THEN** the editor SHALL open pre-populated for that preset

#### Scenario: Duplicate from picker

- **WHEN** the user presses `d` on selected preset `plan`
- **THEN** the editor SHALL open in `duplicate` mode pre-populated from `plan`, with the name row seeded to `plan-copy` (or the next available `plan-copy-N`) and the hotkey cleared, without any confirmation dialog
- **AND** the copy SHALL be persisted in `plan`'s scope via `addPreset` only when the user saves, landing at the end of the scope

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
