## 0. Raise the Pi dependency baseline

- [x] 0.1 Set the `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` development dependencies to `0.80.5` or newer, refresh the lockfile, and verify the installed API exposes `registerEntryRenderer()`
- [x] 0.2 Add the breaking compatibility note to `CHANGELOG.md` and verify it names Pi `0.80.5` as the minimum supported version
- [x] 0.3 Allow the upgraded Pi dependency's approved build in the package manager configuration and verify dependency installation completes

## 1. Define apply outcomes

- [x] 1.1 Extend the successful apply result with structured accompaniments for thinking adjustments and dropped unknown tools, and verify existing apply behavior still passes its unit tests
- [x] 1.2 Remove direct success and apply-warning notifications from the apply operation, route each caller through one combined outcome, and verify prompt, picker, hotkey, flag, editor Test, and policy-default paths
- [x] 1.3 Add tests that verify a successful apply with multiple accompaniments produces one user-facing outcome and does not call `pi.sendMessage()`

## 2. Route activation and clear output

- [x] 2.1 Replace the activation message renderer and `pi.sendMessage()` path with notification or picker-local output, and verify activation text never enters LLM context
- [x] 2.2 Update clear formatting and delivery so prompt clear uses one concise, severity-aware notification while picker clear uses the same text in an info dialog, and verify full restore, user override, priorUnknown, and restore-failure cases
- [x] 2.3 Apply humanizer and unslop to all changed activation, clear, warning, and error prose, then verify exact contract strings and project vocabulary remain correct

## 3. Add TUI command reports

- [x] 3.1 Define the structured TUI-only command-report session entry and register its renderer, applying theme at render time, and verify the entry is visible and excluded from LLM context
- [x] 3.2 Route prompt-invoked `/presets status` and `/presets policy` to durable command reports in TUI mode, and verify their report content and warning handling
- [x] 3.3 Keep picker-invoked status and policy output in the shared info dialog with matching report text, and verify dismissal returns to the picker
- [x] 3.4 Keep `/presets show-prompt` as one temporary preview-dialog flow for prompt content, empty states, and errors, and verify prompt text is not persisted in session entries
- [x] 3.5 Route status and policy reports through RPC notifications in RPC mode and verify no custom message is sent to the LLM; verify JSON and print modes remain out of scope

## 4. Aggregate startup warnings

- [x] 4.1 Collect startup warnings from loading, policy, restore, hotkey registration, and policy-default activation and present one combined startup warning where possible, and verify each warning remains identifiable
- [x] 4.2 Verify startup activation produces one combined success outcome and does not emit a duplicate default-activation notification

## 5. Update specifications and integration coverage

- [x] 5.1 Update affected tests for changed output surfaces, session entries, RPC behavior, severity, and message counts, and verify the focused test suites pass
- [x] 5.2 Review all new and changed user-facing prose with humanizer and unslop and verify no unintended AI-style wording remains
- [x] 5.3 Run `mise run check` and verify formatting, type checking, lint, and all tests pass
