## Why

Today the only preset field whose change requires a `/reload` to
take effect is `hotkey`. The editor surfaces a passive dim notice
("Takes effect after /reload …") next to the hotkey input, but the
user still has to remember to type `/reload` at the prompt after
they Save. Worse, deleting a preset that owns a hotkey leaves the
binding registered until the next reload, with no in-app cue at
all.

This change closes the loop: when an editor save or a preset
deletion mutates a hotkey binding, the extension prompts the user
with an overlay that offers to call `ctx.reload()` immediately.

## What Changes

- After a successful editor Save where the hotkey field changed
  (added, removed, or replaced), open an info-dialog overlay
  titled "Reload Pi?" with two actions: Yes (calls `ctx.reload()`)
  and No (closes the dialog and leaves the existing inline notice
  visible for later).
- After a successful preset deletion (any flow that removes a
  preset — picker delete, editor scope-move, etc.) where the
  removed preset declared a hotkey, open the same dialog.
- The dialog defaults to No so a stray Enter does not interrupt
  whatever the user is mid-doing.
- The dialog reuses the existing `openConfirm` overlay (yes/no
  semantics fit the question naturally; `route-picker-info-
output-through-overlay`'s info-dialog is read-only and not the
  right shape here). No new component required.
- Add a small `hotkeyChanged(prev, next)` helper used by both the
  editor Save path and the picker Delete path so the detection
  logic exists in one place.
- The existing `formatHotkeyReloadNotice` inline hint stays as a
  visible reminder when the user dismisses with No, and as the
  primary signal during editing (before Save).
- No user-facing setting to disable the prompt; the No button is
  the disable mechanism.
- Out of scope: any other field starts requiring reload. The
  detection logic is field-specific (only `hotkey`), not a
  generic diff-and-prompt mechanism.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `preset-editor`: After a successful Save that mutated the
  hotkey, the editor opens a reload-prompt overlay before
  returning control. The Yes branch calls `ctx.reload()`.
- `preset-shortcuts`: Defines the cross-cutting rule that adding,
  removing, or changing a preset's hotkey requires `/reload` to
  take effect, and that the extension surfaces this via the
  reload-prompt overlay regardless of which mutation flow caused
  it (editor Save or preset delete).
- `preset-picker`: After a successful preset delete that removed
  a hotkey-bearing preset, the picker opens the same reload-prompt
  overlay before returning to its list.

## Impact

- Touches: `src/ui/editor.ts` (post-Save branch), `src/ui/picker.ts`
  (post-delete branch — verify a delete flow exists; otherwise this
  attaches wherever delete lives).
- Reuses `ctx.reload()` from the extension API; no new pi
  capabilities required.
- Test impact: editor tests gain coverage for hotkey-changed Save
  paths invoking the dialog; picker tests gain coverage for
  hotkey-bearing delete invoking it. `ctx.reload` stubbed in
  tests.
- No storage, schema, or activation-state changes.
