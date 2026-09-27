## 1. Remove the footnote and label marker

- [x] 1.1 In `src/commands/presets/policy.ts`, delete `OVERRIDE_FOOTNOTE` and
      the line that appends it, render the prohibited row with the plain
      `Prohibited presets:` label in every case, and drop the asterisk form from
      `POLICY_LABELS`. Verify the report ends with its last row and the label
      column narrows to the longest remaining label.
- [x] 1.2 Update the expected report strings in
      `tests/commands/presets/policy.test.ts` for the plain label, the narrower
      label column, and the missing trailing blank line and footnote. Verify the
      tests cover the "Report with prohibited presets" and "Report with no
      prohibited presets" scenarios and that `mise run check` passes.

## 2. Integration check

- [x] 2.1 Run `mise run check` and `openspec validate --specs --strict`, and
      verify both pass. Manually run `/presets policy` in a directory where
      policy prohibits a preset and confirm the report has no asterisk and no
      footnote.
