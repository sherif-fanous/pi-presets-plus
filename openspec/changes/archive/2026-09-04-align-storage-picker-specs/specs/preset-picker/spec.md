## ADDED Requirements

### Requirement: Picker lays out variable-height cards around the selection

The picker SHALL guarantee that the currently selected preset's card is included in the rendered output on every frame, regardless of card-height variation across the visible list. Card height varies with optional preset rows and status annotations.

The picker SHALL calculate each viewport from the item count, selected index, current scroll offset, available line budget, and measured card heights. It SHALL pack consecutive cards and their separator lines without exceeding the line budget, except that it SHALL render one selected card even when that card alone exceeds the budget.

If the selection is above the current viewport, the picker SHALL anchor the viewport at the selected card. If the selection is below the packed range, the picker SHALL move the viewport backward from the selected card to include as many preceding cards as the line budget permits. The resulting scroll offset and measured page size SHALL update picker state before the next user input.

Card heights SHALL be measured only as needed to determine the visible range. An empty preset list SHALL produce an empty viewport without measuring any card.

#### Scenario: Mixed card heights fit within the line budget

- **WHEN** the visible list contains cards with different measured heights
- **THEN** the picker SHALL include consecutive cards and separator lines while they fit within the available line budget
- **AND** the measured page size SHALL equal the number of included cards

#### Scenario: Selection moves below the current viewport

- **WHEN** the selected index is below the range that fits from the current scroll offset
- **THEN** the picker SHALL choose a new scroll offset whose packed range includes the selected card
- **AND** the rendered output SHALL include the selected card

#### Scenario: Selection moves above the current viewport

- **WHEN** the selected index is above the current scroll offset
- **THEN** the picker SHALL set the selected card as the first visible card
- **AND** the rendered output SHALL include the selected card

#### Scenario: Selected card exceeds the line budget

- **WHEN** the selected card's measured height exceeds the available line budget
- **THEN** the picker SHALL still include that card as the sole visible card

#### Scenario: Empty list requires no card measurements

- **WHEN** the visible preset list is empty
- **THEN** the picker SHALL return an empty viewport with a page size of zero
- **AND** it SHALL NOT request any card-height measurement

#### Scenario: Page navigation uses the measured page size

- **WHEN** a rendered viewport has measured the number of cards that fit
- **THEN** subsequent Page Up and Page Down navigation SHALL use that measured page size
- **AND** the next rendered viewport SHALL include the new selection

#### Scenario: Repeated downward navigation does not skip presets

- **WHEN** the picker contains 18 presets with variable card heights and the user presses Down 12 times from the first preset
- **THEN** each press SHALL advance the selected index by one
- **AND** every rendered viewport SHALL include the selected preset

## REMOVED Requirements

### Requirement: Picker keeps the selected card visible regardless of card-height variation

**Reason**: The requirement mandates a correction helper, repeated repacking algorithm, and render result shape that the proposed viewport calculation will replace. The replacement requirement preserves selected-card visibility without fixing those implementation details in the contract.

**Migration**: Replace this requirement with the measured viewport behavior defined by `Picker lays out variable-height cards around the selection`.
