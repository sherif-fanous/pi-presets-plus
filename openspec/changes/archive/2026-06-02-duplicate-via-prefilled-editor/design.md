## Context

The editor (`src/ui/editor.ts`) is governed by a single field,
`this.initialPreset`:

- `initialPreset === undefined` → "new" mode: title `New preset`,
  `persist()` calls `addPreset`.
- `initialPreset !== undefined` → "edit" mode: title `Edit '<name>'`,
  `persist()` calls `updatePreset` (or move-across-scope), and the same
  reference drives `samePresetIdentity`, the active-preset reference, and
  reload-prompt identity.

`initialPreset` therefore conflates two responsibilities:

1. **Form seed** — what values pre-populate the rows.
2. **Edit-target identity** — the on-disk row to mutate.

Duplicate wants the first without the second: seed the form from the
source preset, but on Save create a *new* preset via `addPreset`.

Today `duplicate()` in `src/ui/picker-commands.ts` confirms, builds an
on-disk copy with `serializeForCopy` + `uniqueCopyName`, writes it via
`addPreset`, and reorders it immediately after the source.

## Goals / Non-Goals

**Goals:**

- Duplicate opens a pre-populated editor; the copy persists only on Save.
- Cancel leaves no preset behind.
- Cleanly separate the editor's form seed from its edit-target identity so
  `duplicate` mode cannot accidentally overwrite the source.

**Non-Goals:**

- Changing new/edit/delete flows beyond the internal `mode` refactor.
- Preserving the "insert immediately after source" placement (the copy now
  lands at end of scope).
- Renaming or restyling the editor title beyond the `Duplicate '<name>'`
  header.

## Decisions

**1. Explicit `mode: "new" | "edit" | "duplicate"` discriminator, with a
separate seed and target.** Chosen over a `{ seed, persistAs }` shape
because it reads cleanly against the existing `isEdit` checks and gives
each identity-keyed branch a single thing to switch on. The seed supplies
row values; the target (present only in `edit` mode) supplies the on-disk
identity for `updatePreset`/move and the identity checks.

| mode      | seed from | persist as           | target identity? |
| :-------- | :-------- | :------------------- | :--------------- |
| new       | defaults  | `addPreset`          | no               |
| edit      | source    | `updatePreset`/move  | yes (source)     |
| duplicate | source    | `addPreset`          | no               |

**2. `persist()` routes on `mode`, not on the presence of a seed.** The
critical invariant: in `duplicate` mode `persist()` MUST call `addPreset`
and MUST NOT call `updatePreset`/move. Every other `initialPreset`-keyed
check (`samePresetIdentity`, active-preset reference, reload-prompt
identity, title) keys off `mode`/`target`.

**3. Reuse `serializeForCopy` + `uniqueCopyName` to build the seed, not a
disk write.** `uniqueCopyName(...)` pre-fills the name row so Save will not
collide; `serializeForCopy` already clears the hotkey. The logic survives;
only its consumer moves from "write to disk" to "seed the editor."

**4. Copy lands at end of scope.** `addPreset`'s default append is kept;
the previous post-create `reorderWithinScope` is dropped. Keeping
"after source" would leak duplicate-context (the source index) into the
editor's save path, which the mode split is specifically trying to avoid.

## Risks / Trade-offs

- [Passing the source as `initialPreset` would make `persist()` overwrite
  the original] → The `mode` discriminator makes `duplicate` route to
  `addPreset`; the source is carried only as a seed, never as a target.
- [Identity-keyed branches silently using the seed] → Audit every
  `this.initialPreset?` reference and re-key it on `mode`/`target` so the
  seed is used only for row pre-population.
- [Lost "after source" placement is a minor UX regression] → Accepted;
  reorder remains available manually, and end-of-scope is predictable.
