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

When a preset's hotkey matches a documented pi built-in (per `docs/keybindings.md`), the package SHALL still register the binding (which takes precedence over the built-in within pi's keybinding model) and SHALL emit a warning-level notification at session start naming the preset and the built-in it shadows.

The package SHALL also annotate the in-memory `LoadedPreset` with `hotkeyShadowsBuiltin: true` so downstream consumers (notably the picker card) can surface the shadowing condition without re-running edit-time validation. The annotation SHALL be cleared and recomputed on every load (mirroring `hotkeyConflict`'s behavior) so an annotation from a prior load can never persist past a hotkey change.

#### Scenario: Hotkey shadows pi built-in

- **WHEN** a preset declares `hotkey: "ctrl+l"` (which matches a pi built-in for the model picker)
- **THEN** the binding SHALL be registered
- **AND** a warning notification SHALL be emitted at session start naming the preset and the built-in
- **AND** the preset SHALL be marked `hotkeyShadowsBuiltin: true` on its in-memory `LoadedPreset`

#### Scenario: Shadow notification matches conflict severity

- **WHEN** the package emits the session-start notification for a Pi built-in shadow
- **THEN** the notification SHALL use the same severity tier (`warning`) as the preset-vs-preset conflict notification, so both collision-style conditions render with consistent visual treatment

#### Scenario: Annotation cleared on reload

- **GIVEN** a preset was previously annotated `hotkeyShadowsBuiltin: true` and the user has since changed the hotkey to one that does not match any pi built-in
- **WHEN** presets are reloaded (e.g. via `ctx.reload()` or session start)
- **THEN** the preset SHALL NOT carry `hotkeyShadowsBuiltin: true` after the reload

#### Scenario: Annotation cleared when hotkey is removed

- **GIVEN** a preset was previously annotated `hotkeyShadowsBuiltin: true`
- **WHEN** the user removes the hotkey (saves the preset with an empty hotkey field) and presets are reloaded
- **THEN** the preset SHALL NOT carry `hotkeyShadowsBuiltin: true` after the reload

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

### Requirement: Hotkey mutations prompt for reload at commit time

When a hotkey binding is mutated by a successful preset Save or successful preset Delete, the package SHALL surface a `"Reload Pi?"` confirmation overlay at commit time with Yes / No actions and No selected by default. On Yes, the package SHALL close the calling overlay flow and call `ctx.reload()`. On No, the package SHALL close the dialog and continue without further action.

Prompt decisions SHALL compare committed hotkey state against the runtime baseline captured when shortcuts were registered for the current extension runtime, so reverting an un-reloaded pending hotkey edit back to the runtime baseline SHALL NOT prompt again. Renaming or scope-moving a hotkey-bearing preset SHALL prompt even when the hotkey string is unchanged, because the registered handler still points at the old preset identity.

The existing `formatHotkeyReloadNotice` inline hint in the editor SHALL remain unchanged. It serves as the during-editing signal and as a fallback reminder when the user dismisses the post-commit overlay with No.

If `ctx.reload` is not available on the surrounding pi build, the reload prompt SHALL NOT open and the package SHALL fall back to the existing inline notice. If `ctx.reload()` throws or rejects, the package SHALL surface the error via `ctx.ui.notify(<text>, "error")` rather than letting the exception escape.

#### Scenario: Editor Save adds a hotkey

- **WHEN** an editor Save successfully commits a hotkey field where none existed in the runtime baseline
- **THEN** a `"Reload Pi?"` overlay SHALL open with No selected by default

#### Scenario: Editor Save changes a hotkey

- **WHEN** an editor Save successfully replaces the runtime-baseline hotkey with a different value
- **THEN** a `"Reload Pi?"` overlay SHALL open

#### Scenario: Editor Save removes a hotkey

- **WHEN** an editor Save successfully clears a runtime-baseline hotkey
- **THEN** a `"Reload Pi?"` overlay SHALL open

#### Scenario: Editor Save reverts to runtime baseline

- **WHEN** an editor Save returns the preset identity and hotkey to the runtime baseline after an earlier un-reloaded edit
- **THEN** no reload prompt SHALL appear

#### Scenario: Editor Save renames a hotkey-bearing preset

- **WHEN** an editor Save renames or scope-moves a preset that has a runtime-baseline hotkey
- **THEN** a `"Reload Pi?"` overlay SHALL open even if the hotkey string is unchanged

#### Scenario: Picker Delete removes a hotkey-bearing preset

- **WHEN** a picker Delete successfully removes a preset whose runtime-baseline hotkey was non-empty
- **THEN** a `"Reload Pi?"` overlay SHALL open with No selected by default

#### Scenario: Picker Delete removes a hotkey-less preset

- **WHEN** a picker Delete successfully removes a preset with no runtime-baseline hotkey
- **THEN** no reload prompt SHALL appear

#### Scenario: User chooses Yes on the reload prompt

- **WHEN** the reload prompt is open and the user selects Yes
- **THEN** `ctx.reload()` SHALL be called after the calling overlay flow closes

#### Scenario: User chooses No on the reload prompt

- **WHEN** the reload prompt is open and the user selects No (or Esc, or the default-No selection)
- **THEN** the dialog SHALL close and `ctx.reload()` SHALL NOT be called
- **AND** the calling flow (editor close or picker refresh) SHALL continue normally

#### Scenario: ctx.reload throws

- **WHEN** the user chooses Yes and `ctx.reload()` throws or rejects
- **THEN** an error notification SHALL surface naming the failure
- **AND** the exception SHALL NOT propagate

#### Scenario: ctx.reload not available

- **WHEN** the surrounding pi build does not expose `ctx.reload`
- **THEN** no reload prompt SHALL open from any commit-time path
- **AND** existing inline notices SHALL remain the only signals
