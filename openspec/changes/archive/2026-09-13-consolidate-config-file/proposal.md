## Why

Pi Presets Plus spreads its settings, presets, and policy across three JSON files with separate loading and validation paths. A single versioned configuration file per scope will make the file layout easier to understand while an automatic migration preserves existing installations.

## What Changes

- Replace the separate configuration files with `config.json` version 2 at user and project scope.
- Store `showInactiveStatus` and `presets` at the top level, with user-only policy rules under `policy.rules`.
- Let a project `showInactiveStatus` value override the user value while preserving the existing user and project preset merge behavior.
- Keep access policy user-only. Ignore a project `policy` section and warn at startup.
- Automatically migrate valid version 1 configuration, preset, and policy files when a session starts in a scope that has no version 2 configuration.
- Write the version 2 file atomically before deleting migrated files. Report migration success or failure through a single startup notification.
- Stop reading legacy files after migration. When a version 2 file exists, ignore any remaining legacy files without warning.
- Preserve unrelated fields when preset editor operations rewrite the consolidated file, and refuse a write when any configuration warning makes the file unsafe to rewrite.
- Update the README with the version 2 format and migration behavior. Note in the changelog that opening a project can migrate its tracked configuration file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-storage`: Replace separate version 1 files with scoped version 2 configuration files, define precedence and automatic migration, and preserve the full configuration during preset writes.
- `preset-access-policy`: Move user access-policy rules into the consolidated configuration while keeping policy unavailable at project scope.

## Impact

The change affects storage paths, configuration loading, policy loading, preset mutations, startup warning aggregation, tests, and user documentation. Existing user and project files are migrated on the first session that opens their scope. Project migration can create and remove files in the repository working tree. No new runtime dependency or command is required.
