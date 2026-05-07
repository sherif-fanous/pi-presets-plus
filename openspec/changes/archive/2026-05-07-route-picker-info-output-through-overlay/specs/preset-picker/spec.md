## ADDED Requirements

### Requirement: Picker exposes a Status action

The picker SHALL expose a `Status` action bound to the `s` key while the list is focused. Pressing `s` SHALL open an info-dialog overlay rendering the same payload that `/presets status` produces (including the empty "no preset is active" case). After the user dismisses the dialog with `Enter` or `Esc`, the picker SHALL remain open with list focus restored.

#### Scenario: Status from picker with active preset

- **WHEN** the user opens the picker, a preset is active, and the user presses `s`
- **THEN** an info-dialog overlay SHALL appear rendering the active-preset diagnostic produced by `formatStatus`
- **AND** the picker SHALL remain open behind the dialog
- **AND** dismissing the dialog SHALL return list focus to the picker

#### Scenario: Status from picker with no active preset

- **WHEN** the user opens the picker, no preset is active, and the user presses `s`
- **THEN** an info-dialog overlay SHALL appear with the same "no preset is active" body that `/presets status` emits today
- **AND** dismissing the dialog SHALL return list focus to the picker

### Requirement: Picker routes Clear and Status output through an info-dialog overlay

When the picker triggers `clear` (via the `c` action) or `status` (via the `s` action), the package SHALL render the resulting payload in a shared info-dialog overlay rather than via `ctx.ui.notify`. The dialog SHALL display a title, the rendered body verbatim, and a dismissal hint, and SHALL resolve on `Enter` or `Esc`. The dialog SHALL anchor center, max height ≤ the surrounding overlay viewport, and width ≤ 90 % of the viewport.

#### Scenario: Clear from picker shows summary in dialog

- **WHEN** the user presses `c` in the picker, confirms the prompt, and the clear flow runs
- **THEN** the rendered clear summary SHALL appear in an info-dialog overlay above the picker
- **AND** `ctx.ui.notify` SHALL NOT be called for the summary on the picker-driven path

#### Scenario: Clear cancelled does not open info-dialog

- **WHEN** the user presses `c` in the picker and dismisses the confirm prompt with No
- **THEN** no info-dialog overlay SHALL appear

#### Scenario: Status from picker shows diagnostic in dialog

- **WHEN** the user presses `s` in the picker
- **THEN** the diagnostic produced by `formatStatus` SHALL appear in an info-dialog overlay above the picker
- **AND** `ctx.ui.notify` SHALL NOT be called for the diagnostic on the picker-driven path

#### Scenario: Dialog dismissal returns focus

- **WHEN** the info-dialog is open and the user presses `Enter` or `Esc`
- **THEN** the dialog SHALL close
- **AND** focus SHALL return to the picker without closing the picker

## MODIFIED Requirements

### Requirement: Footer keybinding hints

The picker SHALL render a footer hint row using readable title-case action labels and showing at minimum: activate (`⏎`), filter (`/`), movement (`↑/↓`), page movement (`PgUp/PgDn`), scope cycle (`←/→`), status (`s`), and exit (`Esc`).

#### Scenario: Footer present

- **WHEN** the picker is open
- **THEN** a footer hint row SHALL be visible at the bottom of the picker showing the keybindings above

#### Scenario: Status hint listed

- **WHEN** the picker is open
- **THEN** the footer hint row SHALL include the `Status` entry bound to the `s` key
