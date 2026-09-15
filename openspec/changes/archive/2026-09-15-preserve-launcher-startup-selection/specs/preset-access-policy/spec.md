## MODIFIED Requirements

### Requirement: Policy default auto-activates only on a fresh session

After explicit startup preset activation and session restore, the package SHALL
automatically activate the resolved policy default only when all of the
following hold:

- The `--preset` flag did not successfully activate a preset for this
  invocation.
- Session restore did not attach an existing active preset. A missing or
  unavailable prior preset SHALL count as nothing attached.
- The session uses interactive TUI mode. Print and RPC sessions SHALL NOT
  receive automatic directory defaults.
- The startup provider, model, and thinking level match the resolved file-backed
  defaults defined by the startup comparison requirement.

The resulting precedence SHALL be successful `--preset` activation, successful
preset restoration, eligible policy default, then Pi baseline. An explicit flag
or restored attachment SHALL retain its existing behavior in every mode. An
unsuccessful or cancelled flag request SHALL continue to the remaining checks.

When eligibility fails, the automatic-default step SHALL preserve model,
thinking, active tools, and preset attachment. It SHALL NOT append an
active-preset entry, add preset instructions, emit an activation outcome, or
report why eligibility failed. Independent preset-loading, restore, and policy
warnings SHALL retain their existing behavior.

This rule SHALL use the same attachment-based lifecycle handling for startup,
reload, new, resume, and fork. A cleared or unattached session SHALL remain
eligible when the other conditions hold. The package SHALL NOT infer freshness
solely from the lifecycle event reason.

When eligible, the package SHALL select only permitted, available default
candidates through the existing policy rules. When it activates the default, it
SHALL capture a fresh baseline, produce one visible success outcome naming the
preset, and refresh the footer indicator. It SHALL combine apply accompaniments
into that outcome and SHALL NOT emit a second success notification for the same
activation.

If the default apply operation returns a refusal, the package SHALL report its
reason as a warning, leave the Pi baseline in place, attach no preset, and
continue the session. The package SHALL combine startup warnings into one
startup warning where possible.

#### Scenario: Fresh session applies the default

- **WHEN** an interactive session starts with no successfully applied flag or
  restored preset, all startup values match resolved defaults, and policy
  resolves a permitted available preset
- **THEN** the package SHALL apply that preset through the standard apply flow
- **AND** it SHALL emit exactly one combined success outcome with any apply
  accompaniments

#### Scenario: Flag overrides policy default

- **WHEN** `--preset other` successfully activates `other` and a directory
  default also resolves
- **THEN** the package SHALL keep `other` and SHALL NOT apply the directory
  default in any session mode
- **AND** it SHALL NOT emit a policy-default success outcome

#### Scenario: Restored session is not a fresh session

- **WHEN** a session restores a still-loadable, available active preset
- **THEN** the package SHALL keep that attachment and SHALL NOT apply a policy
  default
- **AND** restore SHALL emit no activation success outcome

#### Scenario: Failed restore falls through to policy default

- **WHEN** an interactive session cannot restore its prior preset, all startup
  values match resolved defaults, and policy resolves a permitted available
  preset
- **THEN** restore SHALL attach nothing and contribute its existing warning to
  the startup warning collection
- **AND** the package SHALL apply the policy default and emit one combined
  success outcome

#### Scenario: Failed flag continues through eligibility checks

- **WHEN** an explicit flag request fails or is cancelled and no preset
  attachment restores
- **THEN** the package SHALL evaluate mode and startup comparison before
  attempting the policy default

#### Scenario: Print session preserves launcher selection

- **WHEN** a print session starts without a successfully applied preset flag or
  restored preset, regardless of whether startup values match configured
  defaults
- **THEN** the automatic-default step SHALL leave the model, thinking, and tools
  unchanged
- **AND** it SHALL attach no preset, append no active-preset entry, add no
  preset instructions, and emit no eligibility or activation notification

#### Scenario: RPC session does not apply an automatic default

- **WHEN** an RPC session starts with a configured directory default
- **THEN** the package SHALL skip automatic activation even when dialog-capable
  UI is available
- **AND** it SHALL retain the existing explicit preset and restore paths

#### Scenario: No notification when the default is preempted

- **WHEN** a flag, successful restore, non-interactive mode, or unsuccessful
  startup comparison preempts automatic activation
- **THEN** the automatic-default step SHALL emit no success or skip notification

#### Scenario: Existing lifecycle handling remains attachment based

- **WHEN** an interactive startup, reload, new, resume, or fork has no
  successfully applied flag or restored attachment and all startup values match
  resolved defaults
- **THEN** the package SHALL apply a permitted available directory default if
  one resolves
- **AND** a most recent cleared-preset entry SHALL NOT independently prevent
  that activation

#### Scenario: Ineligible startup does not attempt default resolution

- **WHEN** mode or startup comparison makes automatic activation ineligible and
  a configured directory default would be unresolvable
- **THEN** the automatic-default step SHALL skip resolution and SHALL NOT emit
  an unresolvable-default warning
- **AND** independent configuration and policy validation warnings SHALL remain
  unchanged

#### Scenario: Eligible startup has no configured default

- **WHEN** startup is eligible but no matching rule specifies a directory
  default
