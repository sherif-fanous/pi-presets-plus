## MODIFIED Requirements

### Requirement: Clear emits a per-field result notification

The package SHALL emit exactly one user-visible report on every successful invocation of clear (including the no-active-preset path), describing the outcome for each of model, thinking, and tools. The report SHALL distinguish at least the following per-field outcomes:

- restored to baseline
- already at baseline (MAY be collapsed with "restored" in user-facing text)
- left unchanged because the field changed after activation (user override)
- left unchanged because the overlay did not own the field (tools only)
- left unchanged because no restore baseline was available (priorUnknown branch)
- could not restore (e.g. model write failed)
- tools restored with some baseline names dropped because they are no longer available

The report SHALL name the preset that was cleared.

The delivery surface SHALL depend on the call site:

- When clear is invoked from `/presets clear` typed at the prompt, the package SHALL deliver the report via `ctx.ui.notify` with severity `info`.
- When clear is invoked from inside the `/presets` picker (the `c` action), the package SHALL deliver the report via the shared info-dialog overlay so the report is readable without dismissing the picker; the dialog SHALL block until the user dismisses it with `Enter` or `Esc`.

The textual content of the report SHALL be identical across both delivery surfaces (the same formatter feeds both); only the rendering chrome differs.

#### Scenario: Full restore from prompt

- **WHEN** the user runs `/presets clear` from the prompt and clear restores every field to baseline
- **THEN** the report SHALL be delivered via `ctx.ui.notify` and SHALL name the cleared preset and indicate that model, thinking, and tools were restored

#### Scenario: Full restore from picker

- **WHEN** the user triggers `c` from inside the picker, confirms, and clear restores every field to baseline
- **THEN** the report SHALL be delivered via the info-dialog overlay above the picker
- **AND** the textual content SHALL match what the prompt-invoked path would have produced

#### Scenario: User override respected in report

- **WHEN** clear leaves a field unchanged because current value differs from both baseline and `lastApplied`
- **THEN** the report SHALL explicitly state that that field was left unchanged because it changed after activation, regardless of delivery surface

#### Scenario: priorUnknown report

- **WHEN** clear runs the soft-clear branch for a `priorUnknown` attachment
- **THEN** the report SHALL state that model, thinking, and tools were unchanged because no restore baseline was available, regardless of delivery surface

#### Scenario: Nothing-to-clear report

- **WHEN** clear is invoked with no active preset
- **THEN** the report SHALL state that there is no active preset to clear, regardless of delivery surface

### Requirement: /presets <name>, /presets clear, /presets status subcommands

The `/presets` command SHALL accept three subcommands:

- `<name>` — activate the named preset (any token that is not a known subcommand is interpreted as a preset name).
- `clear` — clear the active preset per the baseline-overlay restore rules with user-override protection. The result SHALL be delivered via `ctx.ui.notify` (prompt invocation surface).
- `status` — print a textual summary of active state including baseline, `lastApplied`, current Pi values, per-field ownership classification (extension-owned / user override / already at baseline), `applyCount`, and the attachment kind (`baseline` vs. `priorUnknown`). The summary SHALL be delivered via `ctx.ui.notify` (prompt invocation surface).

The picker provides additional in-overlay paths to `clear` and `status` whose textual content is identical but whose delivery surface is the shared info-dialog overlay (see the picker capability for those scenarios).

#### Scenario: Activate by name

- **WHEN** the user runs `/presets plan` and `plan` exists and is available
- **THEN** the preset SHALL be applied per the apply requirement

#### Scenario: Activate unknown name

- **WHEN** the user runs `/presets does-not-exist`
- **THEN** an error SHALL be reported listing available preset names and no state change SHALL occur

#### Scenario: Clear from prompt

- **WHEN** the user runs `/presets clear`
- **THEN** the clear flow SHALL run per the clear requirement
- **AND** the result SHALL be delivered via `ctx.ui.notify`

#### Scenario: Status with no active preset

- **WHEN** the user runs `/presets status` and no preset is active
- **THEN** an info message SHALL state that no preset is active, delivered via `ctx.ui.notify`

#### Scenario: Status with baseline-managed attachment from prompt

- **WHEN** the user runs `/presets status` from the prompt and a preset is active with `restore.kind === "baseline"`
- **THEN** the output SHALL be delivered via `ctx.ui.notify`
- **AND** the output SHALL show the active name and scope, the attachment kind with `applyCount`, the baseline values, `lastApplied` values, and current Pi values for model, thinking, and tools
- **AND** each field SHALL be classified as extension-owned, user-overridden, already at baseline, or (tools only) not owned by the overlay

#### Scenario: Status with priorUnknown attachment from prompt

- **WHEN** the user runs `/presets status` from the prompt and a preset is active with `restore.kind === "unknown"`
- **THEN** the output SHALL be delivered via `ctx.ui.notify`
- **AND** the output SHALL indicate `priorUnknown (no restore baseline — clear will only un-attach)`
- **AND** SHALL show current Pi values for model, thinking, and tools
