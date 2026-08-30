## ADDED Requirements

### Requirement: New activations route through the permission gate

The package SHALL route every NEW activation through the permission gate defined
by the `preset-access-policy` capability before invoking the apply flow. New
activations are: the `--preset` flag, manual `/presets <name>` selection, picker
activation, and per-preset hotkey activation.

When the gate reports that the target preset is not permitted for the current
cwd, the package SHALL present the warning overlay and SHALL invoke the apply
flow only on explicit override; on cancel the package SHALL NOT change model,
thinking, or tools and SHALL NOT attach the preset. When the target is
permitted, activation SHALL proceed exactly as before this change.

Session restore SHALL bypass the gate: re-attaching a previously-active preset
on `session_start` SHALL NOT consult the gate and SHALL behave exactly as
specified by the existing restore requirement.

#### Scenario: Permitted activation is unchanged

- **WHEN** an activation targets a permitted preset
- **THEN** the gate SHALL pass through and the apply flow SHALL run exactly as specified before this change

#### Scenario: Non-permitted activation gated before apply

- **WHEN** an activation targets a non-permitted preset
- **THEN** the warning overlay SHALL be shown and the apply flow SHALL run only on explicit override

#### Scenario: Cancel leaves state untouched

- **WHEN** an activation targets a non-permitted preset and the user cancels
- **THEN** no model, thinking, or tools change SHALL occur and no preset SHALL be attached

#### Scenario: Restore bypasses the gate

- **WHEN** a session is resumed re-attaching a preset that would be non-permitted
- **THEN** the gate SHALL NOT be consulted and restore SHALL re-attach the preset per the existing restore requirement

### Requirement: Session-start consults the policy default

The package SHALL extend the `session_start` activation sequence with a
policy-default step that runs after the `--preset` flag step and the
session-restore step. This step SHALL auto-activate the resolved policy default
(see the `preset-access-policy` capability) only on a fresh session — that is,
only when the flag did not activate a preset and restore did not attach an
existing active preset (including a failed restore, which attaches nothing). The
step SHALL NOT alter the behavior of the flag step, the restore step, or the
apply/clear engine; it only adds a new, lower-precedence entry point into the
existing apply flow.

The activation precedence at `session_start` SHALL therefore be, highest to
lowest: `--preset` flag, session restore (when the named preset still loads),
policy default, Pi baseline.

#### Scenario: Policy default step runs after flag and restore

- **WHEN** a fresh session starts with no flag and nothing to restore, and a policy default resolves
- **THEN** the policy-default step SHALL apply that preset through the standard apply flow

#### Scenario: Policy default step is skipped when a higher-precedence step wins

- **WHEN** either the `--preset` flag activates a preset or session restore re-attaches a still-loadable preset
- **THEN** the policy-default step SHALL be a no-op

#### Scenario: Existing apply, clear, and restore behavior is unchanged

- **WHEN** a preset is applied, cleared, or restored through any existing path
- **THEN** the baseline-overlay, user-override, instruction-injection, audit-trail, and footer behaviors SHALL behave exactly as specified before this change
