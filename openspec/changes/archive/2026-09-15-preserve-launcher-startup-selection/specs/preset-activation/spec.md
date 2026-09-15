## MODIFIED Requirements

### Requirement: Session-start consults the policy default

The package SHALL capture startup provider, model, and thinking values before
its own preset processing changes them. It SHALL run the policy-default step
after session restore and the `--preset` flag step. That step SHALL apply a
resolved directory default only when no flag successfully applied, no active
preset attachment restored, and the mode and startup comparison requirements in
`preset-access-policy` permit automatic activation.

The activation precedence SHALL be successful `--preset` activation, successful
preset restoration, eligible policy default, then Pi baseline. The startup
eligibility checks SHALL apply only to the automatic-default step. They SHALL
NOT prevent an explicit preset request from using its existing permission checks
and apply path, or prevent restoration from attaching a prior preset without
reapplying its values.

When automatic activation is skipped, the package SHALL skip the entire preset
operation. It SHALL NOT change model, thinking, or tools, record a new
active-preset entry, or introduce the default preset's instructions. Existing
restored-preset instructions SHALL retain their normal behavior.

The package SHALL preserve the existing apply, clear, permission, restore,
footer, and notification contracts. It SHALL continue other startup work after
an automatic-default skip. Lifecycle reason alone SHALL NOT change default
eligibility; startup, reload, new, resume, and fork SHALL use the same
attachment, mode, and comparison rules.

#### Scenario: Policy default step runs after flag and restore

- **WHEN** an interactive session starts with no successfully applied flag or
  restored attachment, startup values match resolved defaults, and a permitted
  available policy default resolves
- **THEN** the policy-default step SHALL apply that preset through the standard
  apply flow

#### Scenario: Policy default step is skipped when a higher-precedence step wins

- **WHEN** either `--preset` successfully activates a preset or session restore
  attaches a still-loadable available preset
- **THEN** the policy-default step SHALL be a no-op regardless of mode or
  settings comparison

#### Scenario: Existing apply, clear, and restore behavior is unchanged

- **WHEN** a preset is explicitly applied, cleared, or restored through an
  existing path
- **THEN** the package SHALL retain the baseline-overlay, user-override,
  permission, instruction, activation outcome, and footer behaviors for that
  path

#### Scenario: Explicit preset can override startup selection

- **WHEN** a caller supplies a permitted available `--preset` and a model
  selection that differs from configured defaults
- **THEN** the explicit preset SHALL still apply through the existing flag path
- **AND** the automatic-default comparison SHALL NOT block or replace that
  activation

#### Scenario: Restore keeps the launcher's current model

- **WHEN** a prior preset attachment restores and Pi starts with a different
  launcher-selected model
- **THEN** restoration SHALL attach the prior preset without writing model,
  thinking, or tools
- **AND** the automatic directory default SHALL NOT apply
- **AND** the restored preset's instructions SHALL retain their existing
  behavior

#### Scenario: Comparison uses captured startup values

- **WHEN** the startup sequence evaluates automatic-default eligibility
- **THEN** it SHALL compare values captured before its own preset processing
- **AND** it SHALL NOT substitute values from a preset applied during startup

#### Scenario: SDK child retains its requested configuration

- **WHEN** a child session starts in print mode with a requested provider,
  model, thinking, and tool set, and no explicit preset or restored attachment
  applies
- **THEN** automatic activation SHALL leave that configuration unchanged
- **AND** the next agent turn SHALL receive no directory-default preset
  instructions
- **AND** the session SHALL contain no new automatic active-preset entry

#### Scenario: RPC remains ineligible when UI is available

- **WHEN** an RPC context supports dialogs but no explicit preset or restored
  attachment applies
- **THEN** the automatic-default step SHALL skip activation based on the session
  mode

#### Scenario: Skip leaves other startup behavior intact

- **WHEN** automatic activation skips because of session mode, differing startup
  values, or unresolved settings
- **THEN** the package SHALL continue command completion setup, hotkey binding,
  and normal status handling
- **AND** it SHALL retain unrelated startup warnings while emitting no
  settings-comparison warning

#### Scenario: Interactive subagent uses interactive comparison

- **WHEN** a child session uses interactive TUI mode
- **THEN** the package SHALL use the same file-backed startup comparison as any
  other interactive session
- **AND** it SHALL NOT depend on launcher identity, process arguments, or
  another extension supplying a signal
