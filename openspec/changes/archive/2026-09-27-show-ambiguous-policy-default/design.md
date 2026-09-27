## Context

`resolvePolicyDefault` in `src/store/policy.ts` picks the winning rule, then
uses `presets.find(...)` to return the first preset that is not shadowed, is
available, is permitted, and matches the winning `default` matcher. It returns
only that preset, so callers cannot tell whether other presets also matched.
`formatPolicy` in `src/commands/presets/policy.ts` renders the report from that
result. Startup activation (`src/activation/policy-default.ts`) uses the same
function.

## Goals / Non-Goals

**Goals:**

- Show every default candidate in the report without a second copy of the
  candidate filter.
- Keep startup activation behavior and its output identical.

**Non-Goals:**

- Any change to how the winning rule or the default preset is chosen.
- New configuration keys or warnings.

## Decisions

### Resolve returns the ordered candidate list

`resolvePolicyDefault` switches from `find` to `filter` and replaces `preset` on
the `resolved` result with `candidates`, typed as a non-empty tuple
`readonly [LoadedPreset, ...LoadedPreset[]]`. The winner is `candidates[0]`, so
startup activation and the report cannot disagree about which preset wins, and
the type rules out an empty list without a runtime check. Startup activation
reads `candidates[0]`. The `unresolvable` case has no candidates by definition,
so it stays unchanged.

Alternative: keep `preset` next to `candidates`. Rejected because the two fields
hold the same fact, and an edit to one could leave the other stale without a
compile error.

Alternative: recompute candidates inside `formatPolicy` from the winning rule's
matcher. Rejected because the view and startup would then hold two copies of the
candidate predicate, and nothing would fail if they drifted apart, which the
project conventions warn against.

Filtering the whole list instead of stopping at the first match costs one regex
test per preset. Preset lists are small, and the cost is not worth a separate
code path.

### Label lives beside the existing ones

Add `DEFAULT_MATCHES_LABEL = "Default matches"` to `src/ui/labels.ts` and
include it in `POLICY_LABELS` so the label column width still comes from one
list. The row carries no explanatory note; the README explains the first-match
rule, and a second footnote under the report read as unrelated to any row.

### README placement

The explanation goes in the policy section of `README.md`, next to the sentence
about the longest matching directory path, since that is where a reader looks
for how the default is chosen. It names both remedies: a more specific pattern,
or listing the preferred preset first.

## Risks / Trade-offs

- [New presets created through the editor are appended to the end of the file,
  so a user who orders newest first must move each new preset up] -> The
  `Default matches:` row makes the result visible, and the README states the
  rule. No code change.
- [A long candidate list makes a wide row] -> Same behavior as the existing
  allowed and prohibited rows, which also list names on one line.
