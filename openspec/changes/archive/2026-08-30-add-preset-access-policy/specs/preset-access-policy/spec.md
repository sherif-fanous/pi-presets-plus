## ADDED Requirements

### Requirement: Global access-policy file

The package SHALL recognize an optional user-global policy file at
`<agent-dir>/presets-plus/policy.json` (alongside the user-scope
`presets.json`). The file SHALL have the shape:

```json
{
  "version": 1,
  "rules": [
    {
      "match": "<cwd-regex>",
      "allow":    [ { "field": "name"|"provider"|"model", "pattern": "<regex>" } ],
      "prohibit": [ { "field": "name"|"provider"|"model", "pattern": "<regex>" } ],
      "default":    { "field": "name"|"provider"|"model", "pattern": "<regex>" }
    }
  ]
}
```

Each rule pairs a `match` regex (tested against the current working directory)
with optional `allow` and `prohibit` matcher lists and an optional single
`default` matcher. Every rule field except `match` is optional. Each matcher has
the shape `{ field, pattern }` where `field` SHALL default to `"name"` when
omitted, `"provider"` selects the preset's provider id, and `"model"` selects
the combined `provider/model` identity string. This file is the user's own
boundary configuration — it is authored manually and SHALL NEVER be written by
the package. Absence of the file, or an empty `rules` array, SHALL preserve the
pre-change behavior (no prohibitions, no default).

The package SHALL read this file fresh on every load (no module-level cache).

#### Scenario: No policy file present

- **WHEN** an activation occurs and no `policy.json` exists
- **THEN** no permission constraint and no default SHALL apply and activation SHALL proceed unchanged

#### Scenario: Empty rules array

- **WHEN** `policy.json` is `{ version: 1, rules: [] }`
- **THEN** no permission constraint and no default SHALL apply to any activation

#### Scenario: Field defaults to name

- **WHEN** a matcher omits `field`
- **THEN** the matcher's `pattern` SHALL be tested against the candidate preset's `name`

### Requirement: Policy file validation and visible fail-open

The package SHALL validate `policy.json` at load time. A file declaring a
`version` other than `1`, or that is not valid JSON, SHALL be treated as if
absent and SHALL emit a warning through the existing warnings pipeline; the
package SHALL NOT rewrite it.

For each rule, the package SHALL compile the `match` regex and every matcher
`pattern` regex (in `allow`, `prohibit`, and `default`). A regex that fails to
compile SHALL cause that individual rule (for a bad `match`) or that individual
matcher (for a bad matcher `pattern`) to be skipped, and SHALL emit a loud
warning naming the offending pattern. Skipping is deliberately fail-open — a
malformed rule or matcher never blocks activation — but the warning guarantees
the weakening is visible rather than silent.

#### Scenario: Unsupported version

- **WHEN** `policy.json` declares `version: 2`
- **THEN** the file SHALL be treated as absent and a warning SHALL be surfaced

#### Scenario: Malformed JSON

- **WHEN** `policy.json` cannot be parsed as JSON
- **THEN** the file SHALL be treated as absent and a warning SHALL be surfaced

#### Scenario: Invalid match regex skips the rule

- **WHEN** a rule's `match` regex fails to compile
- **THEN** that rule SHALL be skipped, a warning naming the bad pattern SHALL be surfaced, and other rules SHALL still apply

#### Scenario: Invalid matcher pattern skips the matcher

- **WHEN** one matcher `pattern` in a rule's `allow`, `prohibit`, or `default` fails to compile
- **THEN** that matcher SHALL be skipped, a warning naming the bad pattern SHALL be surfaced, and the rule's other matchers SHALL still apply

### Requirement: Matchers use raw unanchored regex over the selected field

A matcher SHALL match a candidate preset when its `pattern` regex matches the
value of the selected `field`: `name` tests the preset name, `provider` tests
the provider id, and `model` tests the combined `provider/model` identity
string. All regexes SHALL use raw, unanchored `RegExp.test` semantics — a
pattern matches if it is found anywhere in the target string. Authors anchor
with `^…$` themselves when they need a full-string match. The package SHALL NOT
implicitly anchor patterns.

#### Scenario: Unanchored substring match

- **WHEN** a matcher `pattern` is `apple` and the candidate preset name is `apple-claude-opus-4-8`
- **THEN** the matcher SHALL match (substring semantics, no implicit anchoring)

#### Scenario: Author-anchored match

- **WHEN** a matcher `pattern` is `^ifanous-` and the candidate preset name is `apple-ifanous-test`
- **THEN** the matcher SHALL NOT match because the anchored pattern requires the prefix

