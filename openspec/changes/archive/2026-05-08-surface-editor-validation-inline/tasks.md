## 1. State refactor

- [x] 1.1 In `src/ui/editor.ts`, replace `private error: string | undefined` with two new fields: `private fieldErrors: Map<EditorRowId, string> = new Map()` and `private flowError: string | undefined`.
- [x] 1.2 Remove every assignment to the old `this.error`. Identify each call site in `validateForSave`, `runAsync`'s catch block, the confirmation-dialog decline path, and any other place currently writing to `this.error`.

## 2. Validator refactor

- [x] 2.1 Define a `ValidationResult` discriminated union: `{ ok: true } | { ok: false; fieldErrors: ReadonlyMap<EditorRowId, string>; flowError?: string }`.
- [x] 2.2 Refactor `validateRequired()` to collect all required-field failures into a fresh `Map<EditorRowId, string>` rather than returning the first failure. Specifically: check Name (set `errors.set("name", "Name is required.")` when empty), Provider (`"provider", "Provider is required."`), and Model (`"model", "Model is required."`) independently. Return `{ ok: errors.size === 0, ... }`.
- [x] 2.3 Refactor `validateForSave()` to invoke `validateRequired()`, then add hotkey-parse errors (under key `"hotkey"`) and name-collision errors (under key `"name"`) to the same map. Confirmation-dialog flows for Pi built-in / conflict still resolve synchronously; on decline, return `{ ok: false, fieldErrors: new Map(), flowError: "Save cancelled." }`.
- [x] 2.4 Update the Save / Test runners to read from the new `ValidationResult` shape: on `ok: false`, write `fieldErrors` into `this.fieldErrors` and `flowError` into `this.flowError`, then short-circuit. On `ok: true`, proceed with the persistence path.

## 3. Render path

- [x] 3.1 In each row's render method (`renderNameRow`, `renderHotkeyRow`, `renderInstructionsRows`, the inline render for Provider, Model, Thinking, Tools, etc.), append a dim error-coloured line when `this.fieldErrors.get(<row>)` is set. Use the same 4-space indentation other inline hints use. Place the error AFTER any existing inline status hint for the row.
- [x] 3.2 Add a small helper (e.g. `private renderFieldError(row: EditorRowId): string | undefined`) that returns the formatted error line or `undefined`, to keep the render branches readable.
- [x] 3.3 In `renderMessages()`, replace the `this.error` rendering with `this.flowError`. Keep the same colour and indentation. Confirm the hotkey-reload notice is unaffected.

## 4. Clearing rules

- [x] 4.1 Add a `private clearFieldErrorsFor(row: EditorRowId): void` helper that always deletes `this.fieldErrors.get(row)` and applies the cross-field coupling (scope→name, provider→model) per the spec.
- [x] 4.2 In each input handler that mutates form state, call `clearFieldErrorsFor(<the affected row>)` after applying the input. Specifically: name input handler, hotkey input handler, scope cycling, provider selection, model selection.
- [x] 4.3 At the top of every Save and Test runner (before validation), call `this.fieldErrors.clear()` and set `this.flowError = undefined` so stale errors never linger across attempts.
- [x] 4.4 Verify rows with no validation today (Thinking, Tools, Prompt) do NOT call `clearFieldErrorsFor` on input — they have nothing to clear. Their input handlers SHALL NOT touch `fieldErrors` at all.

## 5. Tests

- [x] 5.1 Add a test: open a new editor (Name empty, Provider empty, Model empty), press Ctrl+S, render, assert the rendered output contains `"Name is required."` near the Name row, `"Provider is required."` near the Provider row, and `"Model is required."` near the Model row, simultaneously.
- [x] 5.2 Add a test: open with all three required empty, press Save, type one character into Name, render, assert `"Name is required."` is gone but the Provider and Model errors still render.
- [x] 5.3 Add a test: open with all required empty, press Save, change Provider to a valid value, render, assert BOTH Provider and Model errors are gone (cross-field clearing).
- [x] 5.4 Add a test: open with a name-collision setup (existing preset with same name in same scope), press Save, render, assert the inline Name error reads the collision message AND no error appears in the bottom message strip.
- [x] 5.5 Add a test: in the collision scenario, change Scope, render, assert the Name error is cleared even though the user has not pressed Save yet.
- [x] 5.6 Add a test: trigger the Save-cancelled flow (Pi-builtin hotkey + decline), render, assert `"Save cancelled."` appears in the bottom message strip AND no inline field error is set.
- [x] 5.7 Update existing tests that asserted on the old `this.error` rendering in the bottom strip; relocate those assertions to the inline location of the appropriate row.
- [x] 5.8 Add a test: cycle the Thinking radio after a Save with multiple field errors; assert the field errors are unchanged (Thinking has no validation; cycling does not clear other rows' errors).

## 6. Verification

- [x] 6.1 Run `mise run check` and resolve any failures.
- [x] 6.2 Run `openspec validate --strict preset-editor` to confirm the synced spec validates.
- [x] 6.3 Manually open a new preset editor (no prefill) and immediately press Ctrl+S; confirm three inline errors appear simultaneously beneath Name, Provider, and Model.
- [x] 6.4 Manually verify each clearing rule: type into Name (Name error clears); pick Scope (Name error clears); pick Provider (Provider AND Model errors clear); pick Model (Model error clears); type into Hotkey (Hotkey error clears).
- [x] 6.5 Manually verify the Save-cancelled flow: configure a hotkey matching a Pi built-in, press Save, decline the confirmation; confirm `"Save cancelled."` appears in the bottom message strip and no inline field error appears.
- [x] 6.6 Manually verify that a successful Save with valid values clears any previous field errors (e.g. fix all three errors and Save successfully).
