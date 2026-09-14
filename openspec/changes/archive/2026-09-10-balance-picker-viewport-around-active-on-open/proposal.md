## Why

Opening the picker now selects the active preset, but when that preset sits
below the initial viewport it often appears as the last visible card. That
placement is correct for scroll-following during keyboard navigation, but it
feels cramped on first open because the user gets little or no context below the
current selection.

## What Changes

- When the picker opens on an active preset and there is enough list content
  around it, the first viewport places the active preset near the middle of the
  list pane instead of at the bottom edge.
- The placement uses rendered card heights, not preset count alone, so
  variable-height cards stay accurate.
- The viewport still clamps naturally near the start and end of the list.
- No-active and missing-active fallback behavior remains unchanged: the first
  card is selected and the viewport starts at the top.
- Normal navigation after the picker opens remains unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-picker`: initial viewport placement for an active preset becomes
  balanced around the selected card when possible.

## Impact

- `src/ui/picker-layout.ts`: add an opening-only viewport anchoring path that
  can balance around a selected card using measured heights.
- `src/ui/picker.ts`: ask the layout for balanced initial placement only for the
  first active-preset render.
- `tests/ui/picker-layout.test.ts`, `tests/ui/picker-variable-height.test.ts`,
  and `tests/ui/picker-initial-selection.test.ts`: cover balanced placement,
  boundary clamps, and unchanged navigation.
- No storage, activation, filtering, scope, or preset model behavior changes.
