## MODIFIED Requirements

### Requirement: Policy default auto-activates only on a fresh session

The package SHALL, on `session_start`, after the `--preset` flag step and the
session-restore step have run, auto-activate the resolved policy default only
when BOTH of the following hold:

- the `--preset` flag did not activate a preset for this invocation; AND
- session restore did not attach an existing active preset, including the case
  where the most recent `presets-plus:active` entry named a preset that no
  longer loads.

The resulting precedence SHALL be: `--preset` flag > session restore (if the
named preset still exists) > policy default > baseline.

When the policy default is auto-activated, the package SHALL use the same
successful-apply outcome as other activation paths. It SHALL produce one visible
success outcome naming the preset, with any apply accompaniments combined into
that outcome. It SHALL refresh the footer indicator. It SHALL NOT emit a second
success notification for the same activation.

If the apply flow returns a refusal for the default, the package SHALL surface
the refusal reason as a warning, leave the Pi baseline in place, attach no
preset, and continue the session. Startup warnings collected during this session
SHALL be combined into one startup warning where possible.

#### Scenario: Fresh session applies the default

- **WHEN** a fresh session starts, no `--preset` flag is passed, no prior active
  preset is restored, and a policy default resolves to a permitted available
  preset
- **THEN** the default SHALL be applied through the standard apply flow
- **AND** exactly one visible success outcome naming the applied preset SHALL be
  emitted
- **AND** any apply accompaniments SHALL be included in that outcome
- **AND** no second success notification naming the same preset SHALL be emitted

#### Scenario: Flag overrides policy default

- **WHEN** a session starts with `--preset other` passed and a policy default
  also resolves
- **THEN** `other` SHALL be activated by the flag
- **AND** the policy default SHALL NOT be applied
- **AND** no policy-default success outcome SHALL be emitted

#### Scenario: Restored session is not a fresh session

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry
  names a still-loadable preset
- **THEN** that preset SHALL be re-attached by restore
- **AND** the policy default SHALL NOT be applied
- **AND** no activation success outcome SHALL be emitted for the restore

#### Scenario: Failed restore falls through to policy default

- **WHEN** a session is resumed whose most recent active entry names a preset
  that no longer loads, and a policy default resolves to a permitted available
  preset
- **THEN** restore SHALL attach nothing and SHALL contribute its warning to the
  startup warning collection
- **AND** the policy default SHALL then be applied
- **AND** the successful default activation SHALL emit only its single combined
  success outcome

#### Scenario: Startup warnings are aggregated

- **WHEN** startup produces multiple warnings from preset loading, hotkey
  registration, policy loading, restore, or default activation
- **THEN** the package SHALL present one startup warning containing the
  individual warning messages where possible
- **AND** the package SHALL preserve each warning's meaning

#### Scenario: No notification when the default is preempted

- **WHEN** a flag or a successful restore preempts the policy default
- **THEN** no default-applied success outcome SHALL be emitted

#### Scenario: Apply refusal on the default is non-fatal

- **WHEN** the resolved default's apply flow returns a refusal
- **THEN** a warning SHALL be added to the startup warning collection
- **AND** no preset SHALL be attached
- **AND** the session SHALL continue on the Pi baseline

### Requirement: Read-only policy inspection uses a command-output surface

The `/presets` command SHALL accept a read-only `policy` subcommand that reports
the effective policy outcome for the current working directory. The view SHALL
help users identify which usable presets policy allows, which usable presets
policy prohibits, and which preset policy selects as the default for a fresh
session.

The report content and existing policy fields SHALL remain unchanged. In TUI
mode, a prompt-invoked `/presets policy` SHALL appear as a durable TUI-only
command report that does not enter LLM context. The picker SHALL show the same
report text in the shared info-dialog overlay. In RPC mode, the package SHALL
deliver the report through the RPC-compatible notification path. JSON and print
modes are out of scope.

The view SHALL remain read-only and SHALL never write `policy.json`. Warnings
found while loading policy or presets SHALL be included in the command report
where possible instead of appearing as a separate notification immediately
before it.

#### Scenario: Policy view from the prompt

- **WHEN** the user runs `/presets policy` from the prompt in TUI mode
- **THEN** a durable command report SHALL appear in the conversation
- **AND** the report SHALL not enter LLM context

#### Scenario: Policy view from the picker

- **WHEN** the user requests policy from inside the picker
- **THEN** the policy report SHALL appear in an info dialog above the picker
- **AND** dismissing the dialog SHALL return the user to the picker
- **AND** the report text SHALL match the prompt-invoked report

#### Scenario: Policy view in RPC mode

- **WHEN** the user invokes `/presets policy` in RPC mode
- **THEN** the report SHALL be delivered through the RPC notification protocol
- **AND** the report SHALL not be sent to the LLM as a custom message

#### Scenario: Policy view with matching rules

- **WHEN** the effective policy contains matching rules
- **THEN** the report SHALL retain its title, directory, allowed presets,
  prohibited presets, default preset, and override footnote rules
- **AND** it SHALL continue to hide policy-engine details

#### Scenario: Policy view with no matching rules

- **WHEN** the user runs `/presets policy` in a cwd matched by no rules
- **THEN** the command report SHALL be the sentence
  `No preset policy applies to <cwd>.` with `<cwd>` replaced by the current
  working directory

#### Scenario: Policy view never writes

- **WHEN** the user runs `/presets policy`
- **THEN** `policy.json` SHALL not be modified
