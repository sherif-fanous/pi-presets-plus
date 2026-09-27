## 1. Expose default candidates

- [x] 1.1 Change `resolvePolicyDefault` in `src/store/policy.ts` to filter all
      default candidates in merged order and return them as a non-empty
      `candidates` tuple on the `resolved` result in place of `preset`. Read
      `candidates[0]` in `src/activation/policy-default.ts`. Update the
      `PolicyDefaultResult` JSDoc. Verify with new cases in
      `tests/store/policy.test.ts` for one candidate, several candidates in file
      order, and prohibited, shadowed, and unavailable matches excluded from
      `candidates`, and confirm the existing startup tests in `tests/activation`
      pass unchanged.

## 2. Show candidates in the policy report

- [x] 2.1 Add a `Default matches` label to `src/ui/labels.ts` and include it in
      `POLICY_LABELS`. Render the `Default matches:` row after `Default preset:`
      only when there are two or more candidates, with no explanatory note.
      Verify with new cases in `tests/commands/presets/policy.test.ts` covering
      the single-candidate, several-candidate, prohibited-candidate, and
      no-default scenarios in the spec delta, and confirm existing report tests
      still pass with aligned labels.
- [x] 2.2 Update `README.md` in the policy section to explain that when the
      default pattern matches several permitted presets, Pi uses the one listed
      first, with user presets ahead of project presets. Keep it to the rule
      itself, without walkthroughs of how to change the pick. Run the
      `humanizer` and `unslop` skills over the new text and verify
      `mise run check` passes.

## 3. Integration check

- [x] 3.1 Run `mise run check` and verify it passes. Manually run
      `/presets policy` against a config where the default matches two presets
      and confirm the row appears as specified.
