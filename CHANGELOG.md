# Changelog

## [0.7.0] - 2026-09-05

### Added

- Add Pi's `max` thinking level to preset storage, activation, editing, and picker display; require Pi 0.80.6 or newer only when using `max` ([#20](https://github.com/sherif-fanous/pi-presets-plus/pull/20)) (Tiago Luchini)

### Fixed

- Keep preset status and clearing aligned with Pi when a model supports neither the requested thinking level nor `off` ([#20](https://github.com/sherif-fanous/pi-presets-plus/pull/20)) (Sherif Fanous)

## [0.6.1] - 2026-09-05

### Fixed

- Prevent edits, removals, reordering, and scope changes from overwriting preset files that cannot be loaded completely ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Check both preset files before moving a preset between scopes and attempt to restore the destination if removing the source fails ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Restore remaining baseline settings and detach an active preset even when Pi cannot restore the previous model ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Report unexpected picker and editor action failures instead of leaving the failed operation unexplained ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Keep the selected preset visible during picker navigation when cards have different heights ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))
- Treat repeated tool names as one tool when detecting drift and clearing a preset ([#29](https://github.com/sherif-fanous/pi-presets-plus/pull/29))

## [0.6.0] - 2026-09-03

### Changed

- **Breaking:** Require Pi `0.80.5` or newer ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))
- Keep preset status and policy reports visible in the TUI without adding them to LLM context, while sending them as notifications in RPC mode ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))
- Send one output for each preset activation, clear result, and startup warning instead of mixing notifications, overlays, and session messages ([#27](https://github.com/sherif-fanous/pi-presets-plus/pull/27))

## [0.5.2] - 2026-09-03

### Fixed

- Remove the duplicate success notification from policy default activation ([#25](https://github.com/sherif-fanous/pi-presets-plus/pull/25))

## [0.5.1] - 2026-08-31

### Changed

- Show allowed presets, prohibited presets, and the selected default in `/presets policy` instead of exposing policy rule details ([#23](https://github.com/sherif-fanous/pi-presets-plus/pull/23))

## [0.5.0] - 2026-08-30

### Added

- Add directory-specific rules that allow or prohibit presets by name, provider, or `provider/model`, with confirmation before overriding a prohibition ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))
- Select an optional permitted default preset for fresh sessions after checking the `--preset` flag and session restore ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))
- Show matching rules, combined allow and prohibit sets, and the resolved default through `/presets policy` ([#21](https://github.com/sherif-fanous/pi-presets-plus/pull/21))

## [0.4.0] - 2026-06-04

### Added

- Show the active preset and its scope on a fixed picker row, including when its card is outside the visible or filtered list ([#18](https://github.com/sherif-fanous/pi-presets-plus/pull/18))

## [0.3.0] - 2026-06-02

### Changed

- Open a prefilled editor when duplicating a preset and save the copy only after confirmation ([#16](https://github.com/sherif-fanous/pi-presets-plus/pull/16))

## [0.2.1] - 2026-05-31

### Changed

- Refactor preset editing, picker actions, and clear and status comparisons into focused modules without changing user-visible behavior ([#13](https://github.com/sherif-fanous/pi-presets-plus/pull/13), [#14](https://github.com/sherif-fanous/pi-presets-plus/pull/14))

## [0.2.0] - 2026-05-12

### Changed

- **Breaking:** Target Pi from the `@earendil-works` npm scope and require Pi `0.74.0` or newer ([#9](https://github.com/sherif-fanous/pi-presets-plus/pull/9))

## [0.1.4] - 2026-05-11

### Fixed

- Keep the selected picker card visible while navigating across cards with different heights ([#7](https://github.com/sherif-fanous/pi-presets-plus/pull/7))

## [0.1.3] - 2026-05-10

### Added

- Add `/presets show-prompt [name]` for viewing a preset's system prompt without activating it ([#5](https://github.com/sherif-fanous/pi-presets-plus/pull/5))

### Fixed

- Open Pi's multi-line editor from the Prompt row so long prompts remain reachable and editable ([#5](https://github.com/sherif-fanous/pi-presets-plus/pull/5))

## [0.1.2] - 2026-05-09

### Fixed

- Show "No preset is active." instead of opening a clear confirmation when no preset is active ([#3](https://github.com/sherif-fanous/pi-presets-plus/pull/3))
- Use warning severity when a preset hotkey shadows a Pi built-in ([#2](https://github.com/sherif-fanous/pi-presets-plus/pull/2))

## [0.1.1] - 2026-05-09

### Changed

- Refactor active-preset state, runtime hotkeys, and clear summaries into dedicated modules without changing user-visible behavior ([#1](https://github.com/sherif-fanous/pi-presets-plus/pull/1))

## [0.1.0] - 2026-05-09

_Initial release._

[0.7.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.7.0
[0.6.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.6.1
[0.6.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.6.0
[0.5.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.2
[0.5.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.1
[0.5.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.5.0
[0.4.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.4.0
[0.3.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.3.0
[0.2.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.1
[0.2.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.2.0
[0.1.4]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.4
[0.1.3]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.3
[0.1.2]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.2
[0.1.1]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.1
[0.1.0]: https://github.com/sherif-fanous/pi-presets-plus/releases/tag/v0.1.0
