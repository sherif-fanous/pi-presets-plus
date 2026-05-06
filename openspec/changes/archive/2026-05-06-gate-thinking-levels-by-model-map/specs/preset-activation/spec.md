## MODIFIED Requirements

### Requirement: Apply uses effective thinking level and surfaces clamping

During apply, the package SHALL compute the effective thinking level from the preset and the resolved model using the same rule pi-ai's `getSupportedThinkingLevels` applies. If the model has `reasoning: false` (or falsy), the only valid level SHALL be `"off"`. Otherwise, for each level other than `"xhigh"` the level is valid unless `thinkingLevelMap?.[level]` is exactly `null`; `"xhigh"` is valid only when `thinkingLevelMap?.["xhigh"]` is defined and not `null`. The effective level SHALL be the preset's declared level (or `"off"` if absent) when valid for the resolved model, otherwise `"off"`. The package SHALL call `pi.setThinkingLevel` with the effective level. If the effective level differs from the preset's declared level, the package SHALL emit an info notification naming the preset, the requested level, the model, and the level actually applied.

The validity check SHALL access `thinkingLevelMap` defensively (optional-chained read) so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain valid; `"xhigh"` drops off).

#### Scenario: Reasoning model with no thinkingLevelMap honors declared level through high

- **WHEN** apply runs for a preset with `thinkingLevel: "high"` and the resolved model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** `pi.setThinkingLevel("high")` SHALL be called and no clamp notification SHALL be emitted

#### Scenario: Reasoning model with no thinkingLevelMap clamps xhigh to off

- **WHEN** apply runs for a preset with `thinkingLevel: "xhigh"` and the resolved model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** an info notification SHALL be emitted naming the preset, the requested level (`xhigh`), and the actual level (`off`)

#### Scenario: Reasoning model with thinkingLevelMap missing the requested non-xhigh key honors declared level

- **WHEN** apply runs for a preset with `thinkingLevel: "low"` and the resolved model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }` (the requested `"low"` key is absent)
- **THEN** `pi.setThinkingLevel("low")` SHALL be called and no clamp notification SHALL be emitted (missing keys fall back to provider defaults)

#### Scenario: Reasoning model with thinkingLevelMap mapping xhigh to a non-null value honors declared level

- **WHEN** apply runs for a preset with `thinkingLevel: "xhigh"` and the resolved model has `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** `pi.setThinkingLevel("xhigh")` SHALL be called and no clamp notification SHALL be emitted

#### Scenario: Reasoning model clamps when thinkingLevelMap explicitly nulls the requested level

- **WHEN** apply runs for a preset with `thinkingLevel: "low"` and the resolved model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** an info notification SHALL be emitted naming the preset, the requested level (`low`), and the actual level (`off`)

#### Scenario: Non-reasoning model clamps to off with notification

- **WHEN** apply runs for a preset with `thinkingLevel: "high"` and the resolved model has `reasoning: false`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** an info notification SHALL be emitted naming the preset, the requested level (`high`), and the actual level (`off`)

#### Scenario: Preset omits thinking level

- **WHEN** apply runs for a preset that has no `thinkingLevel` field
- **THEN** `pi.setThinkingLevel("off")` SHALL be called and no clamp notification SHALL be emitted
