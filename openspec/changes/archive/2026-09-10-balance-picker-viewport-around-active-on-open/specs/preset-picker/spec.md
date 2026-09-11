## MODIFIED Requirements

### Requirement: Picker opens with the active preset selected

When the picker opens and a preset is active, the picker SHALL place the initial selection on that preset's card and SHALL render that card within the first visible viewport. The active preset is the one the session reports as attached, matched by name and scope.

When enough loaded presets exist before and after the active preset to provide surrounding context, the picker SHALL choose the opening viewport whose selected-card midpoint is closest to the midpoint of the list pane, subject to keeping at least one later preset visible when one fits. Both midpoints are measured in rendered card lines and separator lines, not in preset counts, so cards of differing heights do not shift the result.

When the active preset is near the start or end of the loaded list, the opening viewport SHALL clamp to the natural list boundary instead of wrapping, inventing blank space, or hiding the selected card. If the selected card alone exceeds the available line budget, the picker SHALL render that card as the sole visible card.

When no preset is active, or when the active preset is not among the presets the picker loaded for this open, the picker SHALL place the initial selection on the first visible card and SHALL start the viewport at the top of the list.

The initial selection and opening viewport SHALL be computed against the list the picker shows on open, which is every loaded preset under the `All` scope filter with an empty filter query. The active-preset status dot, the accent highlight on the active card, and every navigation, filter, and scope behavior after the first frame SHALL be unchanged: once the picker is open, the selection and viewport move only in response to user input and the existing layout correction rules.

#### Scenario: Active preset is selected on open

- **GIVEN** preset `plan` is active and is not the first preset in the picker's list order
- **WHEN** the user opens the picker
- **THEN** the card for `plan` SHALL be the selected card
- **AND** the card for `plan` SHALL carry both the active status dot and the selection highlight

#### Scenario: Active preset below the fold is scrolled into view

- **GIVEN** a preset is active and its card does not fit in the viewport packed from the top of the list
- **AND** there are enough loaded presets before and after it to fill the viewport around it
- **WHEN** the user opens the picker
- **THEN** the first rendered frame SHALL include the active preset's card with at least one preset visible before it
- **AND** the first rendered frame SHALL include at least one preset after the active preset

#### Scenario: Active preset near the start clamps to the top

- **GIVEN** a preset near the start of the loaded list is active
- **WHEN** the user opens the picker
- **THEN** the first rendered frame SHALL start at the first loaded preset
- **AND** the active preset's card SHALL be selected and visible

#### Scenario: Active preset near the end clamps to the bottom

- **GIVEN** a preset near the end of the loaded list is active
- **WHEN** the user opens the picker
- **THEN** the first rendered frame SHALL end at the last loaded preset when enough cards fit before it
- **AND** the active preset's card SHALL be selected and visible

#### Scenario: No active preset falls back to the first card

- **GIVEN** no preset is active
- **WHEN** the user opens the picker
- **THEN** the first visible card SHALL be the selected card
- **AND** the viewport SHALL start at the first loaded preset

#### Scenario: Active preset missing from the loaded list falls back to the first card

- **GIVEN** a preset is active and it was deleted on disk before the picker opened
- **WHEN** the user opens the picker
- **THEN** the first visible card SHALL be the selected card
- **AND** the viewport SHALL start at the first loaded preset

#### Scenario: Active preset is matched by scope as well as name

- **GIVEN** a user preset and a project preset share the name `plan`, and the project one is active
- **WHEN** the user opens the picker
- **THEN** the selected card SHALL be the project `plan` card

#### Scenario: Pressing Enter immediately reconfirms the active preset

- **GIVEN** a preset is active
- **WHEN** the user opens the picker and presses `⏎` without moving the selection
- **THEN** the activation SHALL target the active preset rather than the first preset in the list
