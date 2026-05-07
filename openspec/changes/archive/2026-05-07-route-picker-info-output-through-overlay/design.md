## Context

The `/presets` picker, the editor, and the confirm dialog are all
overlay components. While any of those is open, `ctx.ui.notify`
writes to the main pi window underneath the overlay; the user has
to dismiss the overlay before they can read what was emitted.

Two `/presets` subcommands today emit through `ctx.ui.notify`:

- `/presets status` — multi-line diagnostic produced by
  `formatStatus` in `src/commands/presets/status.ts`.
- `/presets clear` — multi-line summary produced by
  `renderClearSummary` in `src/activation/clear.ts`.

When invoked from the prompt, `notify` is the right surface — the
prompt is on screen and the user wants the output to land in the
scrollback. When invoked from the picker (clear is reachable today
via the `c` action key; status is currently unreachable from the
picker), `notify` is wrong because the picker's overlay covers the
notification.

This change adds a Status action to the picker, introduces a
shared "info-dialog" overlay component for read-only multi-line
output, and routes both status and clear through that dialog when
the call site is the picker — while leaving the prompt-invoked
paths on `ctx.ui.notify` exactly as today.

A near-cousin change (`surface-picker-activation-errors-in-overlay`)
will reuse the same info-dialog component for error output. Both
changes share the same dialog frame helper, so this change is the
natural place to introduce that shared scaffolding and refactor
`confirm.ts` to consume it.

## Goals / Non-Goals

**Goals:**

- Provide a shared `info-dialog` overlay component for read-only
  multi-line output (title + body + dismiss-only).
- Add a Status footer action to the picker that opens the
  computed `formatStatus` payload in the info-dialog.
- Route picker-initiated `clear` through the same info-dialog,
  rendering the existing `renderClearSummary` payload.
- Keep `/presets status` and `/presets clear` invoked from the
  prompt on `ctx.ui.notify` — behavior unchanged.
- Refactor `confirm.ts` and the new info-dialog to share a single
  dialog-frame helper rather than duplicating chrome rendering,
  and write that helper in a way that future overlays
  (error-dialog, reload-prompt) can adopt.

**Non-Goals:**

- Error display (covered by
  `surface-picker-activation-errors-in-overlay`).
- Replacing `openConfirm` (yes/no semantics; different widget).
- Changing the textual _content_ of `formatStatus` or
  `renderClearSummary` — only their delivery surface.
- Changing the prompt-invoked paths' behavior in any way visible
  to a user. The default for `/presets status` and `/presets
clear` from the prompt remains identical to today.
- Persisting any user preference about overlay vs. notify; the
  call site fully determines the surface.

## Decisions

### Decision: One info-dialog component, parameterized by tone

`src/ui/info-dialog.ts` exports `openInfoDialog(ctx, { title,
body, tone })` where `tone ∈ "info" | "warning" | "error"`. The
component is title-and-body only; it dismisses on Enter / Esc with
no choice resolution. Tone affects only the title color / footer
hint copy, not layout.

This single shape covers status (info), clear summary (info), and
the upcoming error path (error in
`surface-picker-activation-errors-in-overlay`). A separate
"warning" tone is reserved for any future caller that needs it.

Why parameterize tone instead of having three separate components:
the layout is identical; only color and the footer-hint copy
("Press Enter or Esc to dismiss") differ. Three components would
duplicate the entire frame, focus, and dismissal logic.

### Decision: Shared dialog-frame helper in `src/ui/frame.ts`

Today `src/ui/frame.ts` exports primitive helpers (`frameLine`,
`frameSegment`, `padToWidth`, `centerText`) and both `confirm.ts`
and `editor.ts` reach for them directly. The new info-dialog would
become a third caller of the same primitives, repeating the same
title/body/footer chrome assembly logic that `confirm.ts` already
contains.

This change extracts a higher-level helper:

```
renderDialogFrame(opts: {
  title: string;        // already styled
  bodyLines: string[];  // already styled, pre-wrapped
  footer: string;       // already styled
  width: number;
  theme: Theme;
}): string[]
```

That helper assembles top border + title row + blank + body rows +
blank + footer hint + bottom border. `confirm.ts`, the new
`info-dialog.ts`, and any future "reload prompt" overlay each
reduce to: assemble title/body/footer text, hand it to
`renderDialogFrame`, return the result.

`confirm.ts` is refactored as part of this change to consume
`renderDialogFrame`. The behavior is unchanged but the duplicated
chrome assembly disappears.

### Decision: Output-target seam — formatter vs. runner split

`status.ts` already separates `formatStatus(active, preset, ctx,
pi, theme): string` (pure) from `runStatus(ctx, pi)` (runner). The
formatter returns a single string with `\n` separators; both
notify and overlay consume that string verbatim. No behavioral
change to the formatter is required.

