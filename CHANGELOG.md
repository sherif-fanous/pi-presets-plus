# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.1.1] - 2026-05-09

### Changed

- Refactored the extension's internal architecture so the active-preset state, the runtime hotkey bindings, and the clear-summary renderer each live in a single dedicated module. No user-visible behavior change; the picker, editor, `/presets` subcommands, `--preset` flag, hotkeys, drift detection, and session restore all behave identically.

## [0.1.0] - 2026-05-09

_Initial release._

[0.1.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.1
[0.1.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.0
