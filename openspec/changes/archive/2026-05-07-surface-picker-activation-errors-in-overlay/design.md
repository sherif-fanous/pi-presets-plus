## Context

`apply()` in `src/activation/apply.ts` writes errors directly to
`ctx.ui.notify("...", "error")` and returns `{ ok: false }`. Failure
modes today:

1. `preset.unavailable` (no-key / no-model) — refused before any
   pi state is touched.
2. `modelRegistry.find()` returns nothing for the preset's
   provider/model.
3. `pi.setModel()` returns `false` (the model resolves but its key
   disappeared between load and apply).

The picker calls `apply()` from inside an overlay that covers the
main pi window. When apply fails, the error notification lands on
the main window underneath the picker; the user sees a flash, then
just the picker, with no indication of what went wrong. The
canonical reproducer is activating a preset whose status is
`Unavailable — missing API key`: the activation refusal message is
hidden behind the picker frame.

This change makes picker-driven activation failures visible
without making the user dismiss the picker, by routing the failure
reason through the shared info-dialog overlay introduced in
`route-picker-info-output-through-overlay`. Hotkey-driven and
`--preset` flag-driven activation failures are out of scope: those
fire when no overlay is on screen, so `ctx.ui.notify` remains the
correct surface. They benefit only from the structural change to
`apply()`'s return shape, which lets callers route the same reason
through their own surface.

## Goals / Non-Goals

**Goals:**

- Make picker-driven activation failures visible while the picker
  remains open, by rendering them in the shared info-dialog
  overlay (tone = `"error"`).
- Plumb a structured failure reason out of `apply()` rather than
  having `apply()` write to the UI: `apply()` returns
  `{ ok: false, reason: string }`. Callers decide how to surface
  it.
- Keep the picker's "stay open on failure" behavior (already
  present today via `{ ok: false }`); only the surface for the
  reason changes.
- Reuse the `info-dialog` component from
  `route-picker-info-output-through-overlay` — no duplicate
  overlay scaffolding.
- Standardize the failure-reason vocabulary so every caller
  surfaces consistent text.

**Non-Goals:**

- Hotkey activation failures (`hotkeys.ts`) — keep on
  `ctx.ui.notify`. Hotkeys are pressed when the picker is
  typically not open; notify is the right surface.
- `--preset` CLI flag failures (`flag.ts`) — keep on
  `ctx.ui.notify`. Same reasoning.
- Session-restore failures (`index.ts`) — keep on
  `ctx.ui.notify`. Restore happens before any UI is interactive.
- Warnings (e.g. unknown-tools-dropped) — they remain on
  `ctx.ui.notify` with severity `warning`; only refusals shift to
  the dialog.
- New error categories. The set of failure modes covered is the
  set already produced by `apply()` today.
- Retry / "fix-and-reapply" affordances inside the dialog. The
  user dismisses, fixes, and re-activates manually.

## Decisions

### Decision: `apply()` returns `{ ok: false, reason }` instead of notifying

Today `apply()` is both an engine and a UI surface — it writes
errors to `ctx.ui.notify` and returns `{ ok: boolean }`. This
couples engine to UI and forces every caller to live with the
notify surface even when something better is available.

After this change, `apply()` returns:

```
type ApplyResult =
  | { ok: true }
  | { ok: false; reason: string }
```

The `reason` SHALL be the same text the engine would have notified
today (with vocabulary aligned to the editor's voice — see
`align-extension-vocabulary`). All five existing caller sites
(picker, hotkey, `--preset` flag, session restore, `/presets <name>`
router) update to surface the reason via the channel appropriate
to their context:

