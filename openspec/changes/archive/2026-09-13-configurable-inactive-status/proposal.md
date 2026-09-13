## Why

Users who do not want an inactive preset indicator currently see `Preset: none` in Pi's footer. Add a preference for hiding that entry while preserving the current display by default.

## What Changes

- Add a separate user-global `config.json` under the existing `presets-plus` directory.
- Add the `showInactiveStatus` boolean option, defaulting to `true` when absent or unusable.
- Read the option during extension startup and `/reload`.
- Remove the `presets-plus` footer entry when the option is `false` and no preset is active.
- Keep `/presets reload` focused on re-reading preset files; it does not reload extension configuration.
- Use the title-case footer text `Preset: none` when the inactive entry is enabled.
- Leave future consolidation of `presets.json`, `policy.json`, and `config.json` out of scope.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `preset-activation`: Make the inactive footer indicator configurable while retaining `Preset: none` as the default.
- `preset-storage`: Add a separately stored, user-global extension configuration file and define its reload and fail-open behavior.
- `preset-drift-detection`: Align the dirty-status badge wording with the title-case footer label.

## Impact

The change affects configuration-path and configuration-loading code, extension startup and reload behavior, the active-session status writer, the footer formatter, tests, and user documentation. It adds no dependencies and does not change preset file shape, policy file shape, activation behavior, or the meaning of `/presets reload`.
