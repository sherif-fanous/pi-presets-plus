## Why

A user who works across several contexts (distinct work tenants, personal
repos) wants two things per directory tree: (a) a guard that discourages
activating the wrong preset there — e.g. spending an employer's credentials on
a personal project, or vice versa — and (b) the convenience of the right preset
turning on automatically without re-selecting it every fresh session. Both are
_directory-scoped policy about the user's own machine_, not properties of any
single repository, and both are best expressed against the same boundary
(preset name / provider / model). This change unifies them into one
user-global policy file that declares, per path, what is allowed, what is
prohibited, and what to activate by default.

## What Changes

- Introduce a user-global policy file `<agent-dir>/presets-plus/policy.json`
  (alongside the user-scope `presets.json`), authored manually (config-as-code;
  never written by the package). Shape:

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

  Every rule field except `match` is optional. All matchers share the shape
  `{ field, pattern }` with `field` defaulting to `"name"`; `provider` tests the
  provider id and `model` tests the combined `provider/model` identity
  (so `{ field: "model", pattern: "^anthropic/" }` matches any current or
  future model in the anthropic provider). All patterns are raw, unanchored
  regex.

- **Permission model.** For a cwd, the package unions the `allow` and
  `prohibit` matchers across all rules whose `match` hits the cwd. A preset is
  _permitted_ iff (there is no allow matcher OR it matches one) AND it matches
  no prohibit matcher.

- **Prohibition gate.** Every NEW activation (the `--preset` flag, manual
  `/presets <name>`, picker activation, per-preset hotkey) whose target is not
  permitted SHALL present an override/cancel warning overlay; activation
  proceeds only on explicit override. Session restore is exempt.

- **Default auto-activation.** On a fresh session, the package auto-activates a
  default preset resolved from the policy: among the matching rules that specify
  a `default`, the winner is the rule whose `match` consumes the longest
  substring of the cwd (ties broken by earliest rule in file order); its
  `default` matcher selects candidates from the **permitted** merged preset
  list, and the first candidate in merged file order is applied. Because
  the default is drawn from the permitted set, it can never auto-activate a
  preset the same policy would warn about, and therefore never triggers the
  overlay at session start. Precedence:
  `--preset flag > session restore (if preset still exists) > policy default > baseline`.
  A default that resolves to nothing falls through to the Pi baseline with a
  warning; it never fails the session.

- **Validation and visible fail-open.** The file is validated at load time;
  malformed JSON / unsupported version is treated as absent with a warning, and
  an individual regex that fails to compile skips just that rule or matcher with
  a loud warning (fail-open but visible).

- **Read-only `/presets policy` view** reports, for the current cwd, the rules
  that match, their effective allow/prohibit sets, and the resolved default —
  the debugging surface for the manually-authored guard.

## Capabilities

### New Capabilities

- `preset-access-policy`: a user-global, path-keyed policy that (1) permits or
  prohibits preset activation per directory via unioned allow/prohibit regex
  matchers enforced as an overridable warning overlay across all new
  activations (restore exempt), and (2) auto-activates a permitted default
  preset on a fresh session, selected by longest-path rule match then merged
  file order, with raw/unanchored regex, visible fail-open on malformed rules,
  and a read-only inspection view.

### Modified Capabilities

- `preset-activation`: route new activations (flag, manual, hotkey) through the
  permission gate before applying; add a fresh-session policy-default step after
  the flag and restore steps. Restore bypasses the gate and the default.

## Impact

- Storage: new `policy.json` schema, global-scope path resolver, loader and
  validator (path + matcher regex compilation with per-rule/-matcher error
  capture). Read-only — never written by the package.
- Activation: a permission gate invoked at every new-activation entry point
  (`flag.ts`, picker activation, hotkey registry) reusing the existing
  custom-overlay confirmation pattern; a policy-default step in `src/index.ts`
  `session_start` after `applyPresetFlag` and `restoreFromBranch`, reusing the
  existing `apply()` flow.
- UI: new warning overlay (override/cancel) reusing the confirm-overlay
  pattern; new read-only `/presets policy` subcommand routed through
  `ctx.ui.notify` per the pure-formatter + thin-runner convention.
- No new dependencies. No breaking changes — absence of `policy.json` (or empty
  `rules`) preserves today's behavior exactly. No in-repo file is introduced.