- Picker → `openInfoDialog(ctx, { title: "Activation failed", body: reason, tone: "error" })`.
- Hotkey, `--preset`, session-restore, router → `ctx.ui.notify(reason, "error")` (today's behavior, just plumbed via the return shape rather than fired from inside `apply`).

Why not parameterize `apply()` with an output target: that would
push the surface decision into the engine (knowledge it shouldn't
have) and make the return shape lie about what `apply()` actually
did. The "engine returns reason, caller chooses surface" split
keeps responsibilities cleanly separated and makes the caller-side
diff a one-line surface swap.

### Decision: Warnings stay on `ctx.ui.notify`

`apply()` also emits warnings (e.g. _"preset references unknown
tools: foo, bar. they were ignored."_) when a partial-success
condition occurs. Those don't refuse activation — they accompany
a successful apply. They stay on `ctx.ui.notify` with severity
`warning`. We don't return them in the result shape because doing
so would mix two concerns (refusals vs. accompaniments) into one
return path.

To keep the picker's "warnings are visible too" property, the
picker MAY (after activation succeeds and the picker closes)
already see warnings land in the main window. Improving warning
visibility while the picker is open is out of scope here.

### Decision: Reuse `info-dialog` from change #2

The dialog is the same component introduced by
`route-picker-info-output-through-overlay`, with `tone: "error"`.
The error tone affects only the title color (theme `error`) and
the footer hint copy (e.g. _"Press Enter or Esc to dismiss"_ —
unchanged from the info tone, since the user's only action is
dismissal). This avoids creating a second component for a UX
that's structurally identical.

### Decision: Standardize failure-reason text

Today the four refusal sites in `apply()` produce four bespoke
strings ("preset … is unavailable (no-key). activation
skipped.", etc.). This change centralizes the strings into one
place — either inline constants in `apply.ts` or a small
`failureReason(kind, ...args)` helper — so every caller surfaces
the same text and `align-extension-vocabulary` only has one site
to edit.

A `kind` enum keeps tests easy to assert against without
string-matching: `apply()` returns
`{ ok: false, reason: string, kind: "no-key" | "no-model" | "unknown-model" | "key-revoked" }`.
The picker error dialog displays the human-readable `reason`;
tests assert on `kind` for stability.

### Decision: Picker-side dialog wiring mirrors change #2

The picker calls `apply()` inside its existing keypress handler.
On `{ ok: false, reason }` it:

1. Hides the picker overlay (`overlayHandle.setHidden(true)`).
2. Awaits `openInfoDialog(ctx, { title: "Activation failed", body: reason, tone: "error" })`.
3. Restores the picker (`setHidden(false); focus(); requestRender()`).
4. Stays open with focus on the same row.

This is byte-for-byte the same pattern change #2 uses for
clear/status. Adding the failure dialog is a small extension of
the same flow, not new infrastructure.

### Decision: Capability scoping

The `apply()` return-shape change is a `preset-activation`
modification. The picker's "render reason in dialog" behavior is
a `preset-picker` modification. The info-dialog itself is
introduced by change #2 and remains under `preset-picker` (or
gets promoted later if multiple capabilities consume it; this
change does not promote it because hotkey/flag/restore intentionally
keep the notify surface).

## Risks / Trade-offs

- [Risk] All five caller sites must be updated together with the
  `apply()` return-shape change, or the build will break. →
  **Mitigation:** Single-commit change that touches all five
  sites; each site reduces to either `if (!result.ok) ctx.ui.notify(result.reason, "error")` or the picker's dialog branch.

- [Risk] The new `kind` field could leak into persisted state if
  callers serialize the result. → **Acceptable:** The result is
  a value object returned synchronously and consumed by one
  caller; nothing serializes it. We add a comment to
  `ApplyResult` saying "in-memory only".

- [Trade-off] Picker users now see a modal dialog on failure
  rather than a flashed notification. The dialog is heavier
  (requires Enter/Esc to dismiss) but actually visible — that's
  the point. → **Acceptable.**

- [Trade-off] Warnings remain on `ctx.ui.notify` even when the
  picker is open. The user may activate a preset that drops
  unknown tools and not see the warning until they close the
  picker. → **Acceptable for now;** a follow-up could add a
  warning surface in the picker if needed. Not in scope.

- [Risk] If change #2 doesn't land first, this change has nothing
  to call into. → **Mitigation:** Sequenced after #2 by tasks
  ordering. If they land out of order, this change's tasks list
  the info-dialog dependency explicitly so a reviewer catches it
  pre-merge.

## Migration Plan

No data migration. The `ApplyResult` return shape change is
internal — no external consumer of `apply()` exists outside this
package. Roll forward by merging the all-callers update; rollback
is a revert.

## Open Questions

_None._
