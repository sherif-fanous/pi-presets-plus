## ADDED Requirements

### Requirement: Picker opens with the active preset selected

When the picker opens and a preset is active, the picker SHALL place the initial selection on that preset's card and SHALL render that card within the first visible viewport. The active preset is the one the session reports as attached, matched by name and scope.

When no preset is active, or when the active preset is not among the presets the picker loaded for this open, the picker SHALL place the initial selection on the first visible card.

The initial selection SHALL be computed against the list the picker shows on open, which is every loaded preset under the `All` scope filter with an empty filter query. The active-preset status dot, the accent highlight on the active card, and every navigation, filter, and scope behavior after the first frame SHALL be unchanged: once the picker is open, the selection moves only in response to user input.

#### Scenario: Active preset is selected on open

- **GIVEN** preset `plan` is active and is not the first preset in the picker's list order
- **WHEN** the user opens the picker
- **THEN** the card for `plan` SHALL be the selected card
- **AND** the card for `plan` SHALL carry both the active status dot and the selection highlight

#### Scenario: Active preset below the fold is scrolled into view

- **GIVEN** a preset is active and its card does not fit in the viewport packed from the top of the list
- **WHEN** the user opens the picker
- **THEN** the first rendered frame SHALL include the active preset's card

#### Scenario: No active preset falls back to the first card

- **GIVEN** no preset is active
- **WHEN** the user opens the picker
- **THEN** the first visible card SHALL be the selected card

#### Scenario: Active preset missing from the loaded list falls back to the first card

- **GIVEN** a preset is active and it was deleted on disk before the picker opened
- **WHEN** the user opens the picker
- **THEN** the first visible card SHALL be the selected card

#### Scenario: Active preset is matched by scope as well as name

- **GIVEN** a user preset and a project preset share the name `plan`, and the project one is active
- **WHEN** the user opens the picker
- **THEN** the selected card SHALL be the project `plan` card

#### Scenario: Pressing Enter immediately reconfirms the active preset

- **GIVEN** a preset is active
- **WHEN** the user opens the picker and presses `⏎` without moving the selection
- **THEN** the activation SHALL target the active preset rather than the first preset in the list
