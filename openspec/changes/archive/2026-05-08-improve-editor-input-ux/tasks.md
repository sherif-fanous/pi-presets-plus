## 1. Focus-aware rendering for Name and Hotkey

- [x] 1.1 In `src/ui/editor.ts`, extract the Name row rendering from `renderRows()` into a `renderNameRow(width: number): string` helper that branches on `this.currentRow() === "name"`. When focused, render via `this.nameInput.render(...)` (existing behavior). When unfocused, render via `renderValueRow` with the value (or the placeholder when empty).
- [x] 1.2 Do the same for the Hotkey row: extract a `renderHotkeyRow(width: number): string` helper with the same focused-vs-unfocused branching against `this.hotkeyInput`.
- [x] 1.3 Replace the inline Name and Hotkey rows in `renderRows()` with calls to the new helpers.
- [x] 1.4 Verify that `nameInput` and `hotkeyInput` `Input` instances are still updated on input even though `render()` is no longer called when their row is unfocused. (No change expected — `setInputValueCursorAtEnd` runs once at construction; `handleInput` updates them while focused; the unfocused branch only skips rendering, not state.)

## 2. Empty-state placeholder for Name and Hotkey

- [x] 2.1 Define a single shared placeholder string constant `EMPTY_INPUT_PLACEHOLDER = "—"` (a single em-dash) reused by Name, Hotkey, and the existing Prompt row (replace the Prompt row's inline literal with the constant for one source of truth).
- [x] 2.2 In `renderNameRow` and `renderHotkeyRow`, when the row is unfocused and the value is empty, render `theme.fg("dim", EMPTY_INPUT_PLACEHOLDER)` in place of the value.
- [x] 2.3 Verify the placeholder is suppressed when the row is focused (the `Input` widget's native rendering takes over).

## 3. Global keyboard shortcuts (Ctrl+S / Ctrl+T)

- [x] 3.1 Audit pi-tui's `Input.handleInput` and the multi-line text area's input handling to confirm neither consumes `Ctrl+S` or `Ctrl+T`. Document the audit result in a comment near the new shortcut block.
- [x] 3.2 Refactor the existing button-activation logic so Save / Cancel / Test action dispatch lives in a single `activateButton(action: ButtonAction): void` method (or similar) callable from both the on-screen button row and the new shortcuts.
- [x] 3.3 In `handleInput`, after the existing `Esc` interception and before the `Tab`/arrow handling, intercept `Ctrl+S` and call `activateButton("save")`. Return early so the focused row's handler does not see the keystroke.
- [x] 3.4 Intercept `Ctrl+T` similarly, gated on `this.options.onTest !== undefined`. When the callback is not wired, do NOT intercept — let the keystroke fall through to the focused row's handler (so users in that case do not get a silent swallow).
- [x] 3.5 Verify `Esc` continues to cancel from any focus state (no behavior change; existing scenario should still pass).

## 4. Footer hint update

- [x] 4.1 Locate the existing footer hint string (the row that today lists movement keys). Extend it to read e.g. `Tab/↑↓ Move · ^S Save · ^T Test · Esc Cancel`.
- [x] 4.2 When `this.options.onTest` is undefined, omit the `· ^T Test` token from the rendered hint.
- [x] 4.3 Confirm the hint fits within typical editor widths; if it wraps awkwardly at narrow widths, accept the wrap (the buttons row remains as the always-visible primary affordance).

## 5. Tests

- [x] 5.1 Add tests that render the editor with focus on a non-Name row and a non-empty Name value, then assert the rendered Name line contains neither `\x1b[7m` (inverse video) nor `> ` prefix.
- [x] 5.2 Add a corresponding test for the Hotkey row.
- [x] 5.3 Add a test that opens the editor for a new preset (empty Name) with focus elsewhere and asserts the Name row contains the dim placeholder text `"—"`.
- [x] 5.4 Add a test that moves focus to the Name row and asserts the row now renders via `Input` (cursor + `> ` prefix present).
- [x] 5.5 Add a test that, with focus on the Prompt text area and all required fields filled, presses `Ctrl+S` and asserts the Save flow runs (file written, editor closed) AND the Prompt buffer was not mutated by the keystroke.
- [x] 5.6 Add a test that presses `Ctrl+S` with a missing required field and asserts the same validation error is surfaced as when the Save button is activated.
- [x] 5.7 Add a test that, with a test callback wired, presses `Ctrl+T` and asserts the test flow runs.
- [x] 5.8 Add a test that, without a test callback wired, presses `Ctrl+T` and asserts no test flow runs and the editor remains open.
- [x] 5.9 Add a test asserting the footer hint contains `^S Save` and `Esc Cancel`, and contains `^T Test` only when the test callback is wired.

## 6. Verification

- [x] 6.1 Run `mise run check` and resolve any failures (formatting, lint, types, tests).
- [x] 6.2 Manually open the editor for an existing preset; confirm Name and Hotkey rows show no block cursor while focus is on Scope, Provider, Model, etc.
- [x] 6.3 Manually open the editor for a new preset; confirm Name and Hotkey rows show the dim `"—"` placeholder while unfocused.
- [x] 6.4 Tab into the Name row; confirm the Input widget's `> ` prefix and cursor appear, and that typing works as before.
- [x] 6.5 With focus in the Prompt text area, press `Ctrl+S` to save and confirm the editor closes and the file is written.
- [x] 6.6 With a test callback wired (via the picker's Test path), press `Ctrl+T` and confirm activation runs.
- [x] 6.7 With no test callback (an editor invocation that does not wire one), press `Ctrl+T` and confirm nothing happens.
- [x] 6.8 In a terminal that suppresses `Ctrl+S` via XOFF flow control (e.g. a default `stty` configuration), verify the user can still save via the Save button — no regression in the always-available path.
