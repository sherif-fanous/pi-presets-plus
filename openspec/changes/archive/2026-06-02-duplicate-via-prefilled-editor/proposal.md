## Why

Duplicating a preset today opens a confirmation dialog, writes a `-copy`
to disk, and leaves the user to scroll to it, open the editor, tweak, and
save — five steps for what is almost always "clone, then adjust one or
two fields." The confirm also guards a non-destructive action (creating a
preset), which is backwards: confirms should protect destructive
operations like delete, not routine creation.

## What Changes

- Replace the duplicate confirmation + immediate disk write with a
  pre-populated editor overlay seeded from the source preset. The user
  edits and saves; the copy is persisted only on Save.
- Cancelling the editor creates no preset — no orphan `-copy` rows are
  left behind.
- Introduce an explicit editor `mode: "new" | "edit" | "duplicate"`
  discriminator so the form seed (what to pre-populate) is separated from
  the edit-target identity (the on-disk row to mutate). In `duplicate`
  mode the editor seeds rows from the source but persists via `addPreset`,
  never `updatePreset`.
- Seed the duplicate's name row with the next available
  `uniqueCopyName(...)` and clear the hotkey so Save does not collide.
- The duplicated preset lands at the end of its scope (the `addPreset`
  default); the previous "insert immediately after source" reorder is
  dropped.
- The editor title in `duplicate` mode reads `Duplicate '<name>'`.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: The picker's `d` (duplicate) key SHALL open the editor
  pre-populated from the source preset instead of confirming and writing a
  copy directly; the editor SHALL gain a `mode` discriminator that
  separates the form seed from the edit-target identity, with `duplicate`
  mode persisting via `addPreset`. The duplicate scenario's
  reorder-after-source behavior is removed.

## Impact

- `src/ui/picker-commands.ts`: `duplicate()` drops the
  `confirmAndActOnSelection` wrapper and routes through the
  editor-dispatch path with a duplicate seed; `serializeForCopy` and
  `uniqueCopyName` survive but feed the editor seed rather than writing to
  disk.
- `src/ui/editor.ts`: `openEditor` accepts the `mode` plus a separate
  seed/target; `persist()`, the title, and every `initialPreset`-keyed
  identity check (`samePresetIdentity`, active-preset reference,
  reload-prompt identity) key off `mode`/`target` rather than the seed.
- `openspec/specs/preset-editor/spec.md`: duplicate requirement and
  scenario updated.
