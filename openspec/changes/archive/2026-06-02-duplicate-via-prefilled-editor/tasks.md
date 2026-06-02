## 1. Editor mode discriminator

- [x] 1.1 Add a `mode: "new" | "edit" | "duplicate"` discriminator to the editor's open options, with a separate seed (form values) and target (edit identity); update `openEditor(...)` and the editor types accordingly.
- [x] 1.2 Derive the editor title from `mode`: `New preset`, `Edit '<name>'`, or `Duplicate '<name>'`.
- [x] 1.3 Route `persist()` on `mode`: `new`/`duplicate` → `addPreset`; `edit` → `updatePreset`/move. Guarantee `duplicate` never calls `updatePreset` or the move flow.
- [x] 1.4 Re-key every `initialPreset`-based identity check (`samePresetIdentity`, active-preset reference, reload-prompt identity) onto `mode`/target so the seed is used only for row pre-population.
- [x] 1.5 In `duplicate` mode, seed the name row via `uniqueCopyName(...)` and clear the hotkey via the existing `serializeForCopy` logic.

## 2. Picker duplicate flow

- [x] 2.1 Rewrite `duplicate()` in `src/ui/picker-commands.ts` to drop `confirmAndActOnSelection` and route through the editor-dispatch path in `duplicate` mode seeded from the selection.
- [x] 2.2 Remove the post-create `reorderWithinScope` "insert after source" step; the copy lands at end of scope via `addPreset`.
- [x] 2.3 Repurpose `serializeForCopy` / `uniqueCopyName` to build the editor seed instead of writing to disk; remove the now-unused `DUPLICATE_LABEL` confirm wiring if nothing else consumes it.

## 3. Tests and verification

- [x] 3.1 Update/add tests: duplicate opens the editor pre-populated (unique name, cleared hotkey, `Duplicate '<name>'` title), persists via `addPreset` on Save, and creates nothing on Cancel.
- [x] 3.2 Add a regression test asserting `duplicate` mode never invokes `updatePreset`/move.
- [x] 3.3 Update picker tests that asserted the old confirm-then-write duplicate behavior.
- [x] 3.4 Run `mise run check` and resolve any format/lint/type/test failures.
