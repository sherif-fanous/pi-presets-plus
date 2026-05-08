## Why

Three independent friction points in the preset editor dialog all stem
from a shared root cause — the dialog mixes pi-tui's stateful `Input`
widget for some rows with custom rendering for others, leading to
inconsistent focus cues, inconsistent empty-state vocabulary, and a
button row that is only reachable by Tab-cycling through every form
field. None individually warrants a change, but together they form a
coherent "make the editor feel like one widget, not three" cleanup.

1. **Permanent block cursor on Name and Hotkey.** pi-tui's `Input`
   renders an inverse-video cursor character regardless of its
   `focused` state (only the zero-width hardware-cursor marker is
   focus-gated). The Name and Hotkey rows therefore display a block
   cursor at all times, so users cannot tell from cursor presence
   alone which row is active; the left-margin focus marker is the
   only reliable cue.
2. **No keyboard shortcut for Save / Cancel / Test.** Today the user
   must Tab past every form row to reach the action buttons. There
   is no quick way to commit or discard from anywhere in the form.
3. **Inconsistent empty-state vocabulary.** Empty Name and Hotkey
   rows show pi-tui's hardcoded `>` prompt prefix (and a block
   cursor). The Prompt row, which uses a custom textarea, shows a
   verbose sentence-cased placeholder instead. The user sees three
   rows that mean "this field is empty" but read in two different
   visual idioms.

## What Changes

- The Name and Hotkey rows SHALL be rendered as plain text via
  `renderValueRow` when the row is unfocused; pi-tui's `Input`
  widget SHALL be used to render the row only while it is focused.
  This removes the permanent block cursor on those rows when the
  user is not editing them.
- When the Name or Hotkey row is unfocused AND its value is empty,
  the row SHALL display the placeholder `"—"` (a single em-dash, in
  `dim` color) — the same empty-state indicator used by the Prompt
  row. The placeholder is intentionally a pure visual glyph with no
  English copy: it avoids the word "empty" (matching project
  preference) and avoids referencing any specific keystroke (the
  editor accepts both Tab and the arrow keys for navigation).
- The editor SHALL accept three keyboard shortcuts at any focus
  state, intercepted before the focused row's input handler:
  - `Ctrl+S` → Save (runs the same path as activating the Save
    button).
  - `Ctrl+T` → Test (runs the same path as activating the Test
    button); a no-op when the caller has not wired a test callback
    (i.e. when the Test button is not rendered).
  - `Esc` → Cancel (already supported; no behavior change).
- The editor's existing footer hint SHALL be extended to surface the
  new shortcuts, e.g. `Tab/↑↓ Move · ^S Save · ^T Test · Esc Cancel`,
  with `^T Test` omitted when the Test button is not rendered.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: adds focus-aware rendering for the Name and
  Hotkey rows, a consistent empty-state placeholder across text
  rows, and editor-wide save / cancel / test keyboard shortcuts.

## Impact

- `src/ui/editor.ts`:
  - `renderRows()` (and the helpers it calls for Name / Hotkey)
    grow a focused-vs-unfocused branch.
  - `handleInput()` gains top-level handling for `Ctrl+S` and
    `Ctrl+T` before delegating to the focused row.
  - The footer hint string gains the new shortcut tokens.
- No schema changes, no storage changes, no public API changes.
- pi-tui's `Input` widget is unchanged; the project sidesteps its
  always-on cursor by simply not asking it to render when the row
  is not focused.
- Tests covering the editor's render output and keyboard handling
  will need updates to assert the new rendering and shortcut
  behavior.
