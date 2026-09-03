## Context

The common preset application flow already emits the visible activation message after it commits activation state. The policy-default wrapper then emits a second informational notification only for successful default activation. See `proposal.md` for the user-facing motivation and `specs/preset-access-policy/spec.md` for the updated contract.

## Goals / Non-Goals

**Goals:**

- Make successful policy-default activation use the common activation message as its only success signal.
- Keep failure and diagnostic warnings unchanged.
- Preserve the existing activation ordering, session state, footer refresh, and custom-message details.
- Test both the successful default path and non-success paths.

**Non-Goals:**

- Changing the common activation message or its renderer.
- Changing manual activation, flag activation, or restore behavior.
- Redesigning Pi's notification spacing or conversation layout.

## Decisions

- Remove only the success notification from the policy-default orchestration layer. The common apply flow remains the single owner of successful activation messaging, which prevents the two messages from diverging.
- Retain `ctx.ui.notify` for policy-load warnings, unresolvable defaults, and apply refusals. These are distinct outcomes and are not replaced by a success message.
- Update the policy-default tests to assert that successful activation does not add an informational notification while still verifying that the activation message is sent. An alternative would be suppressing the common message for policy defaults, but that would create a special case in the shared apply flow and make activation history less consistent.

## Risks / Trade-offs

- [Risk] Users may rely on the wording "Applied default preset" to distinguish policy activation from manual activation. → The existing activation message still names the preset, and the policy behavior remains documented; no state or selection behavior changes.
- [Risk] A test may only count notifications and miss duplicate visible messages from another path. → Assert both notification calls and the custom activation message in the default-activation tests.

## Migration Plan

No data migration is required. Deploy the code and test changes together. Rollback consists of restoring the removed success-notification call and its prior expectation if the previous wording is required.
