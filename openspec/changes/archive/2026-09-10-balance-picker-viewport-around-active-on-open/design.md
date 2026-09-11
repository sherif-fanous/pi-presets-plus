## Context

See proposal.md for motivation.

The picker currently has one viewport layout function,
`layoutPickerViewport`, that serves both initial render and normal navigation.
It packs from the current scroll offset, then corrects only when the selected
index is outside the packed range. If the selected card is below that range,
`scrollOffsetForSelection` walks backward from the selection until the selected
card fits, which makes the selected card the last visible card in many cases.

That correction is desirable while the user navigates: pressing Down past the
bottom should move the viewport just enough to keep the cursor visible. On the
first render after opening on an active preset, the same bottom-edge anchor
feels worse because the picker is presenting current state, not following a
movement.

The picker already distinguishes opening state from later state in practice:
`PresetPickerComponent` seeds `selectedIndex` from `session.current()` in the
constructor, and `render()` then calls `layoutPickerViewport` for the first
measured viewport. Card heights are only known during that render, so balanced
placement has to run in or near the measured layout path.

## Goals / Non-Goals

**Goals:**

- Keep active-preset selection on open while improving the opening viewport
  context around that selection.
- Balance by rendered line height, including separator lines, rather than by
  preset count.
- Clamp to the top and bottom list boundaries without wrapping.
- Keep the existing navigation layout behavior after the opening render.

**Non-Goals:**

- No change to keyboard navigation, page movement, filter changes, scope
  cycling, or refresh selection preservation after the picker is open.
- No new setting for preferred active-card placement.
- No attempt to make every viewport balanced. This change is about the first
  active-preset render only.

## Decisions

**Add an explicit opening-anchor mode to the layout path.**

Extend the layout entry point with an option that asks for balanced placement
around the selected card. The default path remains the current behavior, so
all navigation callers keep the bottom-edge correction they rely on. The picker
passes the option only for the first render when the constructor selected an
active preset from the loaded list.

Alternative considered: infer balance from `scrollOffset === 0` and a selected
index below the first packed range. That would accidentally affect later states
that happen to return to offset 0, and it would make layout behavior depend on
a hidden convention rather than an explicit caller intent.

**Balance around the selected card's rendered midpoint.**

The algorithm should compute a start offset whose packed viewport places the
selected card's vertical midpoint as close as possible to the viewport midpoint.
It should account for each preceding card's height plus separator lines, and
then pack forward from the chosen start offset. This gives a stable definition
for variable-height cards: the selected card is near the middle in screen
space, not merely near the middle by item count.

Alternative considered: subtract half the measured page size from the selected
index. That is simpler, but it produces visibly uneven results when prompts,
status rows, or drift warnings make cards different heights.

**Search candidate starts near the selected index rather than rendering the
whole list.**

The current layout reads heights lazily and should stay close to that shape.
For balanced placement, walk backward from the selected index while accumulating
height, scoring each candidate start by how far the selected card's midpoint
falls from the budget midpoint. The midpoint rises monotonically as the start
walks back, so the score falls and then rises: the walk stops at the first
candidate to reach the midpoint, which bounds measurement to the cards around
the selection. A candidate that would hide every later preset is rejected while
a later preset still fits, so showing following context wins over a closer
midpoint.

Alternative considered: evaluate every possible start offset and choose the
mathematically best one. That is easy to reason about, but it can measure every
preset on open for long lists, which is unnecessary for a visual polish fix.

**Track whether the opening balance has been consumed.**

`PresetPickerComponent` should keep a small instance flag, initialized when the
active preset is found on open. The first `renderList` call passes the balanced
anchor option and then clears the flag after rendering. Subsequent renders,
including renders caused by navigation, filtering, scope changes, refreshes,
and dialog dismissals, use the existing layout behavior.

Alternative considered: store this on `PickerState`. That would make a
one-frame rendering hint part of the general picker state model, even though no
state transition outside `picker.ts` needs to know about it.

## Risks / Trade-offs

- [Balanced open measures more cards than the current bottom-edge correction] →
  Keep the search local to the selected index and stop once the midpoint target
  or list boundary is reached.
- [The selected card can still be low in the viewport near the end of the list]
  → Clamp to the end is intentional. Showing the last loaded presets is better
  than leaving blank space below the active card.
- [The selected card can still be high in the viewport near the start of the
  list] → Clamp to the top is intentional. The picker should not wrap or invent
  space before the first preset.
- [A very tall selected card cannot be centered] → Reuse the existing behavior
  that renders an oversized selected card alone.
- [Opening balance could leak into normal navigation] → Gate it behind an
  explicit one-shot flag and add regression tests that navigation still uses the
  existing correction behavior.
