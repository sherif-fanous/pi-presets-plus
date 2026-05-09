## 1. State refactor: severity-tagged diagnostics

- [x] 1.1 In `src/ui/editor.ts`, define `type FieldDiagnostic = { severity: "error" | "warning"; message: string };`. Replace `private fieldErrors: Map<EditorRowId, string>` with `private fieldDiagnostics: Map<EditorRowId, FieldDiagnostic>`.
- [x] 1.2 Update the `ValidationResult` discriminated union: both `{ ok: true }` and `{ ok: false }` variants now carry `fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>`. The `ok: false` variant retains its optional `flowError`. Drop the alternative shape.
- [x] 1.3 Rename `clearFieldErrorsFor(row)` → `clearFieldDiagnosticsFor(row)`. The implementation already deletes the row's entry and applies cross-field coupling; only the name and the value-shape consumed downstream change.
- [x] 1.4 Rename `applyValidationFailure(result)` → `applyValidationDiagnostics(result)` and have it accept either ok-true or ok-false results, copying `fieldDiagnostics` from either and `flowError` only from ok-false.

## 2. Validator pipeline: warnings instead of confirms

- [x] 2.1 In `validateForSave()`, remove the two `await this.confirm(...)` calls keyed on `HOTKEY_SHADOWS_TITLE` and `HOTKEY_CONFLICT_TITLE`. Remove the corresponding early-return decline paths that produced `flowError: "Save cancelled."`.
- [x] 2.2 Replace each removed confirm with a `fieldDiagnostics.set("hotkey", { severity: "warning", message: ... })` call.
- [x] 2.3 Combined-condition behavior: the existing code only fires whichever check matched first (Pi-builtin OR conflict). Keep that v1 behavior but emit a brief code comment noting the limitation and pointing at this design's "Risks / Trade-offs" entry.
- [x] 2.4 At the end of `validateForSave`, compute `hasError = [...fieldDiagnostics.values()].some(d => d.severity === "error")`. Return `{ ok: !hasError, fieldDiagnostics }` (no `flowError` since we no longer produce one from validation).
- [x] 2.5 Update `validateRequired()` to also return `fieldDiagnostics` instead of `fieldErrors`. Its three checks all set `severity: "error"` on the produced entries.
- [x] 2.6 Remove the `HOTKEY_SHADOWS_TITLE` and `HOTKEY_CONFLICT_TITLE` constants if not used elsewhere; remove the corresponding imports.

## 3. Proactive recompute on Hotkey edit

- [x] 3.1 Add a new private helper `recomputeHotkeyDiagnostic()`: clears the Hotkey diagnostic, parses the current hotkey value, and sets either an error (parse failure) or a warning (Pi-builtin or other-preset conflict) per the validator's logic.
- [x] 3.2 Call `recomputeHotkeyDiagnostic()` from the Hotkey row's input handler immediately after applying the typed input and before the existing `clearFieldDiagnosticsFor("hotkey")` invocation. Note: the recompute _replaces_ the explicit clear-then-set behavior — the recompute starts by deleting the entry, so a separate `clearFieldDiagnosticsFor("hotkey")` call would just no-op afterwards. Drop the redundant clear call.
- [x] 3.3 Verify the proactive path uses the same wording as the Save-time path so a user pressing Save sees no message change between the two render passes.

## 4. Render path

- [x] 4.1 Rename `withFieldError` → `withFieldDiagnostic` and `renderFieldError` → `renderFieldDiagnostic`. The renamed helpers branch on the diagnostic's `severity` to choose between `error` (red) and `warning` (yellow) theme colors.
- [x] 4.2 Verify all call sites pass through unchanged (the helper signature still takes `(line, row)` for `withFieldDiagnostic`).

## 5. Save / Test runners

- [x] 5.1 In `save()`, change the `if (!validation.ok)` branch to call `applyValidationDiagnostics(validation)` and short-circuit. The success branch SHALL also apply diagnostics from the `ok: true` result so warnings are visible during the (brief) period before the editor closes on success.
- [x] 5.2 In `testPreset()`, mirror the change: `validateRequired()` may now return diagnostics on either ok branch; route both through `applyValidationDiagnostics` before deciding whether to short-circuit.
- [x] 5.3 Confirm the persist-failure path (`if (!result.ok) this.flowError = result.reason`) still works — `flowError` is unchanged by this refactor.

## 6. Tests

- [x] 6.1 Drop the test "keeps Save-cancelled flow errors in the bottom message strip" (no path produces `"Save cancelled."` anymore). If you want to keep a flow-error test, replace it with one that simulates a persist failure and asserts the persist `reason` lands in the bottom strip.
- [x] 6.2 Drop the `openConfirm.mockResolvedValueOnce(false)` setup specific to hotkey-conflict / Pi-builtin paths. The `openConfirm` mock as a whole STAYS (it's used by the scope-change confirmation, which is unaffected by this change).
- [x] 6.3 Add a test "warns inline when the Hotkey shadows a Pi built-in": opens the editor, types a Pi-builtin hotkey (e.g. `ctrl+l` if that's documented), asserts the Hotkey row renders a warning line containing `"shadows a Pi built-in"`.
- [x] 6.4 Add a test "warns inline when the Hotkey conflicts with another preset": similar shape, uses an existing preset's hotkey, asserts the warning line contains `"is already used by preset \"<name>\""`.
- [x] 6.5 Add a test "Save proceeds when only warnings are present": valid required fields + Pi-builtin hotkey, presses Save, asserts the persist mock is called.
- [x] 6.6 Add a test "Save is refused when at least one error is present alongside a warning": empty Name + conflicting Hotkey, presses Save, asserts the persist mock is NOT called and both diagnostics render.
- [x] 6.7 Add a test asserting the proactive recompute: open editor, type a conflicting hotkey character-by-character, assert the warning appears as soon as the typed value matches the conflicting hotkey (without pressing Save).
- [x] 6.8 Add a test asserting `clearFieldDiagnosticsFor("hotkey")` clears both errors and warnings: set up a state with a hotkey error (malformed) AND change to a state with a conflict warning, confirm both clear correctly when the user types into Hotkey.
- [x] 6.9 Update the test "renders name collisions inline without a bottom-strip error" if its assertion path inspects the diagnostic shape (it probably doesn't — most assertions are on rendered output text).

## 7. Verification

- [x] 7.1 Run `mise run check` and resolve any failures.
- [x] 7.2 Run `openspec validate --strict preset-editor` and confirm the synced spec validates.
- [x] 7.3 Manually open the editor, type a hotkey matching another preset's hotkey (e.g. an existing `ctrl+m`); confirm the inline yellow warning appears beneath the Hotkey row before pressing Save AND that pressing Save proceeds (no modal, file is written).
- [x] 7.4 Manually type a Pi built-in hotkey (e.g. `ctrl+l`); confirm the inline yellow warning appears AND saving proceeds.
- [x] 7.5 Manually verify that after saving a Pi-builtin-shadowing preset, the picker card surfaces the `⚠ Hotkey shadows a Pi built-in.` Status row (this requires `unify-picker-status-and-shadow-flag` to be applied first — it's a prerequisite).
- [x] 7.6 Manually edit a preset to make its hotkey malformed (e.g. typing gibberish); confirm the inline RED error appears AND Save is refused.
- [x] 7.7 Manually mix conditions: empty Name + Pi-builtin hotkey; confirm both diagnostics render simultaneously, Save is refused (because of the error), pressing Tab into Name and typing a value clears the Name error but the Hotkey warning persists, and Save then proceeds with the warning still rendered briefly before the editor closes.
