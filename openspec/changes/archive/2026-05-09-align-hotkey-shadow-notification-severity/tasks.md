## 1. Implementation

- [x] 1.1 In `src/hotkey-registry.ts`, locate the `bindForSession` notification call for the Pi built-in shadow path (currently `ctx.ui.notify(..., "info")` inside the `if (isPiBuiltin(parsed))` block). Change the severity argument from `"info"` to `"warning"`. Notification text is unchanged.
- [x] 1.2 Audit `src/hotkey-registry.ts` to confirm the conflict notification (the loop over `hotkeyAnalysis.conflicts`) already uses `"warning"`. Both collision-style notifications now share the same severity.

## 2. Tests

- [x] 2.1 Update `tests/hotkey-registry.test.ts` shadow-path scenarios to assert the notification is emitted with severity `"warning"` (was `"info"`).
- [x] 2.2 If the test file does not already cover the conflict severity, add a scenario asserting `"warning"` is emitted for the conflict path. (Scope: a small assertion ensuring both collision conditions reach the same severity.)
- [x] 2.3 Run `mise run check`. The user-facing string itself is unchanged, so `tests/user-facing-strings.test.ts` should pass with no edits.

## 3. Validation

- [x] 3.1 Run `mise run check` end-to-end (format, lint, type-check, test).
- [x] 3.2 Run `openspec validate align-hotkey-shadow-notification-severity --strict`.
- [x] 3.3 Manual smoke test: declare a preset with `hotkey: "ctrl+l"` (or another known Pi built-in chord), restart Pi, observe the session-start notification renders in the warning color with the `Warning:` prefix and matches the visual treatment of a preset-vs-preset conflict notification.