`clear.ts` similarly exposes `renderClearSummary(name, parts,
theme): string` (pure) and `clear(ctx, pi)` (runner that calls
`ctx.ui.notify` with the rendered string).

For picker-driven clear, the picker calls a smaller runner that
returns `{ name, parts }` instead of notifying — then the picker
itself renders the summary into the info-dialog. Concretely, this
change extracts `clearForPicker(ctx, pi): Promise<{ name: string,
parts: ClearPart[] }>` from the existing `clear()` body. The
existing `clear()` keeps its current shape (it still calls
`ctx.ui.notify`) and is what `/presets clear` from the prompt
calls.

For picker-driven status, the picker computes the same payload
that `runStatus` does — load, find, format — but renders it into
the info-dialog instead of notify. A small `formatStatusForPicker(ctx,
pi): Promise<string | null>` helper centralizes the load+format
pipeline so the picker doesn't reimplement it; `null` means "no
preset is active" and the picker renders the same one-line
message as notify does today.

This split avoids passing an output-target enum down through the
runner and avoids duplicating the load/find/format pipeline.

### Decision: Picker Status action keybinding

The picker grows a new footer entry: `Status (s)`. Pressing `s`
while focused on the list opens the info-dialog with the status
payload, computed against the currently selected preset's
**active state** (which is the global active state — Status does
not depend on which preset is highlighted). After dismissal the
picker stays open with focus restored.

Why `s`: free in the picker today; mnemonic matches the verb;
does not collide with existing `n`/`e`/`d`/`x`/`c` CRUD actions or
filter `/`. The footer hint row gains the entry in title-case
("Status") consistent with the existing footer hint vocabulary.

### Decision: Picker Clear continues to use `c`

Today `c` triggers a confirm-and-clear flow via `openConfirm`
followed by `clear()`. After this change `c` triggers
`openConfirm` followed by `clearForPicker()`, then renders the
result into the info-dialog. The confirm dialog's behavior is
unchanged.

If the user dismisses the confirm with No, no info-dialog opens.
If they confirm with Yes and clear runs successfully, the
info-dialog opens with the summary.

### Decision: Capability scoping

The info-dialog component is an internal UI primitive that lives
in the `preset-picker` capability's spec for now. If
`surface-picker-activation-errors-in-overlay` needs the dialog
from a non-picker call site (e.g. an apply-time error from
session restore), that change can promote the dialog to its own
capability or amend the picker capability to mention the wider
consumer set. For this change there is exactly one consumer, the
picker.

## Risks / Trade-offs

- [Risk] The dialog steals focus from the picker, then on
  dismissal focus must return cleanly to the picker. → **Mitigation:**
  Reuse the existing pattern from `editor.ts`'s confirm-dialog
  flow (`overlayHandle.setHidden(true)` → await dialog →
  `setHidden(false); focus(); requestRender()`).

- [Risk] The status payload is taller than the picker viewport. →
  **Mitigation:** The dialog already uses `overlayOptions.maxHeight`
  in confirm.ts; reuse the same pattern with `90%`. Long bodies
  scroll within the dialog (the existing `wrapWords` helper in
  confirm handles wrapping; we extend it to also handle a
  scrollable body if the dialog body would exceed maxHeight, but
  in practice status fits comfortably).

- [Risk] Refactoring `confirm.ts` to consume the new
  `renderDialogFrame` could introduce a regression in the editor's
  existing confirm flows (Move preset?, Hotkey shadows pi, Hotkey
  conflict, Save cancelled, Delete preset). → **Mitigation:**
  Keep existing `openConfirm` API surface unchanged (callers see
  no signature difference); add tests asserting the rendered
  output is identical pre- and post-refactor for at least one
  representative title/message pair.

- [Trade-off] The picker now has two paths to "see status":
  `s` from inside the picker, and `/presets status` from the
  prompt. They render differently (overlay vs. scrollback). This
  is intentional — the user picks the surface that matches their
  current context — but it does mean we maintain two output
  paths. The shared formatter prevents drift.

- [Trade-off] Adding `s` to the picker footer pushes against the
  width of the footer hint row on narrow terminals. → **Acceptable:**
  the footer hint row already truncates gracefully (`truncateToWidth`)
  and the existing keys all remain visible at typical widths.

## Migration Plan

No data migration. Roll forward by merging; rollback is a
revert. No user-facing announcement required beyond a CHANGELOG
entry — the new `s` action is additive, prompt-invoked
status/clear behavior is unchanged.

## Open Questions

- Should the info-dialog support a "copy to clipboard" affordance
  for the status text so users can paste it into bug reports? Not
  in scope here, but worth considering once the dialog is in
  place. Tracked outside this change.