#### Scenario: Provider-field matcher

- **WHEN** a matcher has `field: "provider"`, `pattern: "apple-genai"`, and the candidate preset's provider is `apple-genai-anthropic`
- **THEN** the matcher SHALL match on the provider value regardless of the preset name

#### Scenario: Model-field matcher spans a whole provider

- **WHEN** a matcher has `field: "model"`, `pattern: "^anthropic/"`, and the candidate preset resolves to provider `anthropic` and model `claude-opus-4-8`
- **THEN** the matcher SHALL match the combined identity `anthropic/claude-opus-4-8`, and SHALL likewise match any future model under the same provider

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
SHALL NOT be permitted (an allow set acts as a whitelist). A prohibit match SHALL
override an allow match for the same candidate (prohibit wins).

#### Scenario: No rules match the cwd

- **WHEN** no rule's `match` matches the current cwd
- **THEN** every preset SHALL be permitted

#### Scenario: Prohibit blocks a candidate

- **WHEN** a matching rule prohibits `^ifanous-` and the candidate name is `ifanous-anthropic-claude-opus-4-8`
- **THEN** the candidate SHALL NOT be permitted

#### Scenario: Allow acts as a whitelist

- **WHEN** a matching rule allows `^apple-` and no other rule matches, and the candidate name is `ifanous-codex-gpt-5.5`
- **THEN** the candidate SHALL NOT be permitted because it matches no allow matcher

#### Scenario: Allow admits a matching candidate

- **WHEN** a matching rule allows `^apple-` and the candidate name is `apple-claude-opus-4-8` and no prohibit matcher matches it
- **THEN** the candidate SHALL be permitted

#### Scenario: Prohibit wins over allow

- **WHEN** one matching rule allows `^apple-` and another matching rule prohibits `sonnet`, and the candidate is `apple-claude-sonnet-4.6`
- **THEN** the candidate SHALL NOT be permitted

#### Scenario: Union across multiple matching rules

- **WHEN** two rules match the cwd, one prohibiting `^apple-` and one prohibiting `^virtasant-`
- **THEN** both prohibitions SHALL apply and a candidate matching either SHALL NOT be permitted

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

- **WHEN** a new activation targets a non-permitted preset and the user chooses override
- **THEN** the preset SHALL be applied through the standard apply flow

#### Scenario: Cancel aborts activation

- **WHEN** a new activation targets a non-permitted preset and the user chooses cancel
- **THEN** no model, thinking, or tools change SHALL occur and no preset SHALL be attached

#### Scenario: Flag activation is gated

- **WHEN** `--preset` names a non-permitted preset for the current cwd
- **THEN** the warning overlay SHALL be shown before the flag preset is applied

#### Scenario: Hotkey activation is gated

- **WHEN** a per-preset hotkey activates a non-permitted preset
- **THEN** the warning overlay SHALL be shown before the preset is applied

#### Scenario: Session restore is exempt

- **WHEN** a session is resumed re-attaching a preset that would be non-permitted
- **THEN** NO warning overlay SHALL be shown and restore SHALL re-attach the preset as specified by the activation capability

### Requirement: Policy default selection

The package SHALL resolve a policy default for a fresh session as follows. Among
the rules whose `match` matches the cwd and that specify a `default` matcher,
the package SHALL select the winning rule as the one whose `match` regex
consumes the longest substring of the cwd; ties SHALL be broken by earliest rule
in file order. The winning rule's `default` matcher SHALL select candidates from
the merged user+project preset list restricted to _permitted_ presets (per the
permission requirement), and the package SHALL choose the first candidate in
merged file order (user scope then project scope, each in the order presets
appear in its `presets.json`). Ordering is positional: presets carry no live
numeric sort key, so a preset's position in its file — rewritten when the user
reorders in the picker — is what determines precedence.

If no rule specifies a default, or the winning rule's default matcher yields no
permitted, available candidate, the package SHALL resolve no default (fall
through to the Pi baseline). A configured-but-unresolvable default SHALL emit a
warning; it SHALL NOT fail the session. Because the default is drawn only from
the permitted set, an auto-applied default SHALL NEVER trigger the permission
overlay.

#### Scenario: Longest-path rule wins the default

- **WHEN** rule A `match: "^/work/"` sets `default` `^apple-` and rule B `match: "^/work/apple/"` sets `default` `^apple-claude-opus-`, and the cwd is `/work/apple/project`
- **THEN** rule B SHALL win because its `match` consumes a longer substring of the cwd, and its default matcher SHALL be used

