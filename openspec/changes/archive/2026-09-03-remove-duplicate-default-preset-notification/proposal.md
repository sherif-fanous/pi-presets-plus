## Why

A policy default activation currently produces both the standard visible activation message and a second informational notification. They communicate the same successful activation, so starting Pi shows duplicate confirmation text and unnecessary spacing. The default activation should use the standard activation message as its single success signal.

## What Changes

- Remove the additional success notification emitted after a policy default is applied.
- Keep the standard visible activation message emitted by the common apply flow.
- Preserve warning notifications for policy-load problems, unresolvable defaults, and apply refusals.
- Update the access-policy behavior and tests to require one success signal rather than two.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-access-policy`: A successfully auto-activated policy default no longer emits an additional informational notification after the common activation message.

## Impact

The policy-default activation flow, its tests, and the `preset-access-policy` specification will change. No public command, preset format, or activation state behavior changes. The common activation message remains visible in the conversation and continues to carry the preset details without entering the LLM context.
