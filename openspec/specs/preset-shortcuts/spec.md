# preset-shortcuts Specification

## Purpose

Define startup and keyboard shortcuts for activating presets without adding
sequential cycling commands.

## Requirements

### Requirement: --preset CLI flag

The package SHALL register a CLI flag `--preset <name>` of type string. When pi starts and the flag is set to a non-empty string, the package SHALL apply the named preset during `session_start` using a full apply (not a soft attach). If the named preset does not exist or is unavailable, a warning SHALL be emitted and no preset SHALL be applied.

#### Scenario: Valid flag at startup

- **WHEN** pi starts with `--preset plan` and `plan` is loaded and available
- **THEN** the preset `plan` SHALL be fully applied during `session_start`

#### Scenario: Unknown name

- **WHEN** pi starts with `--preset does-not-exist`
- **THEN** a warning SHALL be emitted naming the available presets and no preset SHALL be applied

#### Scenario: Unavailable preset

- **WHEN** pi starts with `--preset plan` and `plan` is marked `unavailable`
- **THEN** a warning SHALL be emitted naming the unavailability reason and no preset SHALL be applied

#### Scenario: Flag overrides session-restored attachment

- **WHEN** pi starts with `--preset plan` and the session being restored had `other` recorded as the active preset
- **THEN** `plan` SHALL be fully applied (replacing the would-be `priorUnknown` attachment for `other`)

### Requirement: /presets next and /presets prev are not added

The `/presets` command SHALL NOT add `next` or `prev` subcommands in this change. Browsing and switching presets remains picker-driven; muscle-memory activation is provided by `--preset` at startup and per-preset hotkeys.

#### Scenario: next subcommand is not added

- **WHEN** the user runs `/presets next`
- **THEN** the package SHALL NOT cycle presets from that subcommand

#### Scenario: prev subcommand is not added

- **WHEN** the user runs `/presets prev`
- **THEN** the package SHALL NOT cycle presets from that subcommand

### Requirement: Per-preset hotkeys registered at session start

The package SHALL register one `pi.registerShortcut` per loaded preset that has a non-empty, parseable `hotkey` field, during `session_start`. The shortcut handler SHALL look up the _current_ preset definition at activation time (not capture it from registration time) so that subsequent edits to the preset's model, thinking, tools, or instructions take effect on the next press of the hotkey without requiring `/reload`.

#### Scenario: Hotkey activates the preset

- **WHEN** preset `plan` has `hotkey: "ctrl+shift+1"` at session start
- **THEN** pressing `Ctrl+Shift+1` SHALL apply preset `plan`

#### Scenario: Editing preset behavior takes effect immediately

- **WHEN** the user edits the model, thinking level, tools, or instructions of a preset that has a hotkey, and then presses the hotkey
- **THEN** the activation SHALL use the updated definition without requiring `/reload`

#### Scenario: Invalid hotkey skipped

- **WHEN** a preset's `hotkey` field is not parseable
- **THEN** no shortcut SHALL be registered for that preset and a warning SHALL be emitted at session start

#### Scenario: Removed preset, hotkey pressed

- **WHEN** the user removes a preset that had a hotkey, then presses the hotkey before `/reload`
- **THEN** the handler SHALL detect the removal and SHALL emit a warning notification stating the preset no longer exists; no apply SHALL occur

#### Scenario: Now-unavailable preset

- **WHEN** the user presses a hotkey for a preset that has become `unavailable` (e.g. provider key removed mid-session)
- **THEN** the handler SHALL emit a warning notification naming the unavailability reason; no apply SHALL occur

### Requirement: Hotkey conflicts between presets

When two loaded presets declare the same hotkey, the package SHALL register the binding for the first one in load order and SHALL NOT register the binding for subsequent presets with the same hotkey. Each losing preset SHALL be marked with `hotkeyConflict: true` on its in-memory `LoadedPreset`. A warning SHALL be emitted at session start naming the conflicting presets.

#### Scenario: Two presets, same hotkey

- **WHEN** preset `plan` and preset `review` both declare `hotkey: "ctrl+shift+1"`, with `plan` loaded first
- **THEN** `Ctrl+Shift+1` SHALL apply `plan`
- **AND** `review` SHALL be marked `hotkeyConflict: true`
- **AND** a warning SHALL be emitted at session start

#### Scenario: Picker renders conflict indicator

- **WHEN** a preset has `hotkeyConflict: true`
- **THEN** the picker card SHALL show `⚠ hotkey conflict`

### Requirement: Hotkey conflict with pi built-in

When a preset's hotkey matches a documented pi built-in (per `docs/keybindings.md`), the package SHALL still register the binding (which takes precedence over the built-in within pi's keybinding model) and SHALL emit an info-level notification at session start naming the preset and the built-in it shadows.

#### Scenario: Hotkey shadows pi built-in

- **WHEN** a preset declares `hotkey: "ctrl+l"` (which matches a pi built-in for the model picker)
- **THEN** the binding SHALL be registered
- **AND** an info notification SHALL be emitted at session start naming the preset and the built-in

### Requirement: Hotkey changes require /reload

When a preset's `hotkey` field is changed (added, modified, or removed) via the editor and saved, the editor SHALL display a notice that the change takes effect after `/reload` and that the previous binding (if any) remains active until then. The package SHALL NOT attempt to unregister or re-register shortcuts dynamically; pi exposes no API for unregistering.

#### Scenario: Adding a hotkey

- **WHEN** the user adds a hotkey to a preset that previously had none, and saves
- **THEN** the editor SHALL display a notice that the new binding takes effect after `/reload`

#### Scenario: Changing a hotkey

- **WHEN** the user changes a preset's hotkey from `ctrl+shift+1` to `ctrl+shift+2`, and saves
- **THEN** the editor SHALL display a notice naming both the old and new bindings, stating that the change takes effect after `/reload` and that the old binding remains active until then

#### Scenario: Removing a hotkey

- **WHEN** the user removes a preset's hotkey, and saves
- **THEN** the editor SHALL display a notice naming the old binding, stating that the removal takes effect after `/reload`
