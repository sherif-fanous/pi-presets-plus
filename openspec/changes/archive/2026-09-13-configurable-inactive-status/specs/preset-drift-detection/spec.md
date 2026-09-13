## MODIFIED Requirements

### Requirement: Status badge renders the dirty marker

When the active preset is dirty, the footer status entry under the key `presets-plus` SHALL append a single `!` character immediately after `<name>` with no separating whitespace, and the appended `!` SHALL be rendered in the theme's `warning` color. When the active preset is clean, the entry SHALL omit the `!` and match the format defined by the `preset-activation` capability verbatim. The remainder of the badge format, the `Preset: ` prefix and the `<name>` segment, SHALL be unchanged in either state and both SHALL be rendered in `dim`.

#### Scenario: Active preset clean

- **WHEN** preset `plan` is active and `dirty` is `false`
- **THEN** the status bar entry SHALL be `Preset: plan` with dim styling and no trailing marker

#### Scenario: Active preset dirty

- **WHEN** preset `plan` is active and `dirty` is `true`
- **THEN** the status bar entry SHALL render the dim text `Preset: plan` followed immediately by a `!` rendered in the theme's `warning` color

#### Scenario: Status updates on dirty transitions

- **WHEN** the dirty flag transitions in either direction
- **THEN** the status bar SHALL update without requiring user action
