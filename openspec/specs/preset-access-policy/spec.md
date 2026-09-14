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

The package SHALL, on `session_start`, after the `--preset` flag step and the
session-restore step have run, auto-activate the resolved policy default only
when BOTH of the following hold:

- the `--preset` flag did not activate a preset for this invocation, AND
- session restore did not attach an existing active preset — including the case
  where the most recent `presets-plus:active` entry named a preset that no
  longer loads (a failed restore is treated as "nothing attached").

The resulting precedence SHALL be:
`--preset flag > session restore (if the named preset still exists) > policy default > baseline`.

When the policy default is auto-activated, the package SHALL apply it through
the existing apply flow, capturing a fresh baseline, producing one visible
success outcome naming the preset, and refreshing the footer indicator. Any
apply accompaniments SHALL be combined into that outcome. It SHALL NOT emit a
second success notification for the same activation.

If the apply flow returns a refusal for the default (e.g. the model's key was
revoked between load and apply), the package SHALL surface the refusal reason as
a warning, leave the Pi baseline in place, attach no preset, and continue the
session. Startup warnings collected during this session SHALL be combined into
one startup warning where possible.

#### Scenario: Fresh session applies the default

- **WHEN** a fresh session starts, no `--preset` flag is passed, no prior active
  preset is restored, and a policy default resolves to a permitted available
  preset
- **THEN** the default SHALL be applied via the standard apply flow
- **AND** exactly one visible success outcome naming the applied preset SHALL be
  emitted
- **AND** any apply accompaniments SHALL be included in that outcome
- **AND** no second success notification naming the same preset SHALL be emitted

#### Scenario: Flag overrides policy default

- **WHEN** a session starts with `--preset other` passed and a policy default
  also resolves
- **THEN** `other` SHALL be activated by the flag and the policy default SHALL
  NOT be applied
- **AND** no policy-default success outcome SHALL be emitted

#### Scenario: Restored session is not a fresh session

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry
  names a still-loadable preset
- **THEN** that preset SHALL be re-attached by restore and the policy default
  SHALL NOT be applied
- **AND** no activation success outcome SHALL be emitted for the restore

#### Scenario: Failed restore falls through to policy default

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry
  names a preset that no longer loads, and a policy default resolves to a
  permitted available preset
- **THEN** restore SHALL attach nothing and SHALL contribute its warning to the
  startup warning collection
- **AND** the policy default SHALL then be applied
- **AND** the successful default activation SHALL emit only its single combined
  success outcome

#### Scenario: No notification when the default is preempted

- **WHEN** a flag or a successful restore preempts the policy default
- **THEN** no default-applied success outcome SHALL be emitted

#### Scenario: Apply refusal on the default is non-fatal

- **WHEN** the resolved default's apply flow returns a refusal
- **THEN** a warning SHALL be added to the startup warning collection
- **AND** no preset SHALL be attached
- **AND** the session SHALL continue on the Pi baseline

#### Scenario: Startup warnings are aggregated

- **WHEN** startup produces multiple warnings from preset loading, hotkey
  registration, policy loading, restore, or default activation
- **THEN** the package SHALL present one startup warning containing the
  individual warning messages where possible
- **AND** the package SHALL preserve each warning's meaning

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
