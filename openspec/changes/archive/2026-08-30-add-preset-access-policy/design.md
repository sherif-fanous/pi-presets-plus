## Context

This change consolidates two earlier proposals — `add-project-default-preset`
(an in-repo default file) and `add-preset-prohibition-guard` (a user-global
prohibition guard) — into one policy model. Exploration surfaced that both are
the same kind of thing: _directory-scoped policy about the user's own machine_.
It also surfaced fatal corners in the in-repo default: preset names are personal
(`ifanous-…`, `apple-…`, `virtasant-…`), so an in-repo default committed to a
shared repo would spam teammates with dangling references, and a name-only
reference sorted by name could silently activate the wrong preset (e.g. a broad
`^apple-` sorts `sonnet` above `opus`; `4-8` above `4-10`). Folding the default
into the same user-global, path-keyed rule set — and drawing it from the
_permitted_ set, tiebroken by merged file order (the user's curated preset
positions) — removes both classes of failure.

The extension already provides the primitives needed: a fresh-on-every-call
storage layer with a warnings pipeline, a path-resolver pattern
(`getGlobalPresetsPath`), multiple activation entry points (flag, manual
`/presets`, picker, hotkey), the `apply()` flow with structured refusals, and a
two-outcome confirmation overlay (`openConfirm` in `src/ui/confirm.ts`).

## Goals / Non-Goals

**Goals:**

- One user-global file expressing allow / prohibit / default per directory tree.
- Soft prohibition: an overridable warning, never a hard block.
- Express boundaries against name, provider, or the combined `provider/model`.
- Auto-activate a default that is _safe by construction_ (drawn from the
  permitted set) and _predictable_ (chosen by the user's curated file order, not
  by name sort).
- Gate every new activation; exempt session restore.
- Fail open but visibly; be debuggable via a read-only view.

**Non-Goals:**

- Any in-repo policy/default file (dropped deliberately; see Decisions).
- Hard, non-overridable blocks.
- A TUI for authoring rules or setting the default — `policy.json` is manual
  config-as-code.
- Matching on thinking level or tools.
- Semantic-version-aware default selection (superseded by file-order selection).

## Decisions

**One user-global file, not two files and not in-repo.** The default and the
guard are both facts about how the user partitions their own machine, so they
live together in `<agent-dir>/presets-plus/policy.json`, keyed by path regex.
Dropping the in-repo `project.json` eliminates the shared-repo dangling-warning
problem entirely and lets the default be validated against the same permission
model. `presets.json` keeps its two scopes for _definitions_; only _policy_
unifies.
_Alternatives considered:_ in-repo default file — rejected (personal names break
teammates); two separate policy files — rejected (same concern, two schemas,
duplicated cwd-matching logic).

**Default is drawn from the permitted set, tiebroken by file order.** The earlier
"regex default sorted by name descending" idea was rejected because
lexicographic order is a poor proxy for intent (`sonnet` > `opus`; `4-8` >
`4-10`) and it converts a safe, loud failure (dangling → warn → baseline) into a
silent misfire. Selecting the first _permitted_ candidate in merged file order —
the position the user curates by reordering in the picker — is explicit
curation, bounded by `allow`, so it can never auto-activate a prohibited preset
and never triggers the overlay at startup. Note: the `Preset.order` field is
validated and round-tripped to disk but is not a live sort key; the extension
orders presets by file position (which `reorderWithinScope` rewrites), and
default selection reuses that same order for consistency.
_Alternative considered:_ name-sort tiebreak — rejected (silent wrong-preset).
_Alternative considered:_ literal single-name default — rejected (breaks on
model version bumps; the user must re-pin each release).

**Longest-path rule wins the default; file order breaks ties.** When multiple
rules match a cwd and specify a default, the most specific rule should win.
Because `match` is a regex, "most specific" is defined operationally as the rule
whose `match` consumes the longest substring of the cwd (`RegExp.exec(cwd)[0]`
length). This rewards anchored, deep patterns (`^/work/apple/` beats `^/work/`
beats a loose `apple`) and is deterministic and testable. Equal spans fall back
to earliest rule in file order.
_Alternative considered:_ file order alone — rejected (a broad rule declared
first would shadow a specific one); _alternative considered:_ counting path
segments — rejected as more complex with no clear advantage over match span.

