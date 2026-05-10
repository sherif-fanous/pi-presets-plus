# preset-picker Delta — `picker-clear-skip-confirm-when-no-preset-active`

## ADDED Requirements

### Requirement: Picker clear short-circuits when no preset is active

When the user presses `c` (clear) inside the picker and no preset is currently active, the package SHALL NOT open the "Clear active preset?" confirm dialog. Instead, the package SHALL open an info-dialog overlay (using the same shared overlay surface as the existing clear-summary and status dialogs) with the title "Clear Unavailable" and the body "No preset is active.", then return to the picker without invoking any clear flow.

When a preset is currently active, the existing confirm-then-clear-then-summary flow SHALL run unchanged.

The check for "is a preset active" SHALL consult the active-preset session (i.e., `session.current()` is `undefined`); the check SHALL NOT re-read the preset files or otherwise reach beyond the already-loaded session state.

#### Scenario: Press `c` with no preset active

- **GIVEN** the picker is open and no preset is currently active (`session.current()` is `undefined`)
- **WHEN** the user presses `c`
- **THEN** an info-dialog SHALL appear with the title "Clear Unavailable" and the body "No preset is active."
- **AND** the "Clear active preset?" confirm dialog SHALL NOT be opened
- **AND** the underlying clear engine SHALL NOT be invoked
- **AND** dismissing the info-dialog with `Enter` or `Esc` SHALL return focus to the picker without closing the picker

#### Scenario: Press `c` with a preset active

- **GIVEN** the picker is open and a preset is currently active (`session.current()` returns an attachment)
- **WHEN** the user presses `c`
- **THEN** the "Clear active preset?" confirm dialog SHALL open as today
- **AND** the existing confirm-then-clear-then-summary flow SHALL run unchanged
