## ADDED Requirements

### Requirement: Active preset carries a dirty flag

The `ActivePresetState` SHALL include a boolean `dirty` field as a sibling of `restore` on both variants (the `restore: { kind: "baseline" }` variant and the `restore: { kind: "unknown" }` variant). Apply SHALL initialize `dirty: false`. Session restore SHALL initialize `dirty: false` on the resulting `restore: { kind: "unknown" }` attachment. Clear SHALL set the active preset to `undefined` regardless of the dirty value.

#### Scenario: Apply produces clean state

- **WHEN** a preset is applied
- **THEN** the resulting active state SHALL have `dirty: false`

#### Scenario: Restore produces clean state

- **WHEN** a session is restored and a preset is re-attached as `restore: { kind: "unknown" }`
- **THEN** the resulting active state SHALL have `dirty: false`

#### Scenario: Clear ignores dirty

- **WHEN** clear is invoked while the active preset is dirty
- **THEN** the active preset SHALL be unset and the standard clear behavior SHALL apply

### Requirement: Mark dirty on manual model change

The `model_select` event handler SHALL mark the active preset dirty when all of the following hold: a preset is currently active, the event's `source` is `"set"` or `"cycle"`, the event was not produced by the package's own `setModel` calls (self-call guard), and the new model differs from the active preset's `(provider, model)`. When the new model matches the active preset's `(provider, model)` and the preset is currently dirty, the handler SHALL mark it clean.

#### Scenario: Manual model change to a different model

- **WHEN** preset `plan` is active (clean) and the user selects a different model via `/model`
- **THEN** the active preset's `dirty` flag SHALL become `true`
- **AND** the active preset SHALL remain attached (instructions still inject)

#### Scenario: Cycling models with Ctrl+P

- **WHEN** preset `plan` is active (clean) and the user cycles to a different model
- **THEN** the active preset's `dirty` flag SHALL become `true`

#### Scenario: Self-triggered model change

- **WHEN** the package itself calls `pi.setModel` as part of activating a preset
- **THEN** the resulting `model_select` event SHALL NOT mark the just-activated preset dirty

#### Scenario: Session-restore model_select

- **WHEN** a `model_select` event fires with `source: "restore"`
- **THEN** the active preset's `dirty` flag SHALL NOT change

#### Scenario: Manual selection of the preset's model again

- **WHEN** the active preset is currently dirty due to a model change and the user manually selects the preset's recorded model
- **THEN** the active preset's `dirty` flag SHALL return to `false`

### Requirement: Drift detection on thinking_level_select and turn_start

On each `thinking_level_select`, the package SHALL compare current pi state against the active preset's declared fields and update the dirty flag immediately. On each `turn_start`, the package SHALL repeat the same comparison as a safety net and to catch dimensions that do not have dedicated extension events, such as active tools. The comparison SHALL include: model `(provider, id)`; thinking level (against `effectiveThinkingLevel(preset, currentModel)`); and active tools as a set, but ONLY when the preset specifies a non-empty `tools` array. If any compared field differs and the active preset is currently `dirty: false`, the handler SHALL set `dirty: true`. If no compared field differs and the active preset is currently `dirty: true`, the handler SHALL set `dirty: false`. Drift detection SHALL NEVER auto-clear the active preset.

#### Scenario: Manual thinking-level change

- **WHEN** preset `plan` is active (clean) and the user selects a thinking level that no longer matches the preset's effective thinking level
- **THEN** the active preset's `dirty` flag SHALL become `true` immediately on `thinking_level_select`
- **AND** the active preset SHALL remain attached

#### Scenario: Manual tool toggle on a preset that declares tools

- **WHEN** preset `plan` (with non-empty `tools`) is active (clean), the next turn starts, and `pi.getActiveTools()` no longer matches the preset's `tools` as a set
- **THEN** the active preset's `dirty` flag SHALL become `true`

#### Scenario: Tool change on a preset that omits tools

- **WHEN** preset `plan` (no `tools` field) is active and the user changes active tools
- **THEN** drift detection SHALL NOT consider tools and SHALL NOT mark dirty for that change alone

#### Scenario: Manual re-sync clears dirty

