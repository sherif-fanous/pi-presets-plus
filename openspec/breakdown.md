# pi-presets-plus — change breakdown

This file captures _why_ the work for `pi-presets-plus` is split into seven incremental OpenSpec changes rather than one large change. The original umbrella change `add-presets-plus` was deleted after this breakdown was decided; its content was redistributed across the seven children, each of which is intended to stand alone.

## Versioning note

There are **no per-change version releases.** The first published version of `pi-presets-plus` is `v0.1.0`, which ships only after all seven changes are implemented and tested end-to-end. Each change here is a unit of work, not a release.

## Sequence and rationale

```
#  CHANGE                            CAPABILITY GAINED                     EFFORT
─  ──────                            ─────────────────                     ──────
1  scaffold-presets-plus             Empty publishable package; /presets   small
                                     command registers a no-op stub.

2  add-preset-storage                Read/write versioned JSON files in    med
                                     global+project scopes; validation,
                                     atomic write, scope merge with
                                     shadowing. /presets list (text).

3  add-preset-activation             apply / clear / re-apply (depth-1     large
                                     field-scoped) with session-restore
                                     soft-clear; instruction injection;
                                     status badge (no asterisk yet);
                                     activation marker message;
                                     /presets <name>, /presets clear.

4  add-preset-picker                 Multi-line picker UI on ctx.ui.       med
                                     custom: filter (literal-first),
                                     scope toggle, activate from list.
                                     Replaces text /presets list.

5  add-preset-editor                 Editor + capture-current dialog +     large
                                     CRUD (new, edit, duplicate, delete,
                                     reorder). Thinking-level validation
                                     surfaces here for the first time
                                     (radio + load warning + apply-time
                                     clamp notification).

6  add-preset-drift-detection        Mark-dirty semantics:                 small
                                       - model_select → mark dirty
                                       - turn_start → mark dirty
                                       - status badge gains *
                                       - bidirectional clean/dirty.

7  add-preset-shortcuts              --preset CLI flag, /presets next/     med
                                     prev cycle commands, per-preset
                                     hotkeys (with /reload caveat).
```

## Dependency graph

```text
   1 scaffold
       │
       ▼
   2 storage
       │
       ▼
   3 activation
       │
       ▼
   4 picker
       │
       ▼
   5 editor ──────────┐
       │              │
       ▼              ▼
   6 drift-detection  7 shortcuts
```

Strict order is **1 → 2 → 3 → 4 → 5 → 6 → 7**. Changes 6 and 7 don't depend on each other — they both depend on 5 — so they can ship in either order or in parallel if a contributor wants.

## Why these seams

- **#1 separate** so package mechanics (npm install, peer deps, pi command registration) are proven before any logic is at stake.
- **#2 before #3** so the storage layer can be 100% unit-tested in isolation, with no pi runtime to mock. v0.2.0-equivalent state is hand-edit-JSON-then-list, which is already useful (mirrors `pi list`).
- **#3 before any UI** so the core activation behavior can be exercised from the keyboard via `/presets <name>` and `/presets clear`. Confidence in the engine doesn't have to wait for UI.
- **#4 picker before #5 editor** because read-only widgets are a smaller risk than read-write forms; the picker proves the pi-tui composition pattern, the editor reuses it.
- **#5 lifts thinking-level validation** because that's the first change with a UI to display the warnings. Putting load-time `clampWarning` in #2 would create dead state with nothing to render it.
- **#6 isolates drift detection** because adding a `turn_start` handler that runs every turn for every user is a behavior change worth bisecting if anyone reports a slowdown.
- **#7 bundles the entry-point UX** (CLI flag, cycle commands, hotkeys) — none of these add core capability, they're all alternative ways to reach behavior that already exists by #6.

## Per-change rules

- Each change's `proposal.md` is self-contained: it states what _that_ change ships, not the long-term roadmap.
- Each change's `design.md` may briefly recap data model / pi-API patterns established by earlier changes (so it stands alone for archive-time reading), but does not re-derive them.
- Each change's specs introduce a new capability under `specs/<capability>/spec.md`. Where a later change must alter behavior introduced by an earlier one (e.g., #6 adds the dirty asterisk to the status badge defined in #4), it uses `## MODIFIED Requirements` deltas referencing the prior capability name.
- The original (deleted) `add-presets-plus` change held the comprehensive design discussion that produced this breakdown. The decisions captured there — depth-1 field-scoped restore, soft-clear after session restore, mark-dirty over auto-clear, append-not-replace for system-prompt injection, binary thinking-level validation — are reflected verbatim in the relevant child changes.
