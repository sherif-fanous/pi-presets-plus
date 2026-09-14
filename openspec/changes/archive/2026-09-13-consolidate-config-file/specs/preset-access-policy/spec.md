## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Global access-policy file

**Reason**: User policy now lives in `policy.rules` inside the consolidated
version 2 user configuration.

**Migration**: During `session_start`, the package automatically copies a valid
version 1 `policy.json` rules array into the new user configuration before
deleting the legacy file.
