## MODIFIED Requirements

### Requirement: Compact preset footer indicator

The package SHALL display a dim-themed footer status entry under the key `presets-plus`. While a preset is active and clean, the entry SHALL use the format `preset: <name>`. While a preset is active and dirty (drift detected), the entry SHALL render the same `preset: <name>` text in `dim` followed immediately (no separating whitespace) by a single `!` character rendered in the theme's `warning` color, producing the visual form `preset: <name>!`. When no preset is active, or when the active preset's definition can no longer be looked up, the entry SHALL use the format `preset: none`. The indicator SHALL intentionally omit provider, model, and thinking level because Pi's built-in footer already displays current model and thinking information. The indicator SHALL be refreshed on apply, clear, session_start, and on every transition of the active preset's `dirty` flag.

#### Scenario: Active preset displayed (clean)

- **WHEN** preset `plan` is active and `dirty` is `false`
- **THEN** the `presets-plus` footer status entry SHALL be `preset: plan` (dim, no trailing marker)

#### Scenario: Active preset displayed (dirty)

- **WHEN** preset `plan` is active and `dirty` is `true`
- **THEN** the `presets-plus` footer status entry SHALL render the dim text `preset: plan` followed immediately by a `!` rendered in the theme's `warning` color

#### Scenario: No active preset

- **WHEN** no preset is active
- **THEN** the `presets-plus` footer status entry SHALL be `preset: none`

#### Scenario: Active preset definition missing

- **WHEN** an active preset attachment exists but the preset definition cannot be found during status refresh
- **THEN** the `presets-plus` footer status entry SHALL be `preset: none`

#### Scenario: Refresh on dirty transitions

- **WHEN** the active preset's `dirty` flag transitions in either direction
- **THEN** the `presets-plus` footer status entry SHALL be refreshed without requiring user action