- **THEN** the package SHALL keep Pi's baseline without an activation
  notification

#### Scenario: Eligible startup has no permitted available default

- **WHEN** startup is eligible but the winning default matches no permitted
  available preset
- **THEN** the package SHALL keep Pi's baseline and report the existing
  unresolvable-default warning
- **AND** it SHALL NOT activate a prohibited candidate

#### Scenario: Apply refusal on the default is non-fatal

- **WHEN** an eligible default's apply operation returns a refusal
- **THEN** the package SHALL add its reason to the startup warning collection
- **AND** it SHALL attach no preset and continue on Pi's baseline

#### Scenario: Startup warnings are aggregated

- **WHEN** startup produces multiple warnings from preset loading, hotkey
  registration, policy loading, restore, or an attempted default activation
- **THEN** the package SHALL present one startup warning containing the
  individual messages where possible
- **AND** it SHALL preserve each warning's meaning without adding
  settings-comparison diagnostics

## ADDED Requirements

### Requirement: Automatic startup compares against resolved file-backed defaults

For otherwise eligible interactive startup, the package SHALL compare the
provider, model identity, and thinking level captured before its own preset
processing with defaults read from Pi's global settings and trusted project
overrides for the current directory. Project values SHALL override global values
according to Pi's settings merge behavior. Untrusted project settings SHALL NOT
contribute comparison values.

The comparison SHALL require exact provider and model identity equality and
equality with the default thinking level after Pi-compatible normalization for
that model's capabilities. The package SHALL use Pi's startup thinking fallback
when no thinking value is configured and that fallback can be established
reliably. Tools and instructions SHALL NOT participate in this comparison.

If settings loading fails, a required provider or model value is absent or
invalid, the configured model cannot be resolved, the startup model is absent,
or thinking cannot be resolved reliably, the package SHALL silently skip
automatic activation. A settings read that reports an error SHALL NOT authorize
activation using a partial result. The package SHALL NOT select a replacement
model to make the comparison succeed and SHALL NOT modify settings during
comparison.

The package SHALL read comparison settings anew for each eligible startup
evaluation. It SHALL NOT reuse on-disk state cached across sessions or reloads.

This contract SHALL compare values without claiming to identify explicit
selection intent. An explicit interactive choice equal to resolved defaults
SHALL remain eligible, including when the directory preset changes only
thinking, tools, or instructions. SDK-only in-memory settings and overrides
SHALL NOT replace the file-backed comparison source.

#### Scenario: Provider differs

- **WHEN** the startup provider differs from the resolved default provider, even
  if model identifiers and thinking match
- **THEN** the package SHALL silently skip automatic activation

#### Scenario: Model differs

- **WHEN** the startup model identifier differs from the configured model under
  the same provider
- **THEN** the package SHALL silently skip automatic activation

#### Scenario: Thinking differs

- **WHEN** startup provider and model match but thinking differs from the
  normalized default thinking level
- **THEN** the package SHALL silently skip automatic activation

#### Scenario: All values match

- **WHEN** startup provider, model, and thinking match resolved defaults
- **THEN** the comparison SHALL permit the automatic-default step to resolve and
  apply a permitted available preset

#### Scenario: Explicit choice equals defaults

- **WHEN** an interactive CLI or SDK caller explicitly selects values equal to
  resolved file-backed defaults
- **THEN** the comparison SHALL permit automatic activation even when that
  preset replaces the explicit selection
- **AND** model equality with the preset itself SHALL NOT exempt the preset's
  thinking, tools, or instructions from application

#### Scenario: Trusted project overrides global defaults

- **WHEN** trusted project settings override one or more global comparison
  values
- **THEN** the package SHALL compare startup values against the merged defaults

#### Scenario: Untrusted project settings are ignored

- **WHEN** the project is untrusted and its settings differ from global settings
- **THEN** the package SHALL use only global defaults for comparison

#### Scenario: Thinking normalization matches Pi

- **WHEN** Pi adjusts configured thinking to a level supported by the configured
  model
- **THEN** the package SHALL compare startup thinking against that same adjusted
  level
- **AND** this normalization SHALL not write a thinking level or emit a
  notification

#### Scenario: Thinking setting is absent

- **WHEN** provider and model resolve but no default thinking level is
  configured
- **THEN** the package SHALL use Pi's startup thinking fallback and model
  normalization if both can be determined reliably
- **AND** otherwise it SHALL silently skip automatic activation

#### Scenario: Unreliable settings comparison is silent

- **WHEN** settings cannot be read, settings report an error, required values
  are missing or invalid, or a model or thinking value cannot be resolved
  reliably
- **THEN** the package SHALL preserve startup state without attempting automatic
  activation
- **AND** it SHALL emit no settings warning or skip notification

#### Scenario: Settings edits are read again

- **WHEN** file-backed defaults change before another startup evaluation,
  including reload
- **THEN** the package SHALL compare against the newly loaded defaults

#### Scenario: SDK in-memory settings are outside comparison scope

- **WHEN** an interactive SDK host supplies settings that exist only in memory
- **THEN** the package SHALL still use file-backed defaults for comparison
- **AND** matching file-backed values SHALL remain eligible while differing
  values SHALL skip automatic activation
