## ADDED Requirements

### Requirement: Picker keeps the selected card visible regardless of card-height variation

The picker SHALL guarantee that the currently-selected preset's card is included in the rendered output on every frame, regardless of card-height variation across the visible window. Card height varies based on which optional rows the preset triggers (presence of an `instructions` Prompt row; presence of `clampWarning`, `hotkeyConflict`, `hotkeyShadowsBuiltin`, availability status, `Drift:` for an active+dirty preset, or `Shadowing:` for a shadowed preset in scope=all view).

When the picker's greedy line-budget packer cannot include the selected card in the packed range starting at the current `scrollOffset` (because the new mix of card heights in view fits fewer cards than the previous render's `renderedPageSize` had implied), the picker SHALL re-anchor `scrollOffset` to `selectedIndex - packedCount + 1` (clamped to `[0, visibleCount - packedCount]`), re-pack once with the corrected offset, and propagate the corrected offset back into picker state before the next user keystroke.

The correction SHALL be the responsibility of the render layer, not the state-transition layer. `moveSelection` and `cycleScope` SHALL continue to use the existing `ensureSelectionVisible` math (which is correct when `pageSize` matches reality), and the render layer SHALL detect and correct any disagreement between that math and the actual packed count.

Upward navigation paths (`↑` arrow and `PgUp`) SHALL NOT trigger a correction in practice: their existing `ensureSelectionVisible` math anchors `scrollOffset` to `selectedIndex` itself, which is by construction the first card the packer renders. The contract above does not depend on this property — the correction is still safe to apply to upward paths — but tests SHALL pin the property as a regression guard.

The picker's exported state helper SHALL include a pure `clampScrollToFit(state, packedCount, visibleCount)` function that, given the just-measured packed count, returns a state with `scrollOffset` adjusted (or unchanged) so that `selectedIndex` falls within `[scrollOffset, scrollOffset + packedCount - 1]`. The function SHALL be idempotent: applying it to its own output SHALL return the same state.

#### Scenario: Selected card stays visible after a Down press into a region of taller cards

- **WHEN** the picker is rendered with `scrollOffset = N`, the greedy packer fits `M` cards starting at `N`, and the user presses `↓` from a selection where `state.selectedIndex = N + M - 1`
- **AND** after `moveSelection(1)` the state has `selectedIndex = N + M`, and `ensureSelectionVisible` advances `scrollOffset` to `state.selectedIndex - oldPageSize + 1`
- **AND** the next render's greedy pack (with the new top card being one line taller, e.g. a Prompt row appearing) fits only `M - 1` cards starting at the new offset
- **THEN** the picker SHALL re-anchor `scrollOffset` to `selectedIndex - (M - 1) + 1` and re-pack
- **AND** the rendered output SHALL include the preset at `state.selectedIndex`
- **AND** the corrected `scrollOffset` SHALL be propagated back into `state` before the next user keystroke is processed

#### Scenario: Selected card stays visible after a PgDn into a region of taller cards

- **WHEN** the user presses `PgDn` from any position
- **AND** the new selection would otherwise fall outside the greedy pack's range at the post-`moveSelection` `scrollOffset`
- **THEN** the picker SHALL re-anchor `scrollOffset` and re-pack so the selected card is rendered

#### Scenario: Upward paths do not trigger a render-time correction

- **WHEN** the user presses `↑` or `PgUp` from any position
- **THEN** the greedy pack starting at the new `scrollOffset` SHALL always include `state.selectedIndex` as the first packed card
- **AND** no scroll-offset correction SHALL fire

#### Scenario: `clampScrollToFit` is idempotent

- **WHEN** `clampScrollToFit(state, packedCount, visibleCount)` returns `state'`
- **AND** `clampScrollToFit(state', packedCount, visibleCount)` is called
- **THEN** the result SHALL equal `state'`

#### Scenario: Reproduces the user-reported pattern of 18 presets, 9 visible, 12 consecutive Down presses

- **WHEN** the picker is opened with 18 presets across user and project scopes, the first render packs 9 cards, and the user presses `↓` 12 times in sequence
- **THEN** at every step the rendered output SHALL include the preset at `state.selectedIndex`
- **AND** no preset SHALL be skipped (i.e. for `k = 1..12`, after the `k`-th press, `state.selectedIndex` SHALL equal `k` and the visible-presets entry at index `k` SHALL appear in the rendered output)

#### Scenario: `renderList` returns a corrected offset when the packer disagreed with the state

- **WHEN** `renderList(width)` is called with a state whose `selectedIndex` would not be included in the greedy pack starting at `scrollOffset`
- **THEN** the return value SHALL be `{ lines: <re-packed lines>, correctedScrollOffset: <corrected offset> }`
- **AND** the re-packed lines SHALL include the card at `state.selectedIndex`

#### Scenario: `renderList` omits `correctedScrollOffset` when no correction was needed

- **WHEN** `renderList(width)` is called with a state whose `selectedIndex` falls within the greedy pack's range
- **THEN** the return value SHALL be `{ lines }` (no `correctedScrollOffset` field)
