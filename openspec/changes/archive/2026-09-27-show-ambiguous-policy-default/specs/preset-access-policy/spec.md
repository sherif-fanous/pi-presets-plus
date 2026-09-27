## MODIFIED Requirements

### Requirement: Read-only policy inspection view

The `/presets` command SHALL accept a read-only `policy` subcommand that reports
the effective policy outcome for the current working directory. The view SHALL
help users identify which usable presets policy allows, which usable presets
policy prohibits, and which preset policy selects as the default for a fresh
session.

For this view, a usable preset is a loaded preset that is neither shadowed nor
unavailable. The allowed and prohibited lists SHALL classify every usable preset
by the same permission decision used when activation is attempted, and SHALL
preserve merged preset order. A prohibited preset remains activatable through
the existing explicit override flow.

A default candidate is a usable, permitted preset that the winning rule's
`default` matcher matches, as defined by policy default selection. The resolved
default is the first default candidate in merged preset order.

When one or more policy rules match the current directory, the report SHALL use
the labeled-row presentation of `/presets status`:

- An accent-colored bold title of `Preset Policy`.
- A `Directory:` row containing the current working directory.
- An `Allowed presets:` row containing the comma-separated names of usable
  permitted presets, or `none` when there are none.
- A `Prohibited presets*:` row containing the comma-separated names of usable
  prohibited presets when at least one exists.
- A `Prohibited presets:` row containing `none` when no usable preset is
  prohibited.
- A `Default preset:` row containing the resolved default preset name, or `none`
  when no default resolves.
- A `Default matches:` row, directly after the `Default preset:` row, containing
  the comma-separated names of every default candidate in merged preset order,
  only when there are two or more default candidates.
- Aligned muted row labels, matching the visual treatment of `/presets status`.

When the report contains one or more prohibited presets, it SHALL append a blank
line followed by the exact footnote
`* You can still activate a prohibited preset by confirming the override.`. When
no usable preset is prohibited, the label SHALL omit the asterisk and the report
SHALL omit the footnote. When fewer than two default candidates exist, the
report SHALL omit the `Default matches:` row. The report SHALL NOT add any note
explaining how the default was chosen among several candidates.

The report SHALL NOT display policy rule numbers, rule patterns, matcher
expressions, match lengths, matched substrings, winning-rule details, or which
rule-selection step chose the winning rule. The `Default matches:` row is the
only default-selection detail the report shows.

The view SHALL NOT modify the configuration file. In TUI mode, a prompt-invoked
`/presets policy` SHALL appear as a durable TUI-only command report that does
not enter LLM context. The picker SHALL show the same report text in the shared
info-dialog overlay. In RPC mode, the package SHALL deliver the report through
the RPC-compatible notification path. JSON and print modes are out of scope.

Warnings found while loading policy or presets SHALL be included in the command
report where possible instead of appearing as a separate notification
immediately before it.

#### Scenario: Policy view from the prompt

- **WHEN** the user runs `/presets policy` from the prompt in TUI mode
- **THEN** a durable command report SHALL appear in the conversation
- **AND** the report SHALL NOT enter LLM context

#### Scenario: Policy view from the picker

- **WHEN** the user requests policy from inside the picker
- **THEN** the policy report SHALL appear in an info dialog above the picker
- **AND** dismissing the dialog SHALL return the user to the picker
- **AND** the report text SHALL match the prompt-invoked report

#### Scenario: Policy view in RPC mode

- **WHEN** the user invokes `/presets policy` in RPC mode
- **THEN** the report SHALL be delivered through the RPC notification protocol
- **AND** the report SHALL NOT be sent to the LLM as a custom message

#### Scenario: Policy view with matching rules

- **WHEN** the current directory has matching policy rules and usable presets
  that policy permits and prohibits
- **THEN** the report SHALL list the permitted names under `Allowed presets:`
- **AND** it SHALL list the prohibited names under `Prohibited presets*:`
- **AND** both lists SHALL preserve merged preset order

#### Scenario: Prohibited presets explain the override

- **WHEN** policy prohibits at least one usable preset
- **THEN** the prohibited label SHALL be `Prohibited presets*:`
- **AND** the report SHALL end with
  `* You can still activate a prohibited preset by confirming the override.`
  after a blank line

#### Scenario: No prohibited presets omits the footnote

- **WHEN** policy prohibits no usable preset
- **THEN** the report SHALL contain `Prohibited presets: none`
- **AND** it SHALL omit the override footnote

#### Scenario: Every usable preset is prohibited

- **WHEN** policy prohibits every usable preset
- **THEN** the report SHALL contain `Allowed presets: none`
- **AND** every usable preset name SHALL appear under `Prohibited presets*:`

#### Scenario: Shadowed and unavailable presets are omitted

- **WHEN** the merged preset list contains shadowed or unavailable presets
- **THEN** those presets SHALL appear in neither the allowed nor prohibited list
- **AND** they SHALL NOT appear in the `Default matches:` row

#### Scenario: Resolved default is shown without rule diagnostics

- **WHEN** policy resolves a default preset for the current directory
- **THEN** the `Default preset:` row SHALL contain that preset's name
- **AND** the report SHALL NOT identify the winning rule or which rule-selection
  step chose it

#### Scenario: Single default candidate shows no matches row

- **WHEN** the winning default matches exactly one usable, permitted preset
- **THEN** the report SHALL contain that preset under `Default preset:`
- **AND** it SHALL omit the `Default matches:` row

#### Scenario: Several default candidates are listed

- **WHEN** the winning default matches presets A and B, both usable and
  permitted, with A before B in merged preset order
- **THEN** the report SHALL contain `Default preset:` with A
- **AND** it SHALL contain a `Default matches:` row with `A, B` directly after
  the `Default preset:` row
- **AND** it SHALL NOT add a note explaining the choice

#### Scenario: Prohibited default matches are not listed

- **WHEN** the winning default matches presets A, B, and C in merged preset
  order, and policy prohibits B
- **THEN** the `Default matches:` row SHALL contain `A, C`
- **AND** B SHALL appear under `Prohibited presets*:`

#### Scenario: No resolved default

- **WHEN** no policy default resolves to a permitted and available preset
- **THEN** the report SHALL contain `Default preset: none`
- **AND** it SHALL omit the `Default matches:` row

#### Scenario: Policy view with no matching rules

- **WHEN** the cwd matches no policy rule
- **THEN** the output SHALL be the sentence `No preset policy applies to <cwd>.`
  with `<cwd>` replaced by the current working directory

#### Scenario: Policy view hides policy-engine details

- **WHEN** the user runs `/presets policy` in a directory with matching rules
- **THEN** the report SHALL NOT display rule numbers, regular-expression
  patterns, matcher fields, match lengths, matched substrings, or which rule
  supplied the default

#### Scenario: Policy view never writes

- **WHEN** the user runs `/presets policy`
- **THEN** the configuration file SHALL NOT be modified