- **WHEN** the active preset is dirty due to thinking-level drift and the user manually returns the thinking level to the preset's effective value
- **THEN** the active preset's `dirty` flag SHALL return to `false` immediately on `thinking_level_select`

#### Scenario: No drift, already clean

- **WHEN** the active preset is clean and no fields have drifted
- **THEN** the dirty flag SHALL remain `false` and no state mutation SHALL occur

#### Scenario: Order-independent tool comparison

- **WHEN** the preset declares `tools: ["read", "bash"]` and `pi.getActiveTools()` returns `["bash", "read"]`
- **THEN** the comparison SHALL treat them as equal and SHALL NOT mark dirty

#### Scenario: Effective thinking level prevents spurious dirty

- **WHEN** a preset declares `thinkingLevel: "high"` for a non-reasoning model and pi's actual thinking level is `"off"` (because pi clamped on apply)
- **THEN** the comparison SHALL use `effectiveThinkingLevel`, treat them as equal, and SHALL NOT mark dirty

### Requirement: Re-apply clears dirty

The apply flow SHALL set `dirty: false` whenever it constructs a new active preset state, including the re-apply-when-drifted branch reached by selecting the active preset in the picker and pressing `Enter`. When apply takes its idempotent fast-path early return (the requested preset is already active with `restore.kind === "baseline"` and `stateMatches(preset, pi, ctx)` is true), and the existing active state has `dirty: true`, the fast-path SHALL also transition the flag to `dirty: false` (e.g. via `markClean`) before returning so the dirty marker clears immediately rather than waiting for the next `turn_start`.

#### Scenario: Re-apply after drift from picker

- **WHEN** the active preset is dirty and the user selects that preset in the picker and presses `Enter`
- **THEN** the apply runs, captures a fresh snapshot, and SHALL set `dirty: false`

#### Scenario: Re-apply via fast-path while dirty

- **WHEN** the active preset is dirty, the user has manually re-synced pi state to match the preset, and apply is invoked again before the next `turn_start` runs (so `stateMatches` is already true)
- **THEN** the apply fast-path SHALL return ok and SHALL leave `dirty: false`

### Requirement: Status badge renders the dirty marker

When the active preset is dirty, the footer status entry under the key `presets-plus` SHALL append a single `!` character immediately after `<name>` (no separating whitespace), and the appended `!` SHALL be rendered in the theme's `warning` color. When the active preset is clean, the entry SHALL omit the `!` and match the format defined by the `preset-activation` capability verbatim. The remainder of the badge format (the `preset: ` prefix and the `<name>` segment, both rendered in `dim`) SHALL be unchanged in either state.

#### Scenario: Active preset clean

- **WHEN** preset `plan` is active and `dirty` is `false`
- **THEN** the status bar entry SHALL be `preset: plan` (dim) with no trailing marker

#### Scenario: Active preset dirty

- **WHEN** preset `plan` is active and `dirty` is `true`
- **THEN** the status bar entry SHALL render the dim text `preset: plan` followed immediately by a `!` rendered in the theme's `warning` color

#### Scenario: Status updates on dirty transitions

- **WHEN** the dirty flag transitions in either direction
- **THEN** the status bar SHALL update without requiring user action

### Requirement: Picker reports drift state for the active preset

When the active preset is dirty, the picker SHALL render a `Drift:` row on the active preset's card. The row's value SHALL match the format `⚠ Dirty — <reasons> differ` and SHALL be rendered in the theme's `warning` color, mirroring the existing `Status:` rows used by clamp warnings and unavailability. `<reasons>` SHALL be the comma-separated names of fields that differ (any subset of `model`, `thinking level`, `tools`). When the active preset is clean, the picker SHALL omit the `Drift:` row.

#### Scenario: Picker card while clean

- **WHEN** the active preset is clean and the picker is open
- **THEN** the active preset's card SHALL NOT show a `Drift:` line

#### Scenario: Picker card while dirty due to model

- **WHEN** the active preset is dirty because the model has drifted and the picker is open
- **THEN** the active preset's card SHALL show a `Drift:` line naming `model`

#### Scenario: Picker card while dirty due to multiple reasons

- **WHEN** the active preset is dirty because both thinking level and tools have drifted and the picker is open
- **THEN** the active preset's card SHALL show a `Drift:` line listing both reasons (in any order)
