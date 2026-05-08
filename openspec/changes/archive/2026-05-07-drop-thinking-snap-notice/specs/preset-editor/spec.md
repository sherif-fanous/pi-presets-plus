## MODIFIED Requirements

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
