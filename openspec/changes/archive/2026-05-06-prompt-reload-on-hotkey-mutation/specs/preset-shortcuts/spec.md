## ADDED Requirements

### Requirement: Hotkey mutations prompt for reload at commit time

When a hotkey binding is mutated (added, removed, or replaced) by a successful preset Save or successful preset Delete, the package SHALL surface a `"Reload Pi?"` confirmation overlay at commit time with Yes / No actions and No selected by default. On Yes, the package SHALL call `ctx.reload()`. On No, the package SHALL close the dialog and continue without further action.

The detection logic SHALL live in shared hotkey helpers consumed by both the editor Save path and the picker Delete path; both paths SHALL produce the same prompt with identical title and body text. Prompt decisions SHALL compare committed hotkey state against the runtime baseline captured when shortcuts were registered for the current extension runtime, so reverting an un-reloaded pending hotkey edit back to the runtime baseline SHALL NOT prompt again. Renaming or scope-moving a hotkey-bearing preset SHALL prompt even when the hotkey string is unchanged, because the registered handler still points at the old preset identity.

The existing `formatHotkeyReloadNotice` inline hint in the editor SHALL remain unchanged. It serves as the during-editing signal and as a fallback reminder when the user dismisses the post-commit overlay with No.

If `ctx.reload` is not available on the surrounding pi build, the reload prompt SHALL NOT open and the package SHALL fall back to the existing inline notice. If `ctx.reload()` throws or rejects, the package SHALL surface the error via `ctx.ui.notify(<text>, "error")` rather than letting the exception escape.

#### Scenario: Editor Save adds a hotkey

- **WHEN** an editor Save successfully commits a hotkey field where none existed
- **THEN** a `"Reload Pi?"` overlay SHALL open with No selected by default

#### Scenario: Editor Save changes a hotkey

- **WHEN** an editor Save successfully replaces an existing hotkey with a different value
- **THEN** a `"Reload Pi?"` overlay SHALL open

#### Scenario: Editor Save removes a hotkey

- **WHEN** an editor Save successfully clears a previously-set hotkey
- **THEN** a `"Reload Pi?"` overlay SHALL open

#### Scenario: Picker Delete removes a hotkey-bearing preset

- **WHEN** a picker Delete successfully removes a preset whose `hotkey` was non-empty
- **THEN** a `"Reload Pi?"` overlay SHALL open with No selected by default

#### Scenario: Picker Delete removes a hotkey-less preset

- **WHEN** a picker Delete successfully removes a preset with no hotkey
- **THEN** no reload prompt SHALL appear

#### Scenario: User chooses Yes on the reload prompt

- **WHEN** the reload prompt is open and the user selects Yes
- **THEN** `ctx.reload()` SHALL be called

#### Scenario: User chooses No on the reload prompt

- **WHEN** the reload prompt is open and the user selects No (or Esc, or the default-No selection)
- **THEN** the dialog SHALL close and `ctx.reload()` SHALL NOT be called
- **AND** the calling flow (editor close or picker refresh) SHALL continue normally

#### Scenario: ctx.reload throws

- **WHEN** the user chooses Yes and `ctx.reload()` throws or rejects
- **THEN** an error notification SHALL surface naming the failure
- **AND** the exception SHALL NOT propagate

#### Scenario: ctx.reload not available

- **WHEN** the surrounding pi build does not expose `ctx.reload`
- **THEN** no reload prompt SHALL open from any commit-time path
- **AND** existing inline notices SHALL remain the only signals
