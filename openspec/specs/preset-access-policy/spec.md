# preset-access-policy Specification

## Purpose

The `preset-access-policy` capability helps users avoid activating the wrong
preset in a directory and applies a configured, permitted default in fresh
sessions. Users can override a warning when they intentionally need a preset
that the policy does not permit.

## Requirements

### Requirement: Policy file validation and visible fail-open

The package SHALL validate `policy.rules` from the user version 2 configuration
at load time. A missing `policy` section SHALL be treated as no policy. A
`policy` value that is not an object or whose `rules` value is not an array
SHALL emit a warning and apply no policy rules.

For each rule, the package SHALL compile the `match` regex and every matcher
`pattern` regex in `allow`, `prohibit`, and `default`. A regex that fails to
compile SHALL cause that individual rule, for a bad `match`, or that individual
matcher, for a bad matcher `pattern`, to be skipped. The package SHALL emit a
warning naming the offending pattern. Skipping SHALL fail open, so a malformed
rule or matcher SHALL NOT block activation. Any policy warning SHALL make the
containing user configuration unsafe for a preset mutation until the warning is
corrected.

#### Scenario: Unsupported version

- **WHEN** the user configuration declares a version other than `2`
- **THEN** no policy rules SHALL apply
- **AND** a warning SHALL be surfaced

#### Scenario: Malformed JSON

- **WHEN** the user configuration cannot be parsed as JSON
- **THEN** no policy rules SHALL apply
- **AND** a warning SHALL be surfaced

#### Scenario: Invalid policy container

- **WHEN** `policy` is not an object or `policy.rules` is not an array
- **THEN** no policy rules SHALL apply
- **AND** a warning SHALL be surfaced

#### Scenario: Invalid match regex skips the rule

- **WHEN** a rule's `match` regex fails to compile
- **THEN** that rule SHALL be skipped
- **AND** a warning naming the bad pattern SHALL be surfaced
- **AND** other valid rules SHALL still apply

#### Scenario: Invalid matcher pattern skips the matcher

- **WHEN** one matcher pattern in a rule's `allow`, `prohibit`, or `default`
  fails to compile
- **THEN** that matcher SHALL be skipped
- **AND** a warning naming the bad pattern SHALL be surfaced
- **AND** the rule's other valid matchers SHALL still apply

#### Scenario: Invalid policy blocks preset editing

- **WHEN** policy validation emits a warning and a preset mutation targets the
  user scope
- **THEN** the mutation SHALL fail without rewriting the configuration file

### Requirement: Matchers use raw unanchored regex over the selected field

A matcher SHALL match a candidate preset when its `pattern` regex matches the
value of the selected `field`: `name` tests the preset name, `provider` tests
the provider id, and `model` tests the combined `provider/model` identity
string. All regexes SHALL use raw, unanchored `RegExp.test` semantics — a
pattern matches if it is found anywhere in the target string. Authors anchor
with `^…$` themselves when they need a full-string match. The package SHALL NOT
implicitly anchor patterns.

#### Scenario: Unanchored substring match

- **WHEN** a matcher `pattern` is `apple` and the candidate preset name is
  `apple-claude-opus-4-8`
- **THEN** the matcher SHALL match (substring semantics, no implicit anchoring)

#### Scenario: Author-anchored match

- **WHEN** a matcher `pattern` is `^ifanous-` and the candidate preset name is
  `apple-ifanous-test`
- **THEN** the matcher SHALL NOT match because the anchored pattern requires the
  prefix

#### Scenario: Provider-field matcher

- **WHEN** a matcher has `field: "provider"`, `pattern: "apple-genai"`, and the
  candidate preset's provider is `apple-genai-anthropic`
- **THEN** the matcher SHALL match on the provider value regardless of the
  preset name

#### Scenario: Model-field matcher spans a whole provider

- **WHEN** a matcher has `field: "model"`, `pattern: "^anthropic/"`, and the
  candidate preset resolves to provider `anthropic` and model `claude-opus-4-8`
- **THEN** the matcher SHALL match the combined identity
  `anthropic/claude-opus-4-8`, and SHALL likewise match any future model under
  the same provider

### Requirement: Permission is the union of matching rules

For a given working directory, the package SHALL compute the set of rules whose
`match` regex matches the cwd, and SHALL union their matchers: the effective
allow set is the union of those rules' `allow` matchers and the effective
prohibit set is the union of their `prohibit` matchers. A candidate preset SHALL
be considered _permitted_ when BOTH hold:

- the effective allow set is empty, OR the candidate matches at least one allow
  matcher; AND
- the candidate matches no prohibit matcher.

When the effective allow set is non-empty, presets matching no allow matcher
SHALL NOT be permitted (an allow set acts as a whitelist). A prohibit match
SHALL override an allow match for the same candidate (prohibit wins).

#### Scenario: No rules match the cwd

- **WHEN** no rule's `match` matches the current cwd
- **THEN** every preset SHALL be permitted

#### Scenario: Prohibit blocks a candidate

- **WHEN** a matching rule prohibits `^ifanous-` and the candidate name is
  `ifanous-anthropic-claude-opus-4-8`
- **THEN** the candidate SHALL NOT be permitted

#### Scenario: Allow acts as a whitelist

- **WHEN** a matching rule allows `^apple-` and no other rule matches, and the
  candidate name is `ifanous-codex-gpt-5.5`
- **THEN** the candidate SHALL NOT be permitted because it matches no allow
  matcher

#### Scenario: Allow admits a matching candidate

- **WHEN** a matching rule allows `^apple-` and the candidate name is
  `apple-claude-opus-4-8` and no prohibit matcher matches it
- **THEN** the candidate SHALL be permitted

#### Scenario: Prohibit wins over allow

- **WHEN** one matching rule allows `^apple-` and another matching rule
  prohibits `sonnet`, and the candidate is `apple-claude-sonnet-4.6`
- **THEN** the candidate SHALL NOT be permitted

#### Scenario: Union across multiple matching rules

- **WHEN** two rules match the cwd, one prohibiting `^apple-` and one
  prohibiting `^virtasant-`
- **THEN** both prohibitions SHALL apply and a candidate matching either SHALL
  NOT be permitted

### Requirement: Non-permitted activation requires an explicit override

When a NEW activation targets a preset that is not permitted for the current
cwd, the package SHALL present a warning overlay before applying. The overlay
SHALL name the preset, summarize why it is discouraged here, and offer two
outcomes: override (proceed with activation) and cancel (abort activation).
Activation SHALL proceed only on an explicit override; on cancel the package
SHALL NOT change model, thinking, or tools and SHALL NOT attach the preset. The
overlay SHALL reuse the extension's existing custom-overlay confirmation
pattern.

The gate SHALL apply to all NEW activations: the `--preset` flag, manual
`/presets <name>` selection, picker activation, and per-preset hotkey
activation. Session restore SHALL be exempt from the gate, because consent was
already given when the preset was first applied in that session; re-warning on
every resume would be noise. The policy default (see below) does not require the
gate because it is drawn only from the permitted set.

#### Scenario: Override proceeds with activation

- **WHEN** a new activation targets a non-permitted preset and the user chooses
  override
- **THEN** the preset SHALL be applied through the standard apply flow

#### Scenario: Cancel aborts activation

- **WHEN** a new activation targets a non-permitted preset and the user chooses
  cancel
- **THEN** no model, thinking, or tools change SHALL occur and no preset SHALL
  be attached

#### Scenario: Flag activation is gated

- **WHEN** `--preset` names a non-permitted preset for the current cwd
- **THEN** the warning overlay SHALL be shown before the flag preset is applied

#### Scenario: Hotkey activation is gated

- **WHEN** a per-preset hotkey activates a non-permitted preset
- **THEN** the warning overlay SHALL be shown before the preset is applied

#### Scenario: Session restore is exempt

- **WHEN** a session is resumed re-attaching a preset that would be
  non-permitted
- **THEN** NO warning overlay SHALL be shown and restore SHALL re-attach the
  preset as specified by the activation capability

### Requirement: Policy default selection

The package SHALL resolve a policy default for a fresh session as follows. Among
the rules whose `match` matches the cwd and that specify a `default` matcher,
the package SHALL select the rule whose `match` consumes the longest substring
of the cwd. File order SHALL break ties. The winning rule's `default` matcher
SHALL select candidates from the merged user and project preset list restricted
to permitted presets, and the package SHALL choose the first candidate in merged
configuration order. Ordering is positional within each scope's `presets` array.

If no rule specifies a default, or the winning rule's default matcher yields no
permitted and available candidate, the package SHALL resolve no default and
leave Pi on its baseline. A configured but unresolvable default SHALL emit a
warning. Because default selection considers only permitted presets, an
automatically applied default SHALL NOT trigger the permission overlay.

#### Scenario: Longest-path rule wins the default

