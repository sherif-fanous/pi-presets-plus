## ADDED Requirements

### Requirement: Consolidated version 2 configuration storage

The package SHALL read user configuration from
`<agent-dir>/presets-plus/config.json` and project configuration from
`<cwd>/.pi/presets-plus/config.json`. A supported file SHALL be a JSON object
with `version: 2`. It MAY contain a top-level `showInactiveStatus` boolean, a
top-level `presets` array, and, at user scope only, a `policy` object. Missing
optional sections SHALL use their defaults.

The project `showInactiveStatus` value SHALL override the user value when
present. When neither scope defines the field, the effective value SHALL be
`true`. Presets from the two files SHALL retain their scope and existing merge
order.

#### Scenario: Both files absent

- **WHEN** neither version 2 configuration file nor any legacy file exists
- **THEN** the effective preset list SHALL be empty
- **AND** the effective `showInactiveStatus` value SHALL be `true`
- **AND** no error SHALL be raised

#### Scenario: Settings inherit from user scope

- **WHEN** the user file sets `showInactiveStatus: false` and the project file
  omits the field
- **THEN** the effective `showInactiveStatus` value SHALL be `false`

#### Scenario: Project setting overrides user scope

- **WHEN** the user file sets `showInactiveStatus: false` and the project file
  sets `showInactiveStatus: true`
- **THEN** the effective `showInactiveStatus` value SHALL be `true`

#### Scenario: Presets load from both scopes

- **WHEN** valid user and project configuration files contain presets with
  disjoint names
- **THEN** all presets SHALL load with their respective scopes

#### Scenario: Unsupported version

- **WHEN** a configuration file declares a version other than `2` and is not
  eligible for legacy migration
- **THEN** that scope SHALL use defaults and emit a warning
- **AND** the file SHALL remain unchanged

#### Scenario: Malformed JSON

- **WHEN** a configuration file contains invalid JSON
- **THEN** that scope SHALL use defaults and emit a warning
- **AND** the file SHALL remain unchanged

### Requirement: Automatic legacy configuration migration

During `session_start`, before loading effective configuration, the package
SHALL migrate each eligible scope independently when no version 2 configuration
exists there. User migration SHALL combine supported version 1 `config.json`,
`presets.json`, and `policy.json` files. Project migration SHALL convert the
existing version 1 `presets.json`. The generated version 2 file SHALL retain
`showInactiveStatus` at the top level, copy the preset array to `presets`, and
copy policy rules to `policy.rules` without validating or changing individual
preset, rule, or matcher entries.

Migration SHALL be all-or-nothing within a scope. Every existing legacy file in
that scope SHALL parse as a JSON object, declare `version: 1`, and contain the
required section with the expected container type. A failed scope SHALL remain
unchanged, SHALL use empty or default configuration for that session, and SHALL
be retried on a later `session_start`.

The package SHALL atomically write the complete version 2 file, replacing a user
`config.json` version 1 at the same path, before deleting migrated
`presets.json` and `policy.json` files. It SHALL treat an already-missing legacy
file during cleanup as success. User and project outcomes SHALL be combined into
one migration result notification. The notification SHALL use info level when
every attempted migration succeeds and warning level when any attempted
migration fails. A failure SHALL name the affected file and reason and point to
the README migration guidance.

When a version 2 configuration already exists, the package SHALL neither read
nor report any remaining legacy files in that scope.

#### Scenario: User files migrate successfully

- **WHEN** a user scope has valid version 1 configuration, preset, or policy
  files and no version 2 configuration
- **THEN** the package SHALL atomically create `config.json` version 2 with
  every represented section
- **AND** it SHALL delete migrated `presets.json` and `policy.json` files only
  after the atomic write succeeds
- **AND** the migration result notification SHALL report success

#### Scenario: Project presets migrate when the project opens

- **WHEN** a session starts in a project containing a valid version 1
  `.pi/presets-plus/presets.json` and no version 2 project configuration
- **THEN** the package SHALL create `.pi/presets-plus/config.json` version 2
  containing those presets
- **AND** it SHALL delete the legacy project preset file after the write
  succeeds

#### Scenario: Invalid legacy file blocks its scope