**Allow/prohibit union across matching rules (not most-specific-wins).** For the
_permission_ decision the package unions all matching rules' allow and prohibit
matchers, and prohibit wins over allow. This is the fail-safe posture: a deep
rule can never silently un-prohibit something a broad rule blocked. The
longest-path selection applies only to the singular `default`, never to the
permission union. See Open Questions for the override alternative.

**`{ field, pattern }` matcher with a `model` option.** `name` (default) honors
the user's disciplined prefix convention at zero cost; `provider` targets the
credential-true boundary; `model` targets the combined `provider/model` identity
so `^anthropic/` means "any current or future model in the anthropic provider"
without glob.

**Raw, unanchored regex.** Chosen over glob for unions and anchoring. `apple` is
a substring match; authors write `^apple-` for a prefix. No implicit `^…$`
wrapping, which would silently change meaning.

**Fail open, but loudly.** A malformed `match` skips its rule; a malformed
matcher `pattern` skips just that matcher; each emits a loud warning. A guard
that failed closed (blocking on a typo) would be infuriating; one that failed
silently would leave the user unprotected unknowingly. The `/presets policy`
view makes the live rule set and resolved default inspectable.

**Gate all new activations; exempt restore; default needs no gate.** The gate
wraps flag, manual, picker, and hotkey activations. Restore is exempt (consent
already given; no re-apply occurs). The policy default is exempt because it is
selected only from the permitted set — a clean property that also dissolves the
"blocking modal at session_start" concern.

**Reuse the confirm-overlay pattern; `/presets policy` as pure formatter +
thin runner.** The warning overlay is a two-outcome confirmation, matching
`src/ui/confirm.ts`. The inspection view follows the project's exported-formatter

- thin-runner convention and is strictly read-only.

## Risks / Trade-offs

- [No in-repo/team default anymore] → Accepted; personal preset names made the
  in-repo default a liability, not an asset. A team convention could be layered
  later without changing this model.
- [Default authored manually, no picker "set default" action] → Accepted;
  consistent with policy being hand-edited config-as-code. The `/presets policy`
  view mitigates discoverability.
- [Silent rebind of the default when a new preset is inserted earlier in file
  order] → Reduced from the name-sort design: selection is bounded by `allow`
  and driven by the user's curated file positions, so it is deliberate, not an
  alphabetical accident; surfaced in `/presets policy`.
- [Fail-open means a typo'd rule silently stops protecting] → Mitigated by the
  loud load-time warning and the inspection view.
- [Longest-span specificity is a proxy, not true path depth] → Accepted; it is
  deterministic, rewards anchoring, and ties fall back to file order.
- [Launched from a subdirectory: cwd-literal matching] → The gate and default
  key off the live cwd regex, so behavior tracks the actual cwd; this is
  consistent with the existing cwd-literal project `presets.json` resolution.

## Migration Plan

Additive and backward compatible. Absence of `policy.json` (or empty `rules`)
reproduces today's behavior exactly. No files are written or migrated by this
change; no in-repo file is introduced. This change supersedes and replaces the
`add-project-default-preset` and `add-preset-prohibition-guard` proposals, which
are removed. Rollback is removing `policy.json` or the feature.

## Open Questions

- **Permission model: union vs. most-specific-wins.** This design unions
  allow/prohibit across all matching rules (fail-safe; a deep rule cannot relax
  a broad one). An alternative is most-specific-rule-wins for permission too,
  which would let `/work/oss` re-allow what `/work` prohibits — more expressive
  but able to silently open a hole via a typo'd deep rule. Union is the default;
  revisit if exception-carving becomes necessary.
- Exact overlay copy phrasing, and whether `/presets policy` should echo each
  rule's file line number — refinements to settle during implementation against
  the project's user-facing string conventions.
