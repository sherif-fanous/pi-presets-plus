## 1. Pure helper: `clampScrollToFit`

- [x] 1.1 Add `clampScrollToFit(state: PickerState, packedCount: number, visibleCount: number): PickerState` to `src/ui/picker-state.ts`. Behavior per design.md "`clampScrollToFit` is the new pure helper" section.
- [x] 1.2 Export the helper alongside the existing `moveSelection`, `cycleScope`, `preserveSelectionOrFirst`, etc.
- [x] 1.3 Unit tests for `clampScrollToFit` covering: no-op when selection in range, downward correction when selection past end of pack, idempotency on repeated application, `packedCount === 0` and `visibleCount === 0` short-circuits, and clamping when corrected offset would exceed `visibleCount - packedCount`.

## 2. Render contract: `renderList` returns a result object

- [x] 2.1 Define `interface RenderListResult { lines: string[]; correctedScrollOffset?: number }` in `src/ui/picker.ts` (or co-located with `renderList`).
- [x] 2.2 Change `renderList(width: number): string[]` to `renderList(width: number): RenderListResult`.
- [x] 2.3 In the body of `renderList`, after the greedy pack loop, check whether `state.selectedIndex` is in `[state.scrollOffset, state.scrollOffset + renderedCards - 1]`. If yes, return `{ lines }`. If no, compute the corrected offset, re-pack once with the corrected offset, return `{ lines: <repacked>, correctedScrollOffset: <corrected> }`.
- [x] 2.4 Update every caller of `renderList` in `picker.ts` to destructure the result.
- [x] 2.5 In the component's outer `render(width)`, if the result carries a `correctedScrollOffset`, apply it via `clampScrollToFit(this.state, renderedPageSize, visibleCount)` and assign the resulting state to `this.state`. Only update `this.state` when a correction actually fires (no-op when omitted).
- [x] 2.6 Ensure `this.renderedPageSize` reflects the _final_ pack's count, not the first (discarded) pack when a correction fires.

## 3. Behavior coverage paths

- [x] 3.1 Confirm Up (`Key.up`) routes through `moveSelection(-1)` and is naturally safe (the upward path of `ensureSelectionVisible` anchors `scrollOffset` to `selectedIndex`, which is always the first packed card). Add a regression test asserting Up never triggers a `correctedScrollOffset`.
- [x] 3.2 Confirm Down (`Key.down`) routes through `moveSelection(1)` and benefits from the correction. Regression test asserts the selected card is in the rendered output after `pageSize + 3` consecutive Down presses.
- [x] 3.3 Confirm PgUp routes through `moveSelection(-pageSize, { wrap: false })` and is naturally safe (same reasoning as Up). Regression test asserts PgUp never triggers a correction.
- [x] 3.4 Confirm PgDn routes through `moveSelection(pageSize, { wrap: false })` and benefits from the correction. Regression test asserts the selected card is in the rendered output after one PgDn from a position near a card-height boundary.
- [x] 3.5 Confirm Filter-mode arrow handling (`handleFilterInput` in `picker.ts` around line 626) routes to the same `moveSelection` and therefore benefits from the same render-time correction without separate wiring.

## 4. Test fixture: heterogeneous card heights

- [x] 4.1 Add a fixture builder in `tests/ui/picker-fixtures.ts` (or inline in the test file) that constructs a list of `LoadedPreset` records mixing presets that have `instructions` (producing a `Prompt:` row) with presets that don't, and mixing presets with one of `clampWarning`, `hotkeyConflict`, `hotkeyShadowsBuiltin`, `availabilityStatus`, `shadowed`, and (active + dirty + driftReasons) so each variable-height row type is represented.
- [x] 4.2 Drive the picker through a sequence of Down presses (or PgDn) with `fixedPageSize` undefined (so the greedy packer is exercised). After each navigation step, render at a known terminal width and assert the currently-selected preset's name appears in the rendered output.
- [x] 4.3 Drive the same fixture with Up and PgUp; assert these directions never produce a `correctedScrollOffset` (regression-pin the property that the upward paths are safe by construction).
- [x] 4.4 Add an end-to-end test that reproduces the user-reported pattern: ~18 presets, ~9-card visible window, 12 consecutive Down presses; assert that at every step the selected card is rendered and `state.selectedIndex` matches the expected position (i.e. no presets are "skipped").

## 5. Tests at the pure-helper layer

- [x] 5.1 `tests/ui/picker-state.test.ts` — add tests for `clampScrollToFit` per task 1.3.
- [x] 5.2 Add a test that constructs a stale `state` (selectedIndex past the packed range) and confirms `clampScrollToFit` produces a state whose `selectedIndex` is inside `[scrollOffset, scrollOffset + packedCount - 1]`.

## 6. Verification

- [x] 6.1 `mise run check` clean (format-check, type-check, lint, test).
- [x] 6.2 Manual smoke test (matches the user-reported repro): open `/presets` with ~18 mixed-scope presets, press Down 12+ times, observe the selection marker remains visible every press, no presets are skipped.
- [x] 6.3 Manual smoke test: press PgDn from the top of the list, observe the selected card lands in view; press PgDn again at the boundary where card heights differ, observe the selected card remains visible.
- [x] 6.4 Manual smoke test: open the picker with a preset that has a `hotkeyShadowsBuiltin` warning or `clampWarning` (force one if necessary by hand-editing the JSON), scroll past it, confirm the selected card stays visible across the variable-height transition.
- [x] 6.5 `openspec validate fix-picker-keeps-selection-visible-when-card-heights-vary --strict`.
