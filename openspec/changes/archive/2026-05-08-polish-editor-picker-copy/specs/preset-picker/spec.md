## MODIFIED Requirements

### Requirement: Picker UI lists every loaded preset

The package SHALL provide a custom TUI picker (built on `ctx.ui.custom`) that lists every loaded preset across both scopes. Each list entry SHALL render as a multi-line key/value card showing: a status dot when the preset is currently active, the preset name, scope as `User` or `Project`, `provider / model`, thinking level, tool summary or `inherit`, optional prompt preview, explicit availability status when `unavailable`, and explicit shadowing status when shadowed.

Card field labels SHALL render in the `muted` color. Card field **values** SHALL NOT use the `muted` color: every value renders in either the theme's default text color (Scope, Model, Tools, Prompt) or a semantically meaningful color (Thinking — by level; Status — `warning`; Drift — `warning`; Shadowing — `dim`). This ensures every field has visible label-vs-value contrast.

When a preset is `unavailable`, the picker card SHALL render its `Status:` field with a `⚠` glyph and a sentence-cased explanatory message in `warning` color. The message SHALL match the cause:

- For `unavailable: "no-key"` (the resolved model's provider has no API key configured), the message SHALL read exactly `"This preset's provider has no API key configured."`.
- For `unavailable: "no-model"` (the resolved model is not present in the model registry), the message SHALL read exactly `"This preset's model is no longer available."`.

The redundant `"Unavailable —"` prefix SHALL NOT appear in the message body; the surrounding `Status:` label and `⚠` glyph already convey the unavailability framing.

#### Scenario: Open picker with several presets

- **WHEN** the user invokes `/presets`
- **THEN** every loaded preset SHALL appear with the fields above and no preset SHALL be hidden by default

#### Scenario: Active preset highlighted

- **WHEN** preset `plan` is currently active and the picker is opened
- **THEN** the entry for `plan` SHALL display a filled status dot distinct from inactive entries

#### Scenario: Unavailable preset rendered with no-key reason

- **WHEN** a preset is marked `unavailable: "no-key"`
- **THEN** its card SHALL render the `Status:` field as `⚠ This preset's provider has no API key configured.`

#### Scenario: Unknown-model preset rendered with no-model reason

- **WHEN** a preset is marked `unavailable: "no-model"`
- **THEN** its card SHALL render the `Status:` field as `⚠ This preset's model is no longer available.`

#### Scenario: Shadowed global preset shown with marker

- **WHEN** a global preset is shadowed by a same-named project preset
- **THEN** both entries SHALL appear in the picker (with `Scope: All`), and the global one SHALL show `Shadowing: Overridden by project preset`

#### Scenario: Scope and Model values render in default text color

- **WHEN** the picker renders a preset card
- **THEN** the value cell of the `Scope:` field SHALL NOT use the `muted` color
- **AND** the value cell of the `Model:` field SHALL NOT use the `muted` color
- **AND** both `Scope:` and `Model:` labels SHALL continue to render in `muted` color so each field has label-vs-value contrast

#### Scenario: Availability message body omits the legacy prefix

- **WHEN** a preset is marked `unavailable`
- **THEN** the rendered availability message SHALL NOT begin with the substring `"Unavailable —"` or `"Unavailable -"` in any form
