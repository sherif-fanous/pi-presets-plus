## ADDED Requirements

### Requirement: Reload prompt after hotkey-mutating Save

When the editor's Save action completes successfully (the file write succeeded and the editor would otherwise close), the package SHALL detect whether the saved preset's `hotkey` field was added, removed, or replaced relative to the editor's `initialPreset` value. If a change is detected, the package SHALL open a confirmation overlay titled `"Reload Pi?"` with body text explaining that hotkey changes take effect after a reload, presenting Yes / No actions with No selected by default. On Yes, the package SHALL call `ctx.reload()`; on No, the package SHALL close the dialog without further action. The editor SHALL close after the overlay is dismissed regardless of which action the user chose.

A "hotkey change" is defined as: trimmed `initialPreset.hotkey ?? ""` differs from trimmed `savedPreset.hotkey ?? ""`. Empty strings are equivalent to absent fields.

For new-preset Save (no `initialPreset`), a hotkey change is defined as: the saved preset's trimmed hotkey is non-empty.

If `ctx.reload` is not available on the surrounding pi build (older versions), the prompt SHALL NOT open and the existing inline `formatHotkeyReloadNotice` SHALL remain the only signal.

If `ctx.reload()` throws or rejects, the package SHALL surface the error via `ctx.ui.notify(<text>, "error")` and SHALL NOT let the exception escape.

#### Scenario: Save adds a hotkey

- **WHEN** the user creates a new preset with a non-empty hotkey, presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear with No selected by default
- **AND** if the user chooses Yes, `ctx.reload()` SHALL be called
- **AND** if the user chooses No, the dialog SHALL close and the editor SHALL close without calling `ctx.reload()`

#### Scenario: Save changes an existing hotkey

- **WHEN** the user edits an existing preset's hotkey from `ctrl+shift+1` to `ctrl+shift+2`, presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear

#### Scenario: Save removes a hotkey

- **WHEN** the user clears an existing preset's hotkey field (from non-empty to empty), presses Save, and the persistence succeeds
- **THEN** a `"Reload Pi?"` overlay SHALL appear

#### Scenario: Save with no hotkey change

- **WHEN** the user edits any field other than the hotkey (or makes no field change), presses Save, and the persistence succeeds
- **THEN** no reload prompt SHALL appear

#### Scenario: Save fails persistence

- **WHEN** the user changes the hotkey, presses Save, and persistence fails (file write error, name collision, etc.)
- **THEN** no reload prompt SHALL appear (no commit occurred)

#### Scenario: Scope move with unchanged hotkey

- **WHEN** the user changes scope on an existing preset whose hotkey was unchanged, confirms the move, and the move succeeds
- **THEN** no reload prompt SHALL appear

#### Scenario: Scope move with hotkey change

- **WHEN** the user changes scope and changes the hotkey on the same Save, confirms the move, and the move succeeds
- **THEN** exactly one reload prompt SHALL appear (not two — one per scope leg)

#### Scenario: ctx.reload throws

- **WHEN** the user chooses Yes and `ctx.reload()` throws or rejects
- **THEN** an error notification SHALL surface naming the failure
- **AND** the exception SHALL NOT propagate out of the editor flow

#### Scenario: ctx.reload not available

- **WHEN** the surrounding pi build does not expose `ctx.reload`
- **THEN** the reload prompt SHALL NOT open after Save
- **AND** the existing inline hotkey-reload notice SHALL remain the only signal

## MODIFIED Requirements

### Requirement: Picker CRUD action keys are functional

The picker's `n`, `e`, `d`, `x`, `c`, `⌃↑`, and `⌃↓` keys SHALL perform real actions: new (open editor with sensible defaults for a new preset), edit (open editor for selected), duplicate (with confirmation; create copy with unique name suffix and cleared hotkey), delete (with confirmation), clear active preset (with confirmation), and reorder up/down within the selected preset's scope (persists via `reorderWithinScope`). After every successful CRUD operation the picker SHALL refresh by calling `loadAll`.

When the `x` (delete) action successfully removes a preset whose `hotkey` field was non-empty, the picker SHALL open a `"Reload Pi?"` confirmation overlay with No selected by default. On Yes, `ctx.reload()` SHALL be called. On No, the dialog SHALL close and the picker SHALL refresh and remain open as before. If the deleted preset had no hotkey, no reload prompt SHALL appear.

If `ctx.reload` is not available, the post-delete reload prompt SHALL NOT open. If `ctx.reload()` throws or rejects, the package SHALL surface the error via `ctx.ui.notify(<text>, "error")` and SHALL NOT let the exception escape.

#### Scenario: New from picker

- **WHEN** the user presses `n` in the picker
- **THEN** the editor SHALL open with sensible defaults for a new preset (no preset pre-loaded)

#### Scenario: Edit from picker

- **WHEN** the user presses `e` on a selected preset
- **THEN** the editor SHALL open pre-populated for that preset

#### Scenario: Duplicate from picker

- **WHEN** the user presses `d` on selected preset `plan` and confirms
- **THEN** a new preset SHALL be created in the same scope via `addPreset` with name `plan-copy` (or the next available `plan-copy-N`), with `hotkey` cleared, then placed immediately after the source in file order via `reorderWithinScope`

#### Scenario: Delete a preset without a hotkey

- **WHEN** the user presses `x` on a selected preset whose `hotkey` is empty/absent and confirms the prompt
- **THEN** the preset SHALL be removed from its source file and the picker SHALL refresh
- **AND** no reload prompt SHALL appear

#### Scenario: Delete a preset with a hotkey

- **WHEN** the user presses `x` on a selected preset whose `hotkey` is non-empty and confirms the delete prompt
- **THEN** the preset SHALL be removed and the picker SHALL refresh
- **AND** a `"Reload Pi?"` overlay SHALL appear with No selected by default
- **AND** if the user chooses Yes, `ctx.reload()` SHALL be called
- **AND** if the user chooses No, the dialog SHALL close and the picker SHALL remain open

#### Scenario: Clear active preset from picker

- **WHEN** the user presses `c` and confirms
- **THEN** activation `clear` SHALL be invoked

#### Scenario: Reorder up

- **WHEN** the user presses `⌃↑` on a selected preset
- **THEN** the preset SHALL swap positions with the preset above it within the same scope and the file SHALL be persisted

#### Scenario: Reorder boundary

- **WHEN** the user presses `⌃↑` on the topmost preset of its scope
- **THEN** the operation SHALL be a no-op (no file write)

#### Scenario: ctx.reload throws on post-delete prompt

- **WHEN** the user chooses Yes on the post-delete reload prompt and `ctx.reload()` throws
- **THEN** an error notification SHALL surface and the exception SHALL NOT propagate