- **WHEN** rule A `match: "^/work/"` sets default `^apple-` and rule B
  `match: "^/work/apple/"` sets default `^apple-claude-opus-`, and the cwd is
  `/work/apple/project`
- **THEN** rule B SHALL win because its match consumes a longer substring of the
  cwd

#### Scenario: File order breaks a span tie

- **WHEN** two matching rules specify a default and their match regexes consume
  equal-length substrings of the cwd
- **THEN** the earlier rule in `policy.rules` SHALL win

#### Scenario: Default is chosen by merged file order

- **WHEN** the winning default matches multiple permitted presets
- **THEN** the package SHALL choose the first match in merged user and project
  preset order

#### Scenario: Default excludes non-permitted candidates

- **WHEN** the winning default matches a preset that another matching rule
  prohibits
- **THEN** that candidate SHALL be excluded and the next permitted candidate in
  merged order SHALL be chosen if one exists

#### Scenario: No default configured

- **WHEN** no matching rule specifies a default
- **THEN** no policy default SHALL be resolved
- **AND** the session SHALL continue on the Pi baseline

#### Scenario: Default resolves to nothing available

- **WHEN** the winning default matches no permitted and available preset
- **THEN** no automatic activation SHALL occur
- **AND** the session SHALL continue on the Pi baseline
- **AND** a warning SHALL be surfaced

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
- Aligned muted row labels, matching the visual treatment of `/presets status`.

When the report contains one or more prohibited presets, it SHALL append a blank
line followed by the exact footnote
`* You can still activate a prohibited preset by confirming the override.`. When
no usable preset is prohibited, the label SHALL omit the asterisk and the report
SHALL omit the footnote.

The report SHALL NOT display policy rule numbers, rule patterns, matcher
expressions, match lengths, matched substrings, winning-rule details, or
default-selection reasons.

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

#### Scenario: Resolved default is shown without rule diagnostics

- **WHEN** policy resolves a default preset for the current directory
- **THEN** the `Default preset:` row SHALL contain that preset's name
- **AND** the report SHALL NOT identify the winning rule or its selection reason

#### Scenario: No resolved default

- **WHEN** no policy default resolves to a permitted and available preset
- **THEN** the report SHALL contain `Default preset: none`

#### Scenario: Policy view with no matching rules

- **WHEN** the cwd matches no policy rule
- **THEN** the output SHALL be the sentence `No preset policy applies to <cwd>.`
  with `<cwd>` replaced by the current working directory

#### Scenario: Policy view hides policy-engine details

- **WHEN** the user runs `/presets policy` in a directory with matching rules
- **THEN** the report SHALL NOT display rule numbers, regular-expression
  patterns, matcher fields, match lengths, matched substrings, or default-source
  details

#### Scenario: Policy view never writes

- **WHEN** the user runs `/presets policy`
- **THEN** the configuration file SHALL NOT be modified

### Requirement: User-only policy in consolidated configuration

The package SHALL recognize optional access-policy rules only from
`policy.rules` in `<agent-dir>/presets-plus/config.json` version 2. Each rule
SHALL retain the existing `match`, `allow`, `prohibit`, and `default` fields and
matcher semantics. An absent `policy` object or empty `rules` array SHALL apply
no permission constraint or default.

The package SHALL ignore a `policy` section in
`<cwd>/.pi/presets-plus/config.json` and emit one startup warning. Project
policy SHALL NOT contribute rules, prohibit activation, or select a default.

The package SHALL read user policy fresh whenever policy is loaded. Preset
mutations MAY rewrite the containing user configuration file, but SHALL preserve
the policy value unchanged.

#### Scenario: No user policy present

- **WHEN** the user configuration has no `policy` section
- **THEN** no permission constraint or default SHALL apply

#### Scenario: Empty rules array

- **WHEN** the user configuration contains `policy: { rules: [] }`
- **THEN** no permission constraint or default SHALL apply

#### Scenario: Field defaults to name

- **WHEN** a matcher omits `field`
- **THEN** its `pattern` SHALL be tested against the candidate preset's `name`

#### Scenario: Project policy is ignored

- **WHEN** a project configuration contains a `policy` section
- **THEN** none of its rules SHALL apply
- **AND** one startup warning SHALL state that policy is supported only in the
  user configuration

#### Scenario: Preset mutation preserves policy

- **WHEN** the package updates user presets in a valid configuration that also
  contains policy
- **THEN** the policy value SHALL remain unchanged

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
