## ADDED Requirements

### Requirement: Separate extension configuration file

The package SHALL read optional user-global extension configuration from
`<agent-dir>/presets-plus/config.json`, separately from the user and project
preset files and the access-policy file. The file SHALL use a top-level
`version` field with value `1` and MAY define the boolean field
`showInactiveStatus`. When the file is missing, the field is absent, or the file
is invalid or unsupported, the effective value SHALL be `true`. Invalid
configuration SHALL produce a warning while leaving preset loading and
activation available. The package SHALL NOT rewrite this file.

#### Scenario: Configuration enables the inactive footer

- **WHEN** `config.json` contains `{ "version": 1, "showInactiveStatus": true }`
- **THEN** the effective `showInactiveStatus` value SHALL be `true`
- **AND** the inactive footer behavior SHALL display `Preset: none`

#### Scenario: Configuration disables the inactive footer

- **WHEN** `config.json` contains
  `{ "version": 1, "showInactiveStatus": false }`
- **THEN** the effective `showInactiveStatus` value SHALL be `false`
- **AND** the inactive `presets-plus` footer status entry SHALL be cleared

#### Scenario: Missing configuration preserves current behavior

- **WHEN** `config.json` does not exist or does not define `showInactiveStatus`
- **THEN** the effective `showInactiveStatus` value SHALL be `true`
- **AND** the inactive footer SHALL display `Preset: none`

#### Scenario: Invalid configuration fails open

- **WHEN** `config.json` contains invalid JSON, an unsupported version, or a
  non-boolean `showInactiveStatus`
- **THEN** the package SHALL warn the user about the configuration problem
- **AND** the effective `showInactiveStatus` value SHALL be `true`
- **AND** preset loading and activation SHALL remain available

### Requirement: Configuration reloads with the extension

The package SHALL re-read `config.json` during `session_start` and whenever the
extension is reloaded through `/reload`. The `/presets reload` command SHALL
continue to re-read only the user and project preset files and SHALL NOT be
required to apply configuration changes.

#### Scenario: External configuration edit then /reload

- **WHEN** the user edits `config.json` directly and runs `/reload`
- **THEN** the new configuration SHALL be effective during the reloaded
  extension session
- **AND** the footer SHALL reflect the new inactive-status preference

#### Scenario: Presets reload does not reload extension configuration

- **WHEN** the user edits `config.json` directly and runs `/presets reload`
- **THEN** the command SHALL re-read the preset files and report their loaded
  count and warnings
- **AND** the edited configuration SHALL not be required to take effect until
  `/reload` or a new session
