## Why

A directory default can replace a subagent's requested model during startup,
after Pi has already selected it. Keep interactive directory defaults while
preventing automatic preset activation in non-interactive sessions and
preserving interactive startup values that differ from configured defaults.

## What Changes

- **BREAKING**: Stop automatic directory-default activation in print and RPC
  sessions. Explicit preset activation and restored preset attachments remain
  supported through their existing paths.
- In interactive sessions, apply a directory default only when startup provider,
  model, and thinking match resolved file-backed Pi defaults, no explicit preset
  successfully applied, and no preset attachment restored.
- Read global settings and trusted project overrides through Pi's settings API.
  Normalize default thinking for the configured model. Silently skip automatic
  activation when settings cannot be read or the comparison cannot be resolved
  reliably.
- Skip the entire automatic preset, including its thinking, tools, attachment,
  and instructions, when startup is ineligible.
- Preserve permission checks, permitted default selection, policy warnings, and
  existing reload, resume, fork, and cleared-state handling subject to the new
  eligibility rule.
- Document that an explicit interactive selection equal to configured defaults
  remains eligible. Custom SDK in-memory settings are not visible through the
  file-backed settings API.
- Add regression tests for startup ordering, session modes, settings comparison,
  silent skips, and unchanged activation behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-access-policy`: Restrict automatic defaults to eligible interactive
  startup state and define the settings comparison and silent skip contract.
- `preset-activation`: Capture startup values before preset processing and apply
  the new eligibility rule only to automatic activation.

## Impact

The implementation will affect startup wiring in `src/index.ts`, automatic
activation in `src/activation/policy-default.ts`, focused settings comparison
logic, and associated tests. README and changelog updates will explain the
non-interactive behavior change and equality limitation.

Use the existing Pi settings API and installed model-capability helpers where
suitable. Do not require a Pi API change, launcher cooperation, process argument
inspection, environment signals, or new configuration flags. No configuration
migration or external dependency is planned.
