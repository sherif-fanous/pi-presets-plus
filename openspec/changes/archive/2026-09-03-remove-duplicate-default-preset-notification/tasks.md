## 1. Remove the duplicate success signal

- [x] 1.1 Remove the successful-default `ctx.ui.notify` call from `src/activation/policy-default.ts`, preserving policy warnings, refusal handling, and the boolean result; verify the module no longer emits an informational success notification.
- [x] 1.2 Keep the shared apply-flow activation message unchanged and verify the existing activation-message tests still pass.

## 2. Update coverage

- [x] 2.1 Update `tests/activation/policy-default.test.ts` so successful default activation expects no notification while still verifying `apply()` receives the resolved preset and returns success.
- [x] 2.2 Add or adjust coverage for the successful default path to verify the common visible activation message remains the sole success signal; verify refusal and unresolvable-default cases still emit warnings.

## 3. Validate the change

- [x] 3.1 Run `mise run check` and verify formatting, linting, type-checking, and all tests pass.
- [x] 3.2 Run `openspec validate "remove-duplicate-default-preset-notification" --type change --strict` and verify the planning artifacts satisfy the schema.
