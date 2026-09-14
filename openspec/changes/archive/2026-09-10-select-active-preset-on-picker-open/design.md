## Context

See proposal.md for motivation.

The picker's opening state comes from `initialPickerState()` in
`src/ui/picker-state.ts`, which hard-codes `selectedIndex: 0` and
`scrollOffset: 0`. `PresetPickerComponent` in `src/ui/picker.ts` assigns it as a
field initializer and never revisits it, so the only thing that has ever moved
the opening cursor is user input.

Three pieces the change can reuse already exist:

- `session.current()` returns the active attachment, and `samePresetIdentity` in
  `src/preset-identity.ts` compares by name and scope. The picker already calls
  both when it renders the active card.
- `preserveSelectionOrFirst` re-selects a preset by identity key against the
  currently visible list and falls back to index 0 when the key is absent.
  `refreshPresets` uses it after every reload.
- `layoutPickerViewport` re-anchors the viewport around the selected index on
  every render, and `render()` writes the corrected `scrollOffset` back into
  state. A selection below the fold therefore scrolls itself into view on the
  first frame without the opening state having to compute scroll.

The constraint that shapes the approach is ordering: card heights, and so the
real page size, are known only after a render. At construction the component has
`pickerFallbackPageSize(terminal.rows)` and nothing better.

## Goals / Non-Goals

**Goals:**

- Compute the opening selection from the same identity comparison the active
  card marker already uses, so the marker and the cursor cannot disagree.
- Keep the fallback path identical to today's behavior.
- Leave scroll correction to the existing layout pass.

**Non-Goals:**

- No change to how the selection moves after the picker is open.
- No change to `refreshPresets`, filtering, scope cycling, or the drift cache.
- No new "jump to active" key binding.

## Decisions

**Seed the selection inside the component constructor, not inside
`initialPickerState()`.**

`initialPickerState()` stays a pure, argument-free seed, and the component sets
`this.state` in its constructor body by running that seed through
`preserveSelectionOrFirst` with the active preset's key. Rationale: the opening
selection depends on the loaded preset list, the session, and a page size, none
of which `picker-state.ts` has or should take. The alternative, widening
`initialPickerState()` to accept presets, a query, an active identity, and a
page size, turns a two-line seed into a second copy of
`preserveSelectionOrFirst` and pulls session knowledge into a module that has
none today.

**Reuse `preserveSelectionOrFirst` rather than writing a new index lookup.**

Fallback to the first row when the key is missing is exactly what the helper
already guarantees, and `refreshPresets` already depends on that guarantee. One
code path means the deleted-active-preset case cannot drift between open and
reload. The alternative, a bespoke `findIndex` plus a manual clamp, would
duplicate the fallback and the `ensureSelectionVisible` call.

**Pass the fallback page size and let the first render correct scroll.**

`this.pageSize` returns `pickerFallbackPageSize(terminal.rows)` until a render
has measured cards, so the scroll offset the constructor computes is an
estimate. `render()` already overwrites `scrollOffset` from
`layoutPickerViewport`, which anchors the viewport on the selected card, so the
estimate is corrected before the user sees anything. The alternative, deferring
the seed to the first `render()` call, would put a one-shot mutation flag in the
render path for no visible gain.

**Match on identity, not name.**

`samePresetIdentity` compares name and scope, so a user `plan` and a project
`plan` stay distinct. Using `loadedPresetKey` on the active attachment gives the
same key space `preserveSelectionOrFirst` compares against.

## Risks / Trade-offs

- [The active preset is filtered out of the opening list] → It cannot be. The
  picker opens with scope `all` and an empty query, so the visible list is every
  loaded preset. If a later change alters the opening scope or query, the
  fallback to the first row still applies.
- [Existing picker tests assert the opening cursor is row 0] → Those tests
  either run with no active preset, in which case they still pass, or they need
  the active session stubbed. The task list calls for auditing them rather than
  assuming.
- [An opening cursor deep in a long list makes the top of the list look
  unreachable] → Navigation already wraps at both boundaries, so `↑` from the
  active card reaches the end of the list and `PgUp` reaches the top.
- [Users who relied on `Enter` activating the first preset] → That behavior was
  not documented and the new behavior is the safer default: the no-op reconfirm
  path in `apply.ts` already short-circuits when the selected preset is the
  active one and nothing has drifted.
