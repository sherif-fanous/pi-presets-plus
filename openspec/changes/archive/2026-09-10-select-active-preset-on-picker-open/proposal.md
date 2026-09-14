## Why

The picker always opens with the cursor on the first card, even when a preset is
active and its card sits further down the list. That leaves two competing "you
are here" signals on screen, hides the active preset entirely when it is below
the fold, and turns a reflexive `Enter` into an activation of whatever happens
to sort first. A list of mutually exclusive states should open on the state the
session is already in.

## What Changes

- When the picker opens and a preset is active, the cursor starts on that
  preset's card instead of the first card.
- The viewport scrolls so the active card is visible on the first frame, even
  when it sits below the initial fold.
- When no preset is active, or the active preset is no longer among the loaded
  presets, the cursor starts on the first card as it does today.
- The active-card status dot and accent highlight are unchanged, so the card now
  carries both the marker and the cursor on open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-picker`: initial cursor placement on open becomes active-preset aware
  rather than always index 0.

## Impact

- `src/ui/picker-state.ts`: the seed state the picker starts from.
- `src/ui/picker.ts`: the picker component reads `session.current()` when it
  builds its opening state.
- `tests/ui/picker-state.test.ts` and the picker UI tests that assume the
  opening selection is the first row.
- No storage, activation, filtering, scope, or rendering behavior changes.
