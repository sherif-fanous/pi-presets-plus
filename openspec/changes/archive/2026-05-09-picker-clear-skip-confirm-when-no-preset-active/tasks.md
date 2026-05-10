## 1. Implementation

- [x] 1.1 In `src/ui/picker.ts` `clearActivePreset()`, add an early-return guard immediately after the existing `if (!this.pi)` short-circuit: if `this.session.current()` is `undefined`, open an info-dialog (using `runWithHiddenOverlay` + `openInfoDialog`) with title `"Clear Unavailable"` and body `"No preset is active."`, then return.
- [x] 1.2 Confirm the existing happy-path flow (confirm → `clearReturning` → render summary in info-dialog) is unchanged when a preset is active.
- [x] 1.3 If `"No preset is active."` (the body string) and `"Clear Unavailable"` (the title) are not already centralized in `src/ui/labels.ts`, leave them inline at the call site for now — both are single-occurrence after this change. (If a follow-up change introduces a third use site, lift them into `labels.ts` then.)

## 2. Tests

- [x] 2.1 Add a scenario in `tests/ui/picker-info-actions.test.ts` (or the closest equivalent picker-actions test file) covering "press `c` with no preset active": assert no confirm dialog is opened, an info-dialog appears with the documented title and body, and the underlying clear engine is not invoked.
- [x] 2.2 Add a scenario covering "press `c` with a preset active": assert the existing confirm-then-clear-then-summary path runs unchanged.
- [x] 2.3 Run `mise run check`. No goldens for `/presets clear` (the slash-command path) should change because that path is untouched.

## 3. Validation

- [x] 3.1 Run `mise run check` end-to-end (format, lint, type-check, test).
- [x] 3.2 Run `openspec validate picker-clear-skip-confirm-when-no-preset-active --strict`.
- [x] 3.3 Manual smoke test: open the picker with no preset active, press `c`, observe the info-dialog (no confirm prompt). Then activate a preset, press `c`, confirm, observe the summary dialog. Both paths render identically to today except for the new short-circuit.
