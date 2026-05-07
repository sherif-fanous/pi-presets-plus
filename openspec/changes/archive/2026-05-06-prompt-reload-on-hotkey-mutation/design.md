## Context

Hotkeys are registered once at `session_start` because pi exposes
`registerShortcut` but no `unregisterShortcut`. As a consequence,
adding, removing, or changing a preset's hotkey field cannot take
effect until the next session — the user must run `/reload`
manually. The editor already shows a passive dim notice next to the
hotkey input ("Takes effect after /reload …"), and the picker
delete flow has no notice at all even though deleting a preset
that owns a hotkey leaves an orphan binding registered until the
next reload.

The current loop is open: the user mutates a hotkey, sees the
inline notice (or doesn't, in the delete case), saves/deletes,
returns to work, and the binding mismatch persists until they
remember to reload. The existing inline notice helps during
editing but provides no momentum at the _commit_ moment when the
mismatch is created.

This change closes the loop with an overlay prompt at the commit
moment: after a successful editor Save where the hotkey changed,
or after a successful preset delete that removed a hotkey-bearing
preset, the package opens an overlay asking _"Reload Pi?"_ with
Yes/No buttons. Yes calls `ctx.reload()` immediately; No closes
silently and leaves the inline notice visible as a fallback
reminder.

## Goals / Non-Goals

**Goals:**

- Detect, in one shared helper, whether a save or delete operation
  changed a hotkey binding (added, removed, or replaced).
- After a successful Save where `hotkeyChanged(prev, next)` is
  true, prompt the user with a Yes/No overlay; on Yes, call
  `ctx.reload()`.
- After a successful preset delete where the deleted preset
  declared a hotkey, prompt the same Yes/No overlay; on Yes, call
  `ctx.reload()`.
- Reuse the existing `openConfirm` overlay (yes/no semantics fit
  naturally) — no new overlay component required.
- Keep the existing `formatHotkeyReloadNotice` inline hint as a
  fallback reminder when the user dismisses with No, and as the
  primary signal during editing (before commit).
- Default the dialog to No so a stray Enter does not interrupt
  whatever the user is mid-doing.

**Non-Goals:**

- A user-facing setting to disable the prompt. The No button is
  the disable mechanism.
- Generic field-diff detection that could prompt for any future
  reload-only field. Today only `hotkey` is reload-only; YAGNI.
- Changing how shortcuts are registered (still
  session_start-only; pi exposes no unregister API).
- Surfacing the prompt for non-editor mutation paths beyond the
  picker delete flow (e.g. external file edits + `/presets reload`).
  External edits already require an explicit user action, and the
  reload command is itself the path that picks up the change.
- Deduplicating multiple consecutive prompts. If the user edits
  three hotkey-bearing presets in succession with No to each, they
  see three prompts; that's by design (each Save is a discrete
  commit).

## Decisions

### Decision: Reuse `openConfirm`, not info-dialog

`openConfirm` already exists, has yes/no semantics with arrow-key
navigation and a default selection, and is exactly the shape this
prompt needs. The info-dialog introduced in
`route-picker-info-output-through-overlay` is read-only — wrong
shape for a yes/no question.

The dialog SHALL be opened via:

```
const reload = await openConfirm(
  ctx,
  "Reload Pi?",
  "Hotkey changes take effect after a reload. Reload now?",
);
if (reload) await ctx.reload();
```

`openConfirm` already defaults to No (per its implementation),
which matches our requirement.

### Decision: Centralize the "did the hotkey change?" predicate

Add `hotkeyChanged(prev, next)` to a small shared helper module
(e.g. `src/hotkey-conflicts.ts` already exists; add it there, or
create `src/ui/hotkey-changed.ts`). The predicate trims both inputs, treats absent and empty hotkeys as equivalent, and compares parsed normalized hotkey chords when both declarations are valid (so case-only and modifier-order-only edits do not prompt unnecessarily).

