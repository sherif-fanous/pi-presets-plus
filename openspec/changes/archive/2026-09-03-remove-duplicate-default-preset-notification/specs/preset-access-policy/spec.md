## MODIFIED Requirements

### Requirement: Policy default auto-activates only on a fresh session

The package SHALL, on `session_start`, after the `--preset` flag step and the
session-restore step have run, auto-activate the resolved policy default only
when BOTH of the following hold:

- the `--preset` flag did not activate a preset for this invocation, AND
- session restore did not attach an existing active preset — including the case
  where the most recent `presets-plus:active` entry named a preset that no
  longer loads (a failed restore is treated as "nothing attached").

The resulting precedence SHALL be:
`--preset flag > session restore (if the named preset still exists) > policy default > baseline`.

When the policy default is auto-activated, the package SHALL apply it through the
existing apply flow, capturing a fresh baseline, emitting the single visible
activation message, and refreshing the footer indicator. It SHALL NOT emit a
second success notification via `ctx.ui.notify` for the same activation.

If the apply flow returns a refusal for the default (e.g. the model's key was
revoked between load and apply), the package SHALL surface the refusal reason as
a warning, leave the Pi baseline in place, attach no preset, and continue the
session.

#### Scenario: Fresh session applies the default

- **WHEN** a fresh session starts, no `--preset` flag is passed, no prior active preset is restored, and a policy default resolves to a permitted available preset
- **THEN** the default SHALL be applied via the standard apply flow
- **AND** exactly one visible success message naming the applied preset SHALL be emitted
- **AND** no additional success notification naming the same preset SHALL be emitted via `ctx.ui.notify`

#### Scenario: Flag overrides policy default

- **WHEN** a session starts with `--preset other` passed and a policy default also resolves
- **THEN** `other` SHALL be activated by the flag and the policy default SHALL NOT be applied

#### Scenario: Restored session is not a fresh session

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry names a still-loadable preset
- **THEN** that preset SHALL be re-attached by restore and the policy default SHALL NOT be applied

#### Scenario: Failed restore falls through to policy default

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry names a preset that no longer loads, and a policy default resolves to a permitted available preset
- **THEN** restore SHALL attach nothing (and warn per the restore requirement) and the policy default SHALL then be applied
- **AND** the successful default activation SHALL emit only its single visible success message

#### Scenario: No notification when the default is preempted

- **WHEN** a flag or a successful restore preempts the policy default
- **THEN** no default-applied notification SHALL be emitted

#### Scenario: Apply refusal on the default is non-fatal

- **WHEN** the resolved default's apply flow returns a refusal
- **THEN** a warning SHALL be surfaced, no preset SHALL be attached, and the session SHALL continue on the Pi baseline
