# Changelog

This changelog follows [Common Changelog](https://common-changelog.org/).

## [0.2.1] - 2026-05-31

### Changed

- Refactored the preset editor and picker internals so each module stays focused and easy to follow. The editor's row layout, the picker's action keys, and the shared clear/status comparison logic now each live in a single dedicated location. No user-visible behavior change; the picker, editor, `/presets` subcommands, `--preset` flag, hotkeys, drift detection, and session restore all behave identically.

## [0.2.0] - 2026-05-12

### Changed

- **Breaking:** The extension now targets Pi published under the `@earendil-works` npm scope (Pi `0.74.0` and later). Pi has moved away from its old `@mariozechner` scope, and `pi-presets-plus` v0.2.0 will not load on Pi versions prior to `0.74.0`. Upgrade Pi to `0.74.0` or newer before upgrading this extension.

## [0.1.4] - 2026-05-11

### Fixed

- The preset picker no longer drops the selected card from view when scrolling past a card-height boundary. Previously, pressing the down arrow (or Page Down) at certain positions would make the selection marker disappear and the next press appear to skip a preset. The picker now keeps the selected preset visible across every navigation, regardless of which optional rows individual preset cards contain.

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

[0.2.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.1
[0.2.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.0
[0.1.4]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.4
[0.1.3]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.3
[0.1.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.2
[0.1.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.1
[0.1.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.0
