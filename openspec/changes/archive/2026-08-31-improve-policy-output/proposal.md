## Why

The `/presets policy` report exposes rule numbers, regular-expression matchers, match lengths, and default-selection internals instead of answering which presets the current policy allows. Users need a concise summary of the policy's effective outcome for the current directory.

## What Changes

- Reshape `/presets policy` to match the labeled-row presentation used by `/presets status`.
- List the usable presets that policy allows and prohibits instead of displaying raw matchers and rule diagnostics.
- Explain with a conditional footnote that prohibited presets remain activatable through an explicit override.
- Show the resolved default preset without rule-selection details.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-access-policy`: Replace the policy-engine debugging report with a user-facing summary of allowed presets, prohibited presets, and the resolved default for the current directory.

## Impact

- Updates the `/presets policy` formatter and its shared display labels.
- Updates formatter tests and user-facing output expectations.
- Does not change policy evaluation, activation gating, override behavior, default resolution, or persisted file formats.
