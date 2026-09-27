## Why

When a policy default pattern matches several permitted presets, the package
silently picks the first one in preset order. Nothing in the README or in
`/presets policy` says so, so a user who expects a different pick, such as the
newest model version, gets a surprise and has no way to see why.

## What Changes

- `/presets policy` shows a `Default matches:` row listing every permitted,
  available preset the winning default matches, in merged preset order, when
  there is more than one.
- The report adds no note about the first-match rule. The README carries that
  explanation, and the row alone shows which presets compete.
- The README explains how a default is chosen when its pattern matches more than
  one preset, and how to control the result.
- Default selection itself does not change. The first match in merged preset
  order still wins, and startup shows no new warning for an ambiguous default,
  because an ordered fallback list is a legitimate configuration.
- Out of scope: a tie-breaker or preference key on the default matcher, and any
  version-aware sorting of preset names or model ids. Both depend on naming
  conventions the package cannot assume.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-access-policy`: The read-only policy inspection view lists every
  preset the default matches when there is more than one. The view's ban on
  default-selection details is narrowed so it still hides rule diagnostics but
  allows the candidate list.

## Impact

- `src/store/policy.ts`: the resolved default result exposes its ordered
  candidate list, and the first entry is the winner.
- `src/activation/policy-default.ts`: reads the winner from the candidate list.
- `src/commands/presets/policy.ts` and `src/ui/labels.ts`: the new row and label
  in the report.
- `tests/store/policy.test.ts` and `tests/commands/presets/policy.test.ts`.
- `README.md`. The CHANGELOG entry is written separately when the release is
  cut.
- No configuration format change and no change to startup activation.