- **WHEN** any existing legacy file in a scope has malformed JSON, an
  unsupported version, an invalid top-level value, or a missing required
  container
- **THEN** the package SHALL NOT create the version 2 file or delete any legacy
  file in that scope
- **AND** the scope SHALL use empty or default configuration for that session
- **AND** the warning notification SHALL identify the file and reason

#### Scenario: Invalid entry is copied for normal validation

- **WHEN** a structurally valid legacy preset or policy file contains an invalid
  individual entry
- **THEN** migration SHALL copy the containing array without changing the entry
- **AND** the version 2 loader SHALL apply its normal entry validation after
  migration

#### Scenario: Atomic write fails

- **WHEN** writing the version 2 configuration fails
- **THEN** no legacy file SHALL be deleted
- **AND** the migration result SHALL report failure

#### Scenario: Legacy cleanup fails after commit

- **WHEN** the version 2 write succeeds but deleting a migrated sidecar file
  fails for a reason other than the file already being absent
- **THEN** the version 2 configuration SHALL remain active
- **AND** the migration result SHALL warn that cleanup was incomplete and name
  the remaining file

#### Scenario: Version 2 takes precedence

- **WHEN** a version 2 configuration and one or more legacy files coexist in a
  scope
- **THEN** the package SHALL use only the version 2 configuration
- **AND** it SHALL leave the legacy files unchanged without warning

### Requirement: Scoped configuration validation

The package SHALL validate every section it reads from a version 2
configuration. A file-level error SHALL make that scope empty and emit a
warning. An invalid `showInactiveStatus` SHALL use the inherited or default
value and emit a warning. Preset entry validation SHALL continue to skip invalid
entries while retaining valid entries. Configuration warnings SHALL leave
loading and activation available, but any warning from a scope SHALL make that
scope unsafe for a later preset mutation.

#### Scenario: Invalid project setting falls back to user

- **WHEN** the project file has an invalid `showInactiveStatus` and the user
  file sets a valid value
- **THEN** the package SHALL warn and use the user value

#### Scenario: Invalid preset does not hide valid presets

- **WHEN** one preset entry is invalid and another is valid in the same version
  2 file
- **THEN** the package SHALL skip the invalid entry, warn, and load the valid
  entry

#### Scenario: Warning blocks mutation

- **WHEN** loading a scope produces any configuration, preset, or policy warning
  and a preset mutation targets that scope
- **THEN** the mutation SHALL fail without changing the file

## MODIFIED Requirements

### Requirement: Atomic write on save

When the package writes a configuration file, it SHALL write to a uniquely named
temporary file in the same directory, fsync, then rename atomically over the
destination, so that the destination is never observed in a partially written
state. The package SHALL create parent directories as needed.

#### Scenario: Save creates parent directories

- **WHEN** the package saves to a scope whose parent directory does not yet
  exist
- **THEN** the parent directory SHALL be created with `recursive: true` before
  the write

#### Scenario: Save succeeds

- **WHEN** the package saves a modified configuration
- **THEN** the destination file SHALL contain the complete new content and no
  temporary artifact SHALL remain on success

#### Scenario: Save interrupted

- **WHEN** the process is killed mid-save
- **THEN** the destination file SHALL retain its previous contents intact
- **AND** the partially written temporary file MAY remain on disk

### Requirement: Storage CRUD primitives

The package SHALL expose programmatic operations on the storage layer to load
all presets across both scopes, save an entire scope's preset list, add a
preset, update an existing preset, remove a preset, reorder presets, and move a
preset between scopes.

Before a read-modify-write operation changes a scope, it SHALL load the complete
current configuration file. If loading any section produces a warning, the
operation SHALL return a failure and SHALL NOT write that file. A missing file
is a valid empty scope and SHALL remain writable.

Accepted mutations SHALL replace only the target scope's `presets` value while
preserving all other top-level keys and section values. A new scope file SHALL
use version 2. A cross-scope move SHALL validate both scope files, source
existence, and destination name availability before its first write. It SHALL
write the destination before removing the source. If source removal fails while
the process remains running, it SHALL attempt to restore the previous
destination contents before reporting the failure.

#### Scenario: Add to project scope

