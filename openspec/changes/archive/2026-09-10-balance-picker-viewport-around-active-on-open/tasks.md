## 1. Layout helper

- [x] 1.1 Add unit tests in `tests/ui/picker-layout.test.ts` for an
      opening-balanced layout option: selected card below the top-packed
      viewport lands near the vertical midpoint, and the viewport includes at
      least one later card when later cards exist.
- [x] 1.2 Add boundary tests in `tests/ui/picker-layout.test.ts`: active preset
      near the start clamps to `startIndex: 0`, active preset near the end packs
      through the final item when possible, and an oversized selected card
      remains the only visible card.
- [x] 1.3 Implement the opening-balanced layout path in
      `src/ui/picker-layout.ts`, preserving the existing default behavior when
      the option is absent; verify the new layout tests pass and existing
      variable-height navigation tests still pass.

## 2. Picker integration

- [x] 2.1 Add a one-shot opening-balance flag to `PresetPickerComponent` that is
      true only when the picker opens with an active preset found in the loaded
      list; verify no-active and missing-active opens keep the top-start
      viewport.
- [x] 2.2 Pass the balanced layout option from `renderList` only while the
      one-shot flag is set, then clear the flag after that render; verify a
      second render without input uses the normal layout path.
- [x] 2.3 Keep navigation, filtering, scope cycling, refreshes, and dialog
      dismissals on the existing layout behavior; verify with regression tests
      that Down after open follows the current scroll correction instead of
      re-centering.

## 3. Picker tests

- [x] 3.1 Update or add picker-level tests in
      `tests/ui/picker-initial-selection.test.ts` so an active preset below the
      fold appears near the middle of the first frame with content after it.
- [x] 3.2 Add picker-level tests for top and bottom clamps on open with an
      active preset.
- [x] 3.3 Add picker-level fallback tests showing no-active and missing-active
      opens still select the first card and start at the top.

## 4. Documentation

- [x] 4.1 Check `README.md` for any statement about where the picker viewport
      starts and update it only if one exists.

## 5. Verification

- [x] 5.1 Run `mise run check` and confirm it passes clean.
- [x] 5.2 Manual smoke test: activate a preset in the middle of a long list,
      reopen `/presets`, and confirm the active card appears with visible
      context above and below; then activate one near the start and one near the
      end and confirm the viewport clamps naturally.
- [x] 5.3 Run
      `openspec validate balance-picker-viewport-around-active-on-open --strict`.