#### Scenario: File order breaks a span tie

- **WHEN** two matching rules specify a default and their `match` regexes consume equal-length substrings of the cwd
- **THEN** the earlier rule in file order SHALL win

#### Scenario: Default is chosen by merged file order

- **WHEN** the winning rule's default matcher is `^apple-claude-opus-` and the permitted merged list contains `apple-claude-opus-4-7` before `apple-claude-opus-4-8` in file order
- **THEN** the package SHALL choose `apple-claude-opus-4-7` (the first in merged file order)

#### Scenario: Default excludes non-permitted candidates

- **WHEN** the winning rule's default matcher matches `apple-claude-sonnet-4.6` but another matching rule prohibits `sonnet`
- **THEN** that candidate SHALL be excluded from default selection and the next permitted candidate in file order (if any) SHALL be chosen

#### Scenario: No default configured

- **WHEN** no matching rule specifies a default
- **THEN** no policy default SHALL be resolved and the session SHALL continue on the Pi baseline

#### Scenario: Default resolves to nothing available

- **WHEN** the winning rule's default matcher matches no permitted, available preset
- **THEN** no auto-activation SHALL occur, the session SHALL continue on the Pi baseline, and a warning SHALL be surfaced

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
existing apply flow (capturing a fresh baseline, emitting the activation
audit-trail message, and refreshing the footer indicator), and SHALL emit
exactly one additional informational notification via `ctx.ui.notify` naming the
applied preset (e.g. `Applied default preset "apple-claude-opus-4-8".`) so the
user understands that directory policy — not their own action — selected it.

If the apply flow returns a refusal for the default (e.g. the model's key was
revoked between load and apply), the package SHALL surface the refusal reason as
a warning, leave the Pi baseline in place, attach no preset, and continue the
session.

#### Scenario: Fresh session applies the default

- **WHEN** a fresh session starts, no `--preset` flag is passed, no prior active preset is restored, and a policy default resolves to a permitted available preset
- **THEN** the default SHALL be applied via the standard apply flow and one info notification naming it SHALL be emitted

#### Scenario: Flag overrides policy default

- **WHEN** a session starts with `--preset other` passed and a policy default also resolves
- **THEN** `other` SHALL be activated by the flag and the policy default SHALL NOT be applied

#### Scenario: Restored session is not a fresh session

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry names a still-loadable preset
- **THEN** that preset SHALL be re-attached by restore and the policy default SHALL NOT be applied

#### Scenario: Failed restore falls through to policy default

- **WHEN** a session is resumed whose most recent `presets-plus:active` entry names a preset that no longer loads, and a policy default resolves to a permitted available preset
- **THEN** restore SHALL attach nothing (and warn per the restore requirement) and the policy default SHALL then be applied

#### Scenario: No notification when the default is preempted

- **WHEN** a flag or a successful restore preempts the policy default
- **THEN** no default-applied notification SHALL be emitted

#### Scenario: Apply refusal on the default is non-fatal

- **WHEN** the resolved default's apply flow returns a refusal
- **THEN** a warning SHALL be surfaced, no preset SHALL be attached, and the session SHALL continue on the Pi baseline

### Requirement: Read-only policy inspection view

The `/presets` command SHALL accept a read-only `policy` subcommand that
reports, for the current working directory: the rules whose `match` matches the
cwd, the effective (unioned) allow and prohibit matchers, and the resolved
default preset (with the winning rule and the reason it won — longest span or
file-order tie). The view SHALL be read-only — it SHALL never write
`policy.json`. It SHALL be delivered through `ctx.ui.notify`, following the
existing pure-formatter + thin-runner convention (an exported formatter returns
the string; a thin runner routes it through `ctx.ui.notify`).

This view is the debugging surface for the manually-authored, fail-open policy,
so a user can answer "why did (or didn't) the warning fire, and why this
default?".

#### Scenario: Policy view with matching rules

- **WHEN** the user runs `/presets policy` in a cwd matched by one or more rules
- **THEN** the output SHALL list those rules, the effective allow/prohibit sets, and the resolved default, delivered via `ctx.ui.notify`

#### Scenario: Policy view with no matching rules

- **WHEN** the user runs `/presets policy` in a cwd matched by no rules
- **THEN** the output SHALL state that no rules apply to the current directory

#### Scenario: Policy view never writes

- **WHEN** the user runs `/presets policy`
- **THEN** `policy.json` SHALL NOT be modified
