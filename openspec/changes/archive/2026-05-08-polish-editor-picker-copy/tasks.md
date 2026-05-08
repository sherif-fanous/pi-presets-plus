## 1. Editor copy strings

- [x] 1.1 In `src/ui/editor.ts`, change the `session` tools-mode hint string in `renderToolsRows()` from `"Session: whatever tools are active right now pass through unchanged."` to `"Session: inherits the active tool set."`.
- [x] 1.2 Define a constant `PROMPT_NEWLINE_HINT = "Enter inserts a newline. Tab exits."` near the existing `EMPTY_INPUT_PLACEHOLDER` constant. In `renderInstructionsRows()`, replace the inline literal `"Enter Newline · Tab Exit"` with `PROMPT_NEWLINE_HINT`.
- [x] 1.3 Update any source-code comments that reference the old `Session: whatever ...` or `Enter Newline · Tab Exit` strings.

## 2. Footer collapse + Tab symbol

- [x] 2.1 In `src/ui/editor.ts`, replace the existing `renderFooterHints(): string[]` method (which returns two lines) with a new `renderFooterHint(): string` returning a single dim-coloured hint string. The hint SHALL contain the tokens `⇥/↑/↓ Move`, `←/→ Change`, `Space Toggle`, `Enter Action`, `^S Save`, `Esc Cancel`, joined with `·`, and SHALL include `^T Test` (between `^S Save` and `Esc Cancel`) when `this.options.onTest !== undefined`.
- [x] 2.2 In the dialog's main `render()` method, replace the spread `...this.renderFooterHints().map((hint) => frameLine(this.theme.fg("dim", hint), frameWidth))` with a single `frameLine(this.theme.fg("dim", this.renderFooterHint()), frameWidth)`.
- [x] 2.3 Confirm via inspection that the resulting line is at most ~88 visual columns when all seven tokens are present (with the leading space).

## 3. Branched dimmed-levels hint

- [x] 3.1 In `src/ui/editor.ts`, inside the exported `renderThinkingRowsForState(theme, state, model, focused)`, change the `valid.length < THINKING_LEVELS.length` block to compute a `message` based on `model?.reasoning === false`: when true, use `"This model does not support thinking."`; otherwise use `"Dimmed levels are unavailable for this model."`.
- [x] 3.2 Push the chosen message via `theme.fg("dim", ` ${message}`)` (preserving the existing 4-space indentation prefix).
- [x] 3.3 Add a brief comment near the branch noting that the dimmed branch can never fire when `model` is undefined (because `validThinkingLevels(undefined)` returns the full set), so `model?.reasoning === false` is the complete branch condition.

## 4. Picker card Scope and Model values

- [x] 4.1 In `src/ui/widgets.ts`, in `PresetCardComponent.render()`, replace `this.theme.fg("muted", formatScopeValue(this.loadedPreset))` with `formatScopeValue(this.loadedPreset)` for the Scope row.
- [x] 4.2 Similarly, replace `this.theme.fg("muted", `${this.loadedPreset.provider} / ${this.loadedPreset.model}`)` with the bare template literal for the Model row.
- [x] 4.3 Confirm Scope and Model labels (the `${SCOPE_LABEL}:` and `${MODEL_LABEL}:` arguments to `renderField`) continue to render in `muted` color so label-vs-value contrast is restored.

## 5. Picker card availability status copy

- [x] 5.1 In `src/ui/widgets.ts`, in `formatAvailabilityStatus()`, replace `"Unavailable — missing API key."` with `"This preset's provider has no API key configured."`.
- [x] 5.2 Replace `"Unavailable — model not found."` with `"This preset's model is no longer available."`.
- [x] 5.3 Verify the surrounding `Status:` label rendering and the `⚠` glyph in `PresetCardComponent.render()` remain unchanged.

## 6. Tests

- [x] 6.1 Update `tests/ui/editor-input-ux.test.ts`'s footer test to assert the single-line form: a single string containing all seven tokens (or six when no test callback) and `⇥` (instead of the literal `Tab`). Drop the multi-line assertion.
- [x] 6.2 In the same file, update or add a test asserting the Prompt row's inline hint reads `"Enter inserts a newline. Tab exits."`.
- [x] 6.3 Add a test asserting the tools-mode session hint reads `"Session: inherits the active tool set."` when the row is in session mode.
- [x] 6.4 In `tests/ui/editor-helpers.test.ts`, update the `renderThinkingRowsForState` test that today asserts `"Dimmed levels are unavailable for this model."` to additionally cover the non-reasoning branch: render with a `reasoning: false` model and assert the rendered output contains `"This model does not support thinking."` and NOT `"Dimmed levels are unavailable for this model."`.
- [x] 6.5 Verify the existing reasoning-with-partial-map case still produces the original wording `"Dimmed levels are unavailable for this model."` (add a dedicated test if not already covered).
- [x] 6.6 If picker-card or availability-status tests exist, update them to assert the new copy strings (`"This preset's provider has no API key configured."` and `"This preset's model is no longer available."`) and to assert the absence of the `"Unavailable —"` prefix.
- [x] 6.7 If picker-card colour assertions exist, update them to assert Scope and Model values are NOT wrapped in a `muted` color call (and labels still are).

## 7. Verification

- [x] 7.1 Run `mise run check` and resolve any failures.
- [x] 7.2 Run `openspec validate --strict preset-editor` and `openspec validate --strict preset-picker` to confirm the synced specs validate.
- [x] 7.3 Manually open the editor for a new preset; confirm the Tools row's session hint reads `"Session: inherits the active tool set."` and the Prompt row's hint reads `"Enter inserts a newline. Tab exits."`.
- [x] 7.4 Manually open the editor and select a non-reasoning model; confirm the inline hint beneath Thinking reads `"This model does not support thinking."`. Then select a reasoning model whose `thinkingLevelMap` lacks an explicit `xhigh`; confirm the hint reads `"Dimmed levels are unavailable for this model."`.
- [x] 7.5 Manually inspect the editor footer; confirm one dim line with `⇥` for Tab, all seven tokens, and a `^T Test` token only when the editor was opened with a test callback.
- [x] 7.6 Manually open the picker; confirm Scope and Model values render in default text color (clearly distinguishable from their muted labels), and confirm an unavailable preset's `Status:` row reads with the new sentence-cased copy.
