## Context

The picker bug surfaces at the seam between two layers that disagree about
"how many cards fit on screen":

```text
 ┌────────────────────────────────┐       ┌────────────────────────────────┐
 │  picker-state.ts               │       │  picker.ts::renderList         │
 │                                │       │                                │
 │  ensureSelectionVisible(state, │       │  greedy pack into lineBudget:  │
 │      pageSize)                 │       │  loop, add cards until next    │
 │                                │       │  one no longer fits            │
 │  uses this.pageSize            │       │                                │
 │       ↑                        │       │  updates this.renderedPageSize │
 │       └───────────────────────────────────────┘                          │
 │       (cached from PREVIOUS render's packed count)                       │
 └────────────────────────────────┴───────┴────────────────────────────────┘
```

When the _next_ frame's cards are slightly taller (a Prompt row, a clamp
warning, a hotkey-shadows-builtin notice, etc.), the packer fits one fewer
card, but the state already advanced `scrollOffset` assuming the larger
count. Result: the selected card was never rendered.

The fix is to make the render self-correct. The state remains pure and
intent-bearing ("select this index"); the render becomes the authority on
what was actually packed and can ask the state to re-anchor if reality
disagreed.

## Goals / Non-Goals

**Goals**

- The picker guarantees the selected card is in the rendered output regardless
  of card-height variation across the visible window.
- The fix is structural (covers every existing and future variable-height row
  type), not specific to a single row.
- `picker-state.ts` remains pure and easy to test.
- The render's outer component, not `renderList` itself, owns state mutation.
- Regression tests exercise the greedy packer end-to-end (no `fixedPageSize`).

**Non-Goals**

- **Normalizing card heights.** Always rendering placeholders for empty Prompt
  rows, clamp warnings, hotkey conflicts, etc., would stabilize the dialog
  height but waste 4–6 lines per card on rare states. Discarded as a separate,
  worse tradeoff.
- **A height cache.** Pre-measuring each card before packing would also solve
  the bug, but duplicates the rendering logic and is awkward when card
  rendering depends on width. The render's own packer already knows; we just
  need to listen to it.
- **Eliminating the "dialog breathes when scrolling" cosmetic feel.** Inherent
  to variable card heights; out of scope.
- **Changing PgUp/PgDn wrap behavior.** Their existing `wrap: false` is
  intentional (matches `less`, vim, GitHub web nav, most TUI pickers); leave
  alone.
- **Changing arrow-key wrap behavior.** Still `wrap: true`. Unchanged.

## Decisions

### `clampScrollToFit` is the new pure helper

```text
clampScrollToFit(state, packedCount, visibleCount): PickerState

if packedCount === 0 or visibleCount === 0:
    return state unchanged
if state.selectedIndex is in [state.scrollOffset, state.scrollOffset + packedCount - 1]:
    return state unchanged
otherwise:
    next.scrollOffset = max(0, min(
        visibleCount - packedCount,
        state.selectedIndex - packedCount + 1))
    return { ...state, scrollOffset: next.scrollOffset }
```

The helper is idempotent: feeding its output back through itself returns the
same state. It clamps to `[0, visibleCount - packedCount]` so the corrected
offset is itself a valid scroll position. It assumes the caller has just
measured `packedCount` from a real render — passing a stale or fabricated
count produces garbage in / garbage out.

`clampScrollToFit` is the _only_ new picker-state API. `ensureSelectionVisible`
keeps its existing semantics (it is correct when `pageSize` is correct; the
new helper handles the case where the render disagrees with `pageSize`).

### Render contract: `renderList` returns a result object

```ts
interface RenderListResult {
  lines: string[];
  /** Present only when the render had to re-anchor scroll to fit selection. */
  correctedScrollOffset?: number;
}

renderList(width: number): RenderListResult
```

Inside `renderList`:

1. Greedy pack with `state.scrollOffset` as before.
2. If `state.selectedIndex` is in the packed range, return `{ lines }`.
3. Otherwise: compute the corrected offset (same arithmetic as
   `clampScrollToFit`), re-pack once with the corrected offset, return
   `{ lines: <repacked>, correctedScrollOffset: <corrected> }`.

Why "re-pack once" instead of pre-measuring: pre-measuring duplicates the
packer's logic and is sensitive to width changes. Re-packing once is two
loops in the rare correction case and one loop in the common path. The
greedy packer is already O(packedCount) in card-count, which is bounded by
the line budget.

Why "self-corrects within renderList" rather than "outer render orchestrates":
the packer is the source of truth for `renderedPageSize`. Asking it to also
emit the corrected offset is a small extension of an already-existing
responsibility. The outer `render` then has a single thing to do with the
result — read `correctedScrollOffset` and apply it.

### State mutation happens at the component boundary

`renderList` does not mutate state. The component's outer `render(width)`
reads `result.correctedScrollOffset` and, if present, calls
`clampScrollToFit(state, packedCount, visibleCount)` (where `packedCount` is
derived from the corrected render's length count or carried in the result
object), assigns the new state, and emits the lines. This keeps every state
mutation in a single place that already owns state transitions, and keeps
`renderList` a pure function of its inputs.

### Visualization of the fix

```text
  Before:                              After:

  scrollOffset = 4                     scrollOffset = 4
  selectedIndex = 12                   selectedIndex = 12

  greedy pack from 4 → fits 8 cards    greedy pack from 4 → fits 8 cards
  (cards 4..11)                        (cards 4..11)
  → returns lines for 4..11            → selectedIndex 12 NOT in [4..11]
                                       → correction: scrollOffset = 12 - 8 + 1 = 5
  → selected card (12) MISSING         → re-pack from 5 → fits 8 cards (5..12)
  → marker invisible                   → returns lines for 5..12
                                       → correctedScrollOffset = 5

  Next frame, user presses Down:       Next frame, user presses Down:
  Now selectedIndex = 13               state has been updated: scrollOffset = 5
  ensureSelectionVisible uses old      Now selectedIndex = 13
  pageSize 8, advances offset to 6     ensureSelectionVisible sees offset=5,
  → cards 6..13 render → marker        pageSize=8 → 13 in [5..12]? No. So
     reappears, but card 12 was        offset = 13 - 8 + 1 = 6 → cards 6..13
     "skipped" in the user's eye       render → smooth continuation, no skip
```

## Decisions deferred

- **Whether to also fix PgUp's non-wrap inconsistency** with Up's wrap. Out
  of scope here; tracked informally as a future tiny cosmetic change.
- **Whether to address the cosmetic "dialog breathes" effect.** Out of scope;
  would warrant its own change with a card-layout redesign.

## Risks

- **`renderedPageSize` semantics shift slightly.** Currently it's the count of
  cards packed by the most recent render. After this change it's the count
  of cards in the _final_ (possibly re-packed) render. Consumers
  (`moveSelection`, `cycleScope`, `refreshPresets`) treat it as the number
  the next frame can rely on; the new semantics are at least as accurate.
- **Re-pack cost in the worst case.** Two packer passes when correction
  fires. The packer is bounded by line budget (< 30 rows on a typical
  terminal), and correction fires only at the moments the selection just
  moved into a region with different heights. Cost is negligible.
- **State propagation timing.** The corrected scroll offset is computed
  _during_ render and applied to state _before_ `render(width)` returns the
  final lines. Tests confirm the next user keystroke sees the corrected
  state.

## Out of scope

- Card-height normalization (placeholder rows for empty fields).
- PgUp/PgDn wrap behavior changes.
- Height-cache or pre-measure rendering.
- Cosmetic dialog-height stabilization.
- Any new picker keybinding.