Both the editor Save path and the picker Delete path share this predicate, but commit-time prompting compares against a runtime hotkey baseline captured at `session_start`, not only against the latest persisted file value. The baseline models what Pi actually registered in this extension runtime: if the user adds a hotkey and chooses No, then removes it before reloading, the second save no longer prompts because runtime and disk are back in sync. If the user renames or scope-moves a hotkey-bearing preset, the prompt still fires even when the hotkey string is unchanged, because Pi registered the shortcut handler against the old `(scope, name)` identity.

Declining a prompt records one pending acknowledgement per `(scope, name)` identity, with the declined hotkey value stored alongside that identity. Reopening and saving the same hotkey for that identity does not nag repeatedly, while changing the pending hotkey re-arms the prompt.

Centralizing avoids duplicate trim/empty/equality logic and gives tests a single function to cover. The runtime baseline is intentionally in-memory runtime state, not a cache of on-disk storage; `/presets reload` re-reads files but cannot re-register shortcuts, so the baseline must continue to represent the session-start shortcut state until Pi reloads the extension.

### Decision: Picker delete prompts even when no editor opened

The picker's `x` action deletes a preset directly via storage
(no editor in between). After a successful delete, the picker
checks `hotkeyChanged(deletedPreset.hotkey ?? "", "")` — equivalent
to "the deleted preset declared a hotkey" — and prompts if true.

This means deleting a preset with no hotkey does not prompt
(unchanged behavior). Deleting a preset with a hotkey prompts even
if the user never opened the editor.

### Decision: Editor scope-move counts as one save

When the user changes scope on an existing preset, the editor
performs add+remove (move). The hotkey was either preserved
identically through the move, or changed during the same edit.
We use `hotkeyChanged(initialPreset.hotkey ?? "", saved.hotkey ?? "")`
once after the entire move completes. We do NOT prompt twice
(once for the add, once for the remove).

### Decision: Reload prompt fires only on success

If a Save fails validation or persistence, no prompt is shown. If
a Delete fails the underlying file write, no prompt is shown. The
prompt is conceptually "you just committed a binding change" — if
no commit happened, there's nothing to reload for.

### Decision: Inline notice stays visible

`formatHotkeyReloadNotice` continues to render in the editor
during editing. After Save the editor closes regardless of the
prompt's Yes/No outcome. The inline notice's job has always been
to communicate during editing; the prompt's job is to act at
commit time. They are complementary, not redundant.

### Decision: ctx.reload() error handling

If `ctx.reload()` throws, the package SHALL surface the error via
`ctx.ui.notify(<text>, "error")` rather than letting the
exception escape. The user is not stuck — their hotkey notice
still applies and they can `/reload` manually. The thrown
exception is logged via `ctx.ui.notify` with a message naming the
operation.

## Risks / Trade-offs

- [Risk] `ctx.reload()` is asynchronous and may take noticeable
  time. → **Mitigation:** The prompt itself blocks on the user's
  Yes/No choice, which is the natural place to await; reload
  feedback is pi's responsibility once we've called the API.

- [Risk] User saves multiple hotkey changes back-to-back and gets
  a prompt for each. → **Acceptable:** each save is a discrete
  commit. The user can choose No on the first N and Yes on the
  last. No batching state needs persisting.

- [Risk] User dismisses the prompt with No, edits another
  unrelated preset (no hotkey change), and walks away thinking
  they reloaded. → **Mitigation:** The inline `formatHotkeyReloadNotice`
  was already designed for exactly this case. It stays.

- [Risk] `ctx.reload()` is not available on older pi versions. →
  **Mitigation:** Defensive check: if `typeof ctx.reload !== "function"`,
  the package SHALL skip the prompt entirely and rely on the
  inline notice. Tests cover this fallback path.

- [Trade-off] We do not surface the prompt when a user changes
  their hotkeys via direct file edit + `/presets reload` (which
  re-runs `loadAll` but not `session_start`-style shortcut
  registration). External file edits remain a power-user path
  where the user already knows what they're doing.

## Migration Plan

No data migration. Roll forward by merging; rollback is a
revert. CHANGELOG entry communicates the new prompt; no other
user-facing announcement required.

## Open Questions

_None._
