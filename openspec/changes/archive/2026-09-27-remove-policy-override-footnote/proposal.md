## Why

The `/presets policy` report ends with a footnote saying a prohibited preset can
still be activated by confirming the override. The report is a summary of the
effective policy, and the footnote adds a line of instruction that users already
meet at the moment it matters: Pi asks whether to Override or Cancel whenever
they target a prohibited preset.

## What Changes

- Remove the footnote
  `* You can still activate a prohibited preset by confirming the override.`
  from the `/presets policy` report.
- Remove the asterisk from the `Prohibited presets*:` label, since it only
  pointed at the footnote. The label is always `Prohibited presets:`.
- The report no longer ends with a blank line and note when policy prohibits a
  preset. The label column narrows by one character because the longest label
  loses its asterisk.
- Override behavior does not change. Activating a prohibited preset still asks
  whether to Override or Cancel.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-access-policy`: The read-only policy inspection view drops the
  override footnote and the asterisk on the prohibited presets label.

## Impact

- `src/commands/presets/policy.ts`: the footnote constant, the conditional
  label, and the label list used for column width.
- `tests/commands/presets/policy.test.ts`: expected report strings.
- No change to the README, which already describes the Override or Cancel
  prompt, and no configuration change.
