## MODIFIED Requirements

### Requirement: Compact preset footer indicator

The package SHALL display a dim-themed footer status entry under the key
`presets-plus` when the inactive-status preference is enabled. While a preset is
active and clean, the entry SHALL use the format `Preset: <name>`. While a
preset is active and dirty (drift detected), the entry SHALL render the same
`Preset: <name>` text in `dim` followed immediately, with no separating
whitespace, by a single `!` character rendered in the theme's `warning` color,
producing the visual form `Preset: <name>!`. When no preset is active, or when
the active preset's definition can no longer be looked up, the entry SHALL use
the format `Preset: none` if `showInactiveStatus` is enabled. When no preset is
active and `showInactiveStatus` is disabled, the package SHALL clear the
`presets-plus` footer status entry. The preference SHALL default to enabled when
it is absent or cannot be loaded. The indicator SHALL intentionally omit
provider, model, and thinking level because Pi's built-in footer already
displays current model and thinking information. The indicator SHALL be
refreshed on apply, clear, session_start, `/reload`, and on every transition of
the active preset's `dirty` flag.

#### Scenario: Active preset displayed (clean)

- **WHEN** preset `plan` is active and `dirty` is `false`
- **THEN** the `presets-plus` footer status entry SHALL be `Preset: plan` with
  dim styling and no trailing marker, regardless of `showInactiveStatus`

#### Scenario: Active preset displayed (dirty)

- **WHEN** preset `plan` is active and `dirty` is `true`
- **THEN** the `presets-plus` footer status entry SHALL render the dim text
  `Preset: plan` followed immediately by a `!` rendered in the theme's `warning`
  color, regardless of `showInactiveStatus`

#### Scenario: No active preset

- **WHEN** no preset is active and `showInactiveStatus` is `true` or absent
- **THEN** the `presets-plus` footer status entry SHALL be `Preset: none` with
  dim styling

#### Scenario: No active preset with inactive status disabled

- **WHEN** no preset is active and `showInactiveStatus` is `false`
- **THEN** the `presets-plus` footer status entry SHALL be cleared

#### Scenario: Active preset definition missing

- **WHEN** an active preset attachment exists but the preset definition cannot
  be found during status refresh
- **THEN** the `presets-plus` footer status entry SHALL be `Preset: none` when
  `showInactiveStatus` is enabled and SHALL be cleared when `showInactiveStatus`
  is disabled

#### Scenario: Refresh on dirty transitions

- **WHEN** the active preset's `dirty` flag transitions in either direction
- **THEN** the `presets-plus` footer status entry SHALL be refreshed without
  requiring user action

#### Scenario: Refresh after extension reload

- **WHEN** the extension is reloaded through `/reload` after the inactive-status
  preference changes
- **THEN** the footer SHALL immediately reflect the new preference and current
  active-preset state
