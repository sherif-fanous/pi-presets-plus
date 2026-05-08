## Why

The editor's auto-snap "switched to off" notice has two problems that
share a common root cause: the notice tries to convey _persistent
state_ using an _event-driven_ signal.

Today, when the user changes the editor's model field such that the
currently-selected thinking level becomes invalid, the editor snaps
the level to `"off"` and renders an inline notice naming the new
model. The notice is set on `EditorFormState` and never cleared,
producing two user-visible problems:

1. **Stale text.** The notice persists across subsequent model
   changes and continues to name a model that is no longer selected.
2. **Path-dependent feedback.** Once the level is `"off"`, switching
   between non-reasoning models produces no notice (because no further
   snap happens), even though the user is still on a model that
   cannot do thinking. Whether the notice is visible depends on which
   model the user came from, not on the current state.

A naive fix — clearing the notice on every model change so it tracks
only the most recent transition — surfaces problem 2 even more
prominently: a user who selects a non-reasoning model with `level=off`
already (no snap) sees no notice; the same user coming from `level=high`
on the same prior model sees a notice. Same final state, different
feedback. That inconsistency is intrinsic to encoding persistent
"this model can't do thinking" meaning into a transition signal.

The dialog already conveys the _persistent_ state through the static
hint `"Dimmed levels are unavailable for this model."`, rendered
beneath the Thinking row whenever the current model has any disabled
levels. The snap to `"off"` is itself visible as the radio dot moves
to `● off` while every other dot is dimmed and unselectable. Together
these two cues already tell the user "this model can't do thinking"
(the static hint) and "your level is now off" (the radio state) —
without any path-dependent or stale-text failure modes.

The auto-snap notice is therefore redundant in the cases where the
state cues already suffice, and misleading in the cases where the
state cues alone would have been correct. The cleanest fix is to
remove the notice entirely.

## What Changes

- The editor SHALL no longer render an inline auto-snap notice when a
  user-driven model or provider change snaps the thinking level to
  `"off"`. The snap itself SHALL still occur — the radio's selected
  value moves to `"off"` — but no accompanying text SHALL appear.
- The static hint `"Dimmed levels are unavailable for this model."`
  remains unchanged in wording, trigger, and placement.
- `snapThinkingSelection` SHALL no longer return a `notice` field;
  callers SHALL only consume the new `state`.
- The `EditorFormState`-adjacent `notice` storage and its render in
  `renderMessages()` SHALL be removed. `renderMessages()` continues
  to render the hotkey-reload notice and the error strip.
- The existing scenario "Changing model invalidates current
  selection" SHALL be re-stated to assert only the snap (not the
  notice). The scenario "Opening editor for a clamp-warning preset
  does not mutate selection" SHALL be re-stated to drop the
  no-notice clause (the notice no longer exists).

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: removes the auto-snap inline notice from the
  thinking-level requirement; the radio still snaps to `"off"`, the
  static dimmed-levels hint still renders.

## Impact

- `src/ui/editor.ts`:
  - Remove `private notice` field and its render in
    `renderMessages()`.
  - `snapThinkingIfInvalid()` simplifies to assigning only the new
    state.
  - `snapThinkingSelection` (exported helper) returns just
    `EditorFormState` (no `notice`). Update its signature and
    JSDoc.
- `src/ui/editor.test.ts` (or wherever the editor tests live): drop
  any assertions that the notice text appears anywhere; update tests
  for the affected scenarios to assert only the radio snap.
- No schema changes, no storage changes, no public-API changes
  beyond `snapThinkingSelection`'s return shape (an internal helper
  used only by the editor).
- No interaction with the in-flight `improve-editor-input-ux` change
  (that change does not touch the notice or `renderMessages()`).
