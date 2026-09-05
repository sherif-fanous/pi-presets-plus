## MODIFIED Requirements

### Requirement: Thinking-level radio respects model capability

The editor's thinking-level radio SHALL render greyed and unselectable for any level not in `validThinkingLevels(currentlySelectedModel)`. `validThinkingLevels` mirrors pi-ai's `getSupportedThinkingLevels`: if the model has `reasoning: false` (or falsy), only `"off"` SHALL be valid; otherwise, for each level other than `"xhigh"` and `"max"` the level is valid unless `thinkingLevelMap?.[level]` is exactly `null`, and `"xhigh"` and `"max"` are valid only when `thinkingLevelMap` maps them to a defined, non-null value.

When the user changes the model field such that the currently-selected thinking level becomes invalid, the radio SHALL snap the selection to `"off"`. The auto-snap SHALL be triggered only by user-driven model or provider changes; opening the editor SHALL NOT mutate the form's selected thinking level. The editor SHALL NOT render any inline notice or message accompanying the snap; the visible state of the radio (selected `"off"`, every other dot dimmed and unselectable) and the inline dimmed-levels hint together convey both the resulting state and the reason.

When at least one level is dimmed for the currently-selected model (i.e. `validThinkingLevels(model)` contains fewer than the full set of seven levels), the editor SHALL render a single dim hint line beneath the Thinking row. The hint SHALL branch on the model's reasoning capability:

- When the model has `reasoning: false`, the hint SHALL read exactly `"This model does not support thinking."`. This case occurs precisely when the only valid level is `"off"`.
- Otherwise (the model has `reasoning: true` and at least one level is dimmed because `thinkingLevelMap` nulls it or because `xhigh` or `max` is not explicitly mapped), the hint SHALL read exactly `"Dimmed levels are unavailable for this model."`.

When no model is selected (`model` is undefined), the dimmed-levels hint SHALL NOT render: `validThinkingLevels(undefined)` returns the full set of levels, and there is genuinely nothing to warn about.

The validity check SHALL access `thinkingLevelMap` defensively so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain selectable; `"xhigh"` and `"max"` are not).

#### Scenario: Reasoning model with no thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** the five levels `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"` SHALL be selectable
- **AND** `"xhigh"` and `"max"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Reasoning model with partial thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** all six levels from `"off"` through `"xhigh"` SHALL be selectable (missing non-xhigh keys fall through to provider defaults, and xhigh is explicitly mapped)
- **AND** `"max"` SHALL be visually disabled (not explicitly mapped)
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Reasoning model with xhigh and max explicitly mapped

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max", "max": "max" }`
- **THEN** all seven thinking levels SHALL be selectable
- **AND** no inline dimmed-levels hint SHALL be rendered

#### Scenario: Reasoning model nulls a level in thinkingLevelMap

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** the `"low"` radio entry SHALL be visually disabled and SHALL NOT be selectable
- **AND** `"xhigh"` and `"max"` SHALL also be visually disabled (not explicitly mapped)
- **AND** the remaining four levels SHALL be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Non-reasoning model selected

- **WHEN** the editor's selected model has `reasoning: false`
- **THEN** thinking-level options other than `"off"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"This model does not support thinking."`

#### Scenario: Changing model invalidates current selection

- **WHEN** the user changes the model field such that the previously-selected thinking level is no longer valid for the new model (because the new model has `reasoning: false`, because the new model's `thinkingLevelMap` maps that level to `null`, or because the level is `"xhigh"` or `"max"` and the new model does not explicitly map it)
- **THEN** the thinking selection SHALL snap to `"off"`
- **AND** no inline notice or message SHALL be rendered as a result of the snap

#### Scenario: Opening editor for a clamp-warning preset does not mutate selection

- **WHEN** the editor is opened for an existing preset whose declared `thinkingLevel` is non-`"off"` and whose resolved model would clamp the level (`reasoning: false`, `thinkingLevelMap` maps the level to `null`, or the level is `"xhigh"` or `"max"` and the model does not explicitly map it)
- **THEN** the form's selected thinking level SHALL remain at the declared value
- **AND** if the user presses Save without further edits the persisted preset's `thinkingLevel` SHALL equal the original declared value

#### Scenario: No notice rendered after a snap

- **GIVEN** the user changed model from a reasoning model with `thinkingLevel: "high"` to a non-reasoning model, causing a snap to `"off"`
- **WHEN** the editor renders the dialog
- **THEN** the rendered output SHALL NOT contain any text of the form `"<model> does not support extended thinking"` or any other inline notice produced by the snap
- **AND** the rendered output SHALL contain the new branched dimmed-levels hint, reading `"This model does not support thinking."`
- **AND** the Thinking row's radio SHALL show `● off` with every other level visually dimmed

### Requirement: Thinking-level clamp warning at load time

For each loaded preset whose `thinkingLevel` is non-`"off"` and whose resolved model would clamp that level (the level is not in `validThinkingLevels(model)`), the package SHALL tag the in-memory preset with `clampWarning: true`. The preset SHALL still load and remain available for activation (no fail). The user's preset file SHALL NOT be modified by the package.

#### Scenario: Reasoning model with no thinkingLevelMap and non-xhigh non-off level

- **WHEN** a preset declares `thinkingLevel: "high"` and its resolved model has `reasoning: true` and no `thinkingLevelMap`
- **THEN** the preset SHALL NOT carry a `clampWarning` flag

#### Scenario: Reasoning model with no thinkingLevelMap and xhigh level

- **WHEN** a preset declares `thinkingLevel: "xhigh"` and its resolved model has `reasoning: true` and no `thinkingLevelMap`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

#### Scenario: Reasoning model with no thinkingLevelMap and max level

- **WHEN** a preset declares `thinkingLevel: "max"` and its resolved model has `reasoning: true` and no `thinkingLevelMap`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

#### Scenario: Reasoning model with the requested non-xhigh level absent from thinkingLevelMap

- **WHEN** a preset declares `thinkingLevel: "low"` and its resolved model has `thinkingLevelMap: { "xhigh": "max" }` (key absent)
- **THEN** the preset SHALL NOT carry a `clampWarning` flag (missing keys fall through to provider defaults)

#### Scenario: Reasoning model maps max to a non-null value

- **WHEN** a preset declares `thinkingLevel: "max"` and its resolved model has `thinkingLevelMap: { "max": "max" }`
- **THEN** the preset SHALL NOT carry a `clampWarning` flag

#### Scenario: Reasoning model nulling the requested level in thinkingLevelMap

- **WHEN** a preset declares `thinkingLevel: "low"` and its resolved model has `thinkingLevelMap: { "low": null }`
- **THEN** the preset SHALL carry `clampWarning: true`
- **AND** the preset SHALL still load and remain available for activation

#### Scenario: Reasoning model nulling max in thinkingLevelMap

- **WHEN** a preset declares `thinkingLevel: "max"` and its resolved model has `thinkingLevelMap: { "max": null }`
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
