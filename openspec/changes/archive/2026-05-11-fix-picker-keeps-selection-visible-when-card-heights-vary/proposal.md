## Why

The picker's vertical scroll math assumes a fixed `pageSize` — the count of cards
rendered in the previous frame, cached on the component as `renderedPageSize`. The
render itself, however, greedily packs cards into a fixed line budget. When a
preset's card has more lines than the previous frame's tallest card (e.g. it
carries an inline `Prompt:` row that an earlier card lacked, or it has a status
row like `⚠ Hotkey shadows a Pi built-in.`, `(no key)`, `⚠ Dirty — …`, or a
`Shadowing:` line that the previous frame didn't render), the new frame fits
**fewer** cards into the same line budget. The state-layer scroll math, blind to
this, computes `scrollOffset` against the stale (larger) `pageSize`, leaving the
freshly-selected card outside the actual packed range.

User-visible symptom: pressing the Down arrow (or PgDn) at the boundary causes
the selection marker to disappear; the next Down press appears to "skip" a card
because the previously-selected card was never rendered. Pressing Up confirms
the state was always correct — only the render dropped it.

This change makes the picker's render self-correct: after the greedy pack, if
the selected card was not actually packed, the render computes a corrected
scroll offset that anchors the selected card to the bottom of the packed range,
re-packs once, and propagates the corrected offset back into picker state so
the next frame's scroll math starts from the corrected baseline.

The fix is structural — it covers every existing source of variable card height
(Prompt presence, `clampWarning`, `hotkeyConflict`, `hotkeyShadowsBuiltin`,
availability status, `Drift:`, `Shadowing:`) and any future variable-height row,
without needing to normalize card heights or introduce a height cache.

## What Changes

- **Add a pure `clampScrollToFit` helper to `src/ui/picker-state.ts`** that
  takes the current state, the actual packed card count from the most recent
  render, and the visible-presets length, and returns a state whose
  `scrollOffset` is adjusted so `selectedIndex` falls within
  `[scrollOffset, scrollOffset + packedCount - 1]`. The helper is idempotent
  (calling it twice in a row returns the same state) and is purely a state
  transition — no rendering, no I/O.
- **Have `renderList` return a corrected scroll offset alongside its lines**,
  rather than ever mutating state directly. Today `renderList(width): string[]`;
  after this change, `renderList(width): { lines: string[]; correctedScrollOffset?: number }`.
  When the greedy pack succeeds at including `state.selectedIndex` in the packed
  range, `correctedScrollOffset` is omitted. When it does not, the function
  computes the correction, re-packs once with the corrected offset, and returns
  both the re-packed lines and the corrected offset.
- **Apply the correction at the component boundary**, not inside `renderList`.
  The component's outer `render(width)` reads `correctedScrollOffset`, applies
  it via `clampScrollToFit`, and updates `this.state` before returning. This
  keeps `renderList` a pure function of its inputs and isolates state mutation
  to the component layer that already owns state transitions.
- **Cover Up / Down / PgUp / PgDn paths.** All four route through
  `moveSelection`, which routes through `ensureSelectionVisible`, which is the
  source of the stale-`pageSize` problem. The render-time correction catches
  every path uniformly. Tests assert the selection stays visible after each.
- **Add a regression-test fixture with heterogeneous card heights.** The new
  tests run _without_ `fixedPageSize`, so they exercise the greedy packer. They
  assert that after `pageSize` consecutive Down presses (and after a PgDn) the
  selected preset is in the rendered output. A parallel Up / PgUp test pins
  the property that those directions remain unaffected (the bug is bottom-edge
  only because `ensureSelectionVisible` advances `scrollOffset = selectedIndex
  - pageSize + 1`for downward motion but`scrollOffset = selectedIndex` for
    upward motion — the latter is by construction always visible).

## Capabilities

### Modified Capabilities

- `preset-picker`: extends the existing "Navigation wraps at list boundaries"
  guarantee with a stronger invariant that the selected card is ALWAYS in the
  rendered output regardless of variable card heights. Captured as a new
  requirement adjacent to the existing navigation requirement.

### New Capabilities

(None — extends the existing `preset-picker` capability with one new
requirement.)

## Impact

- **The critical bug is fixed for every variable-height row, present and future.**
  Today's reproduction (Down at the boundary drops the selection) and every
  related boundary (PgDn at any selection, mixed Prompt/no-Prompt scroll
  windows, future status rows that fire on edge cases) all resolve.
- **No card-height normalization.** The cards keep their current information
  density — clampWarning, hotkey-shadows-builtin, drift, and availability rows
  continue to appear only when relevant.
- **No new state-layer API used externally.** `clampScrollToFit` is exported
  for testability but is consumed only by the picker component.
- **The cosmetic "dialog breathes when scrolling" effect is not addressed.**
  That is a separate, lower-priority concern; addressing it would either waste
  vertical space (always render every conceivable status row with a placeholder)
  or require a deeper card-layout redesign. Out of scope here.
- **No storage or pi extension API change.** No migration. The change is
  contained to `src/ui/picker-state.ts`, `src/ui/picker.ts`, and the picker
  tests.
- **Tests previously relied on `fixedPageSize` to drive the picker**, which
  bypassed the greedy packer entirely — that is why this bug was not caught
  earlier. The new regression tests run with `fixedPageSize` undefined so the
  packer is exercised end-to-end.
