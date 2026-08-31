## MODIFIED Requirements

### Requirement: Read-only policy inspection view

The `/presets` command SHALL accept a read-only `policy` subcommand that reports the effective policy outcome for the current working directory. The view SHALL help users identify which usable presets policy allows, which usable presets policy prohibits, and which preset policy selects as the default for a fresh session.

For this view, a usable preset is a loaded preset that is neither shadowed nor unavailable. The allowed and prohibited lists SHALL classify every usable preset by the same permission decision used when activation is attempted, and SHALL preserve merged preset order. A prohibited preset remains activatable through the existing explicit override flow.

When one or more policy rules match the current directory, the report SHALL use the labeled-row presentation of `/presets status`:

- An accent-colored bold title of `Preset Policy`.
- A `Directory:` row containing the current working directory.
- An `Allowed presets:` row containing the comma-separated names of usable permitted presets, or `none` when there are none.
- A `Prohibited presets*:` row containing the comma-separated names of usable prohibited presets when at least one exists.
- A `Prohibited presets:` row containing `none` when no usable preset is prohibited.
- A `Default preset:` row containing the resolved default preset name, or `none` when no default resolves.
- Aligned muted row labels, matching the visual treatment of `/presets status`.

When the report contains one or more prohibited presets, it SHALL append a blank line followed by the exact footnote `* You can still activate a prohibited preset by confirming the override.`. When no usable preset is prohibited, the label SHALL omit the asterisk and the report SHALL omit the footnote.

The report SHALL NOT display policy rule numbers, rule patterns, matcher expressions, match lengths, matched substrings, winning-rule details, or default-selection reasons.

The view SHALL be read-only. It SHALL never write `policy.json`. It SHALL be delivered through `ctx.ui.notify`, following the existing pure-formatter and thin-runner convention.

#### Scenario: Policy view with matching rules

- **WHEN** the user runs `/presets policy` in a directory with matching policy rules
- **AND** the merged preset list contains usable presets that the effective policy permits and prohibits
- **THEN** the report SHALL list the permitted preset names under `Allowed presets:`
- **AND** the report SHALL list the prohibited preset names under `Prohibited presets*:`
- **AND** both lists SHALL preserve merged preset order

#### Scenario: Prohibited presets explain the override

- **WHEN** the effective policy prohibits at least one usable preset
- **THEN** the prohibited label SHALL be `Prohibited presets*:`
- **AND** the report SHALL end with `* You can still activate a prohibited preset by confirming the override.` after a blank line

#### Scenario: No prohibited presets omits the footnote

- **WHEN** the effective policy prohibits no usable presets
- **THEN** the report SHALL contain `Prohibited presets: none`
- **AND** the report SHALL NOT contain the override footnote

#### Scenario: Every usable preset is prohibited

- **WHEN** the effective policy prohibits every usable preset
- **THEN** the report SHALL contain `Allowed presets: none`
- **AND** every usable preset name SHALL appear under `Prohibited presets*:`

#### Scenario: Shadowed and unavailable presets are omitted

- **WHEN** the merged preset list contains shadowed or unavailable presets
- **THEN** those presets SHALL appear in neither the allowed nor prohibited list

#### Scenario: Resolved default is shown without rule diagnostics

- **WHEN** policy resolves a default preset for the current directory
- **THEN** the `Default preset:` row SHALL contain that preset's name
- **AND** the report SHALL NOT identify the winning rule or its selection reason

#### Scenario: No resolved default

- **WHEN** no policy default resolves to a permitted available preset
- **THEN** the report SHALL contain `Default preset: none`

#### Scenario: Policy view with no matching rules

- **WHEN** the user runs `/presets policy` in a cwd matched by no rules
- **THEN** the output SHALL be the sentence `No preset policy applies to <cwd>.` with `<cwd>` replaced by the current working directory

#### Scenario: Policy view hides policy-engine details

- **WHEN** the user runs `/presets policy` in a directory with matching rules
- **THEN** the report SHALL NOT display rule numbers, regular-expression patterns, matcher fields, match lengths, matched substrings, or default-source details

#### Scenario: Policy view never writes

- **WHEN** the user runs `/presets policy`
- **THEN** `policy.json` SHALL NOT be modified
