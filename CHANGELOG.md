# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.1.3] - 2026-05-10

### Added

- `/presets show-prompt [name]` shows the active preset's system prompt — or any named preset's prompt — in a dismissible dialog. With no name it shows the active preset; with a name it shows that preset's prompt without activating it.

### Fixed

- Editing the Prompt field on a preset now opens a real multi-line editor. Previously the field was a single-line input whose cursor became invisible past the visible width, making prompts beyond a few dozen characters effectively unreachable. Press Enter on the Prompt row to open the editor.

## [0.1.2] - 2026-05-09

### Fixed

- Pressing `c` (clear) inside the preset picker with no preset active no longer opens an empty confirm-then-nothing dialog. The picker now shows an info-dialog stating "No preset is active." and returns to the picker.
- The session-start notification for a preset that shadows a Pi built-in now uses warning severity to match the visual treatment of preset-vs-preset hotkey conflicts. Both collision-style notifications render consistently.

## [0.1.1] - 2026-05-09

### Changed

- Refactored the extension's internal architecture so the active-preset state, the runtime hotkey bindings, and the clear-summary renderer each live in a single dedicated module. No user-visible behavior change; the picker, editor, `/presets` subcommands, `--preset` flag, hotkeys, drift detection, and session restore all behave identically.

## [0.1.0] - 2026-05-09

_Initial release._

[0.1.3]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.3
[0.1.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.2
[0.1.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.1
[0.1.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.0