- **WHEN** a valid preset is added to a safe project scope
- **THEN** it SHALL be appended to the project configuration's `presets` array
- **AND** every other project configuration value SHALL be preserved
- **AND** the user configuration SHALL not be touched

#### Scenario: First save creates version 2

- **WHEN** a preset is saved to a scope with no configuration or legacy files
- **THEN** the package SHALL create a version 2 `config.json` containing the
  preset

#### Scenario: Rename via update

- **WHEN** a preset is renamed in a safe user scope
- **THEN** the preset entry SHALL retain its position and reflect its changed
  fields
- **AND** unrelated configuration values SHALL be preserved

#### Scenario: Reorder within scope

- **WHEN** a safe scope contains presets `[a, b, c]` and receives the order
  `[b, a, c]`
- **THEN** its `presets` array SHALL be rewritten in the requested order
- **AND** unrelated configuration values SHALL be preserved

#### Scenario: Remove

- **WHEN** a preset is removed from a safe project scope
- **THEN** it SHALL no longer appear in the project `presets` array
- **AND** unrelated configuration values SHALL be preserved

#### Scenario: Mutation refuses an incomplete load

- **WHEN** a mutation loads an affected scope and loading reports any warning
- **THEN** it SHALL return a failure stating that the configuration was not
  changed because it could not be loaded completely
- **AND** it SHALL leave the file unchanged

#### Scenario: Move validates before writing

- **WHEN** a cross-scope move has equal source and destination scopes, a missing
  source preset, a destination name collision, or a warning from either scope
- **THEN** it SHALL return a failure before writing either scope

#### Scenario: Move succeeds

- **WHEN** a cross-scope move has two safe scope files, an existing source
  preset, and no destination name collision
- **THEN** the destination configuration SHALL contain the moved preset
- **AND** the source configuration SHALL no longer contain the original preset
- **AND** unrelated values in both files SHALL be preserved

#### Scenario: Source removal fails during move

- **WHEN** the destination write succeeds and the following source write fails
  while the process remains running
- **THEN** the move SHALL attempt to restore the complete previous destination
  configuration
- **AND** it SHALL report the source failure

#### Scenario: Move rollback also fails

- **WHEN** the source write fails after the destination write and restoring the
  previous destination configuration also fails
- **THEN** the move SHALL report both failures

### Requirement: Configuration reloads with the extension

The package SHALL re-read both scoped configuration files during `session_start`
and whenever the extension is reloaded through `/reload`. The `/presets reload`
command SHALL re-read the `presets` sections without being required to apply
changed `showInactiveStatus` or policy values.

#### Scenario: External configuration edit then /reload

- **WHEN** the user edits a scoped `config.json` and runs `/reload`
- **THEN** all changed configuration sections SHALL be effective during the
  reloaded extension session
- **AND** the footer SHALL reflect the effective inactive-status preference

#### Scenario: Presets reload does not reload extension configuration

- **WHEN** the user edits `presets` and another section in `config.json` and
  runs `/presets reload`
- **THEN** the command SHALL load and report the edited presets
- **AND** the other section SHALL not be required to take effect until `/reload`
  or a new session

### Requirement: /presets reload subcommand

The `/presets` command SHALL accept a `reload` subcommand that re-reads the
`presets` sections from the user and project configuration files and reports the
resulting count and any warnings. It SHALL NOT be required to apply changes from
other configuration sections.

#### Scenario: Reload after external edit

- **WHEN** the user edits a `presets` array and runs `/presets reload`
- **THEN** the new presets SHALL be loaded
- **AND** a notification SHALL state how many presets are now loaded

## REMOVED Requirements

### Requirement: Versioned JSON storage with global and project scopes

**Reason**: Version 2 configuration files replace the separate version 1 preset
files.

**Migration**: The package automatically moves each valid legacy `presets` array
into the matching scope's version 2 `config.json` during `session_start`.

### Requirement: Separate extension configuration file

**Reason**: Settings and presets now share the scoped version 2 configuration
file, and project settings are supported.

**Migration**: The package automatically copies the user version 1
`showInactiveStatus` value into the version 2 user configuration. Project
settings can be added to the new project configuration.
