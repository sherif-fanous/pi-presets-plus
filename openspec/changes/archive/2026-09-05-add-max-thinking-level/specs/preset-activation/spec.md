## MODIFIED Requirements

### Requirement: Apply uses effective thinking level and surfaces clamping

During apply, the package SHALL compute the effective thinking level from the preset and resolved model using the same rule as pi-ai's `getSupportedThinkingLevels`. If the model has falsy `reasoning`, only `"off"` SHALL be valid. Otherwise, a level SHALL be invalid when `thinkingLevelMap?.[level]` is exactly `null`. The extended `"xhigh"` and `"max"` levels SHALL also be invalid unless `thinkingLevelMap` defines a non-null value for them.

The effective level SHALL be the preset's declared level, or `"off"` when absent, when that level is valid. For an invalid declared level, the package SHALL start with `"off"` and use pi-ai's clamp rule to select the nearest level the model supports. The package SHALL call `pi.setThinkingLevel` with that effective level so its adjustment notice, drift snapshot, and overlay state match Pi's resulting state.

The apply operation SHALL return successful accompaniments for user-facing adjustments or warnings, including a thinking-level adjustment and dropped unknown tools. It SHALL NOT emit a separate success or accompaniment notification. The caller SHALL choose the delivery surface and SHALL be able to combine every accompaniment with the activation result.

The validity check SHALL read `thinkingLevelMap` defensively. An absent map SHALL leave levels through `"high"` valid and SHALL disable `"xhigh"` and `"max"`.

#### Scenario: Reasoning model with no thinkingLevelMap honors declared level through high

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"high"`
- **THEN** `pi.setThinkingLevel("high")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with no thinkingLevelMap clamps xhigh to off

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"xhigh"`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Reasoning model with thinkingLevelMap missing the requested non-xhigh key honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "xhigh": "max" }` and the preset requests `"low"`
- **THEN** `pi.setThinkingLevel("low")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with thinkingLevelMap mapping xhigh to a non-null value honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "xhigh": "max" }` and the preset requests `"xhigh"`
- **THEN** `pi.setThinkingLevel("xhigh")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with no thinkingLevelMap clamps max to off

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"max"`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Reasoning model with thinkingLevelMap mapping max to a non-null value honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "max": "max" }` and the preset requests `"max"`
- **THEN** `pi.setThinkingLevel("max")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model clamps when thinkingLevelMap explicitly nulls the requested level

- **WHEN** apply runs for a reasoning model whose map sets the requested level to `null`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Non-reasoning model clamps to off with notification

- **WHEN** apply runs for a non-reasoning model and the preset requests a non-off level
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Off is unavailable during fallback

- **WHEN** a preset requests `"max"` and the reasoning model maps both `"max"` and `"off"` to `null`
- **THEN** the effective level SHALL be the nearest supported level above `"off"`
- **AND** `pi.setThinkingLevel` SHALL be called with that level
- **AND** the apply result and overlay state SHALL record that same level

#### Scenario: Preset omits thinking level

- **WHEN** a preset has no `thinkingLevel`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

## ADDED Requirements

### Requirement: Clear restores a max thinking baseline

The package SHALL capture `"max"` when it is Pi's current thinking level before preset activation. If clear later determines that the thinking level remains owned by the preset overlay, it SHALL restore that max baseline through the existing per-field clear rules.

#### Scenario: Max baseline is restored

- **WHEN** Pi is using `"max"` before a preset applies another thinking level
- **AND** clear determines that the preset still owns the thinking-level field
- **THEN** clear SHALL call `pi.setThinkingLevel("max")`
