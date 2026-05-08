## 1. Helper simplification

- [x] 1.1 In `src/ui/editor.ts`, change the exported `snapThinkingSelection(state, model)` function to return `EditorFormState` directly (no `{ state, notice }` wrapper). When the current level is valid, return `state` unchanged; otherwise return `{ ...state, thinkingLevel: "off" }`.
- [x] 1.2 Update `snapThinkingSelection`'s JSDoc to drop the notice description and to state that callers consume the returned state directly.

## 2. Editor lifecycle simplification

- [x] 2.1 In `src/ui/editor.ts`, simplify `snapThinkingIfInvalid()` to a single assignment: `this.state = snapThinkingSelection(this.state, this.currentModel());`.
- [x] 2.2 Delete the `private notice: string | undefined` field from the editor class.
- [x] 2.3 Update the constructor's existing comment about the no-snap-on-open guarantee so it no longer mentions the notice; the guarantee is unchanged but its rationale shrinks (no notice to suppress).

## 3. Render path cleanup

- [x] 3.1 In `renderMessages()`, remove the line that pushes `this.notice` into the rendered output. Verify the function still renders the hotkey-reload notice and the error strip; nothing else should change.
- [x] 3.2 Confirm `renderThinkingRows()` is unaffected — it should continue to render the radio and the static "Dimmed levels are unavailable for this model." hint exactly as today.

## 4. Tests

- [x] 4.1 Find every existing test that asserts the snap notice appears (anywhere — bottom message strip or Thinking row region) and update or delete it. The notice is no longer rendered in any path.
- [x] 4.2 Update the test for "Changing model invalidates current selection" to assert only the radio snap (selected level moves to `"off"`); remove any assertion about notice text.
- [x] 4.3 Update the test for "Opening editor for a clamp-warning preset does not mutate selection" to drop the no-notice assertion (which is now vacuously true) and keep the assertion about the form's selected level remaining at the declared value.
- [x] 4.4 Add a regression test for the new scenario "No notice rendered after a snap": construct an editor state, drive a model change that causes a snap, render, and assert the rendered output contains neither the literal string `"does not support extended thinking"` nor any other text introduced by the previous snap notice. Assert the dimmed-levels hint and `● off` radio are still present.
- [x] 4.5 If `snapThinkingSelection` has direct unit tests, update them to assert the new return shape (a plain `EditorFormState`).

## 5. Verification

- [x] 5.1 Run `mise run check` (format-check, type-check, lint, test) and resolve any failures.
- [x] 5.2 Manually walk through the four scenarios that originally exposed the path-dependent behavior:
  - (a) Reasoning model + `level=high` → non-reasoning model. Confirm radio snaps to `● off`, dimmed-levels hint visible, no notice text.
  - (b) Non-reasoning model + `level=off` → another non-reasoning model. Confirm dimmed-levels hint visible, no notice text, no surprise behavior.
  - (c) Non-reasoning model + `level=off` → reasoning model. Confirm dimmed-levels hint disappears, all valid levels selectable, no notice text.
  - (d) Reasoning model + `level=off` → non-reasoning model. Confirm dimmed-levels hint appears, radio still on `● off`, no notice text.
- [x] 5.3 Manually open the editor for a saved preset with `thinkingLevel: "high"` whose resolved model is non-reasoning (clamp-warning preset). Confirm the form opens with `level=high` selected (no snap on open), no notice rendered, and saving without edits round-trips `thinkingLevel: "high"`.
