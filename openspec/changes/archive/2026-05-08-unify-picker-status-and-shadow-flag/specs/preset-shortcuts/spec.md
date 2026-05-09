## MODIFIED Requirements

### Requirement: Hotkey conflict with pi built-in

When a preset's hotkey matches a documented pi built-in (per `docs/keybindings.md`), the package SHALL still register the binding (which takes precedence over the built-in within pi's keybinding model) and SHALL emit an info-level notification at session start naming the preset and the built-in it shadows.

The package SHALL also annotate the in-memory `LoadedPreset` with `hotkeyShadowsBuiltin: true` so downstream consumers (notably the picker card) can surface the shadowing condition without re-running edit-time validation. The annotation SHALL be cleared and recomputed on every load (mirroring `hotkeyConflict`'s behavior) so an annotation from a prior load can never persist past a hotkey change.

#### Scenario: Hotkey shadows pi built-in

- **WHEN** a preset declares `hotkey: "ctrl+l"` (which matches a pi built-in for the model picker)
- **THEN** the binding SHALL be registered
- **AND** an info notification SHALL be emitted at session start naming the preset and the built-in
- **AND** the preset SHALL be marked `hotkeyShadowsBuiltin: true` on its in-memory `LoadedPreset`

#### Scenario: Annotation cleared on reload

- **GIVEN** a preset was previously annotated `hotkeyShadowsBuiltin: true` and the user has since changed the hotkey to one that does not match any pi built-in
- **WHEN** presets are reloaded (e.g. via `ctx.reload()` or session start)
- **THEN** the preset SHALL NOT carry `hotkeyShadowsBuiltin: true` after the reload

#### Scenario: Annotation cleared when hotkey is removed

- **GIVEN** a preset was previously annotated `hotkeyShadowsBuiltin: true`
- **WHEN** the user removes the hotkey (saves the preset with an empty hotkey field) and presets are reloaded
- **THEN** the preset SHALL NOT carry `hotkeyShadowsBuiltin: true` after the reload
