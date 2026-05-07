## MODIFIED Requirements

### Requirement: Activate from picker

When the user presses `Enter` on a selected preset, the picker SHALL invoke the existing apply flow for that preset.

On `apply()` returning `{ ok: true }`, the picker SHALL close.

On `apply()` returning `{ ok: false, reason }`, the picker SHALL stay open and SHALL render the `reason` in a shared info-dialog overlay (tone = `"error"`, title = `"Activation failed"`). The picker SHALL hide itself behind the dialog while the dialog is open and SHALL restore focus to the same selected row when the user dismisses the dialog with `Enter` or `Esc`. The picker SHALL NOT close as a side effect of the failure.

The picker SHALL NOT call `ctx.ui.notify` to surface activation refusals — the info-dialog is the sole surface for picker-driven activation refusals.

Exact-name command activation (for example `/presets plan`) SHALL NOT be part of the command surface; picker selection is the activation path.

#### Scenario: Activate available preset

- **WHEN** the user selects an available preset and presses `Enter`
- **AND** `apply()` returns `{ ok: true }`
- **THEN** the picker SHALL close and the preset activation flow SHALL run

#### Scenario: Activate unavailable preset shows error dialog

- **WHEN** the user selects a preset marked `unavailable: "no-key"` and presses `Enter`
- **AND** `apply()` returns `{ ok: false, reason: <text>, kind: "no-key" }`
- **THEN** the picker SHALL remain open
- **AND** an info-dialog overlay SHALL appear with tone `error`, title `"Activation failed"`, and body equal to `reason`
- **AND** `ctx.ui.notify` SHALL NOT be called for the refusal
- **AND** dismissing the dialog with `Enter` or `Esc` SHALL return focus to the picker without closing it

#### Scenario: Activation failure for unknown model shows error dialog

- **WHEN** the user activates a preset whose `provider`/`model` does not resolve and `apply()` returns `{ ok: false, kind: "unknown-model" }`
- **THEN** the picker SHALL remain open and an error info-dialog SHALL render the reason

#### Scenario: Activation failure for revoked key shows error dialog

- **WHEN** activation reaches `setModel` which returns false (key revoked between load and apply) and `apply()` returns `{ ok: false, kind: "key-revoked" }`
- **THEN** the picker SHALL remain open and an error info-dialog SHALL render the reason

#### Scenario: Cancel without activating

- **WHEN** list focus is active and the user presses `Esc`
- **THEN** the picker SHALL close and no state change SHALL occur
