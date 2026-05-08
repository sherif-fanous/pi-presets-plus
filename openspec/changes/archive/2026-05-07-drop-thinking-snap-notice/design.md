## Context

The auto-snap notice was introduced to surface "your thinking level
just got changed for you" feedback when the user picks a model that
cannot honor the previously-selected level. In practice the notice
mixes two responsibilities that should be separate:

1. **Persistent state**: "the current model cannot do thinking" —
   already conveyed by the static `"Dimmed levels are unavailable for
this model."` hint that renders beneath the Thinking row whenever
   the current model has any disabled levels.
2. **Transition event**: "your level was just changed for you" —
   conveyed structurally by the radio dot moving to `● off` while
   every other dot is dimmed and unselectable.

Because the notice is event-driven (it only sets when a snap actually
happens) but visually behaves like persistent state (a sentence
naming a model and a switch), users expect it to be present whenever
they're looking at a non-reasoning model. That expectation cannot be
satisfied without either making the notice path-dependent (the
current bug) or re-engineering it to track persistent intent (which
duplicates the dimmed-levels hint and adds state-management
complexity).

The dialog already gets the persistent and transition signals right
without the notice:

```
Thinking:  ● off  ○̶ minimal  ○̶ low  ○̶ medium  ○̶ high  ○̶ xhigh
           Dimmed levels are unavailable for this model.
```

The radio shows current state; the dimmed dots show what's possible;
the static hint explains why. Adding a sentence on top is redundant
when state and reason are already visible, and misleading when the
sentence drifts out of sync with current state.

## Goals / Non-Goals

**Goals:**

- Eliminate the path-dependent and stale-text failure modes by
  removing the dynamic notice entirely.
- Preserve the existing snap behavior: the radio still moves to
  `"off"` on a user-driven model/provider change that invalidates
  the current level.
- Preserve the static `"Dimmed levels are unavailable for this
model."` hint exactly as it is today.
- Preserve `renderMessages()`'s remaining responsibilities (the
  hotkey-reload notice and the error strip).

**Non-Goals:**

- No change to `validThinkingLevels(model)` or the radio's disabled
  rendering.
- No change to clamp-warning surfacing on the picker card or apply
  flow (the per-preset `clampWarning` flag is a separate signal,
  unaffected).
- No change to the constructor's no-snap-on-open guarantee.
- No replacement notification mechanism — we are deliberately
  removing a UI element, not relocating it.

## Decisions

### Decision: remove the notice plumbing end-to-end

`snapThinkingSelection` becomes:

```ts
export function snapThinkingSelection(
  state: EditorFormState,
  model: Model<Api> | undefined,
): EditorFormState {
  if (validThinkingLevels(model).includes(state.thinkingLevel)) {
    return state;
  }

  return { ...state, thinkingLevel: "off" };
}
```

`snapThinkingIfInvalid` becomes:

```ts
private snapThinkingIfInvalid(): void {
  this.state = snapThinkingSelection(this.state, this.currentModel());
}
```

The `private notice` field on the editor class and its render in
`renderMessages()` are deleted. `renderMessages()` continues to
render the hotkey-reload notice and the error strip; nothing else
changes.

**Alternative considered: keep the notice plumbing in the helper but
ignore the value at the editor.** Rejected — leaving dead return
values is a maintenance smell and would invite a future contributor
to "fix" the editor by re-rendering the notice.

### Decision: do not introduce a replacement signal

We considered a few alternatives before settling on full removal:

- **A toast / status-line message** — adds another surface to
  maintain and still suffers from "when do I clear it?" semantics.
- **A one-shot animation on the radio** — overkill for a state
  change the user can see by looking at the dot.
- **A persistent hint that says "Auto-snapped to off"** — overlaps
  almost completely with the existing dimmed-levels hint.

None of these add information the user does not already have from
the radio plus the static hint. The right move is to trust the
existing cues.

### Decision: re-state the affected scenarios to drop notice clauses

Two scenarios in `preset-editor` mention the notice:

- "Changing model invalidates current selection" — currently asserts
  the snap **and** the notice. Re-stated to assert only the snap.
- "Opening editor for a clamp-warning preset does not mutate
  selection" — currently asserts no snap **and** no notice. Re-stated
  to drop the no-notice clause; "no notice" is true vacuously now.

The "Reasoning model …" and "Non-reasoning model selected" scenarios
are unaffected (they do not mention the notice).

The over-arching requirement paragraph is re-stated to drop the
sentence about the inline notice while preserving everything else
(when snap occurs, what triggers it, the constructor guarantee, the
defensive `thinkingLevelMap` access).

## Risks / Trade-offs

- **[Risk]** A user who is not looking at the Thinking row when a
  snap occurs may not notice their level changed. → Mitigation: the
  user only triggers a snap by changing the model — an action that
  already directs their attention to the model area. The dimmed-levels
  hint immediately beneath the row provides peripheral confirmation
  that the row's state is constrained. The visible "● off" radio
  with all other dots dimmed conveys both _what_ the level is and
  _that nothing else is available_. Users editing presets are doing
  intentional work; this is not a context where we need an alert.
- **[Risk]** Tests that asserted notice text appeared in any render
  path will fail. → Mitigation: those assertions are removed as part
  of this change; the test suite gets simpler.
- **[Trade-off]** We lose the ability to name the prior level in the
  feedback (e.g. "switched from high to off"). The current notice
  did not name the prior level either, so this is not a regression
  from the implemented behavior. If naming the prior level becomes
  desirable later, a future change can introduce a clamp-style
  warning that surfaces on save (similar to the existing
  `clampWarning` flag on saved presets).
