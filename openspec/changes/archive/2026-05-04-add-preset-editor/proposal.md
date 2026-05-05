## Why

This is the fifth of seven changes building `pi-presets-plus` (see `openspec/breakdown.md`). After change 4 the picker is read-only — users can browse and activate presets, but creating or modifying one still means hand-editing JSON. This change closes that gap. It introduces a single editor UI for one preset and wires inline picker actions that operate on it (new, edit, duplicate, delete, reorder). It also surfaces thinking-level validation in the UI for the first time — the editor's thinking-level radio respects the model's `reasoning` capability, and presets whose declared thinking level will be clamped at apply time get a small warning indicator in the picker.

After this change, every preset CRUD operation is reachable from the keyboard via `/presets` without ever opening a JSON file.

## What Changes

- Add `src/ui/editor.ts` exporting `openEditor(ctx, preset?)`. With `preset` undefined it opens for a new preset; otherwise it opens pre-populated for editing.
- Editor form rows: name (text input), scope (radio user/project), provider (select sourced from `ctx.modelRegistry`), model (select filtered to chosen provider, shows availability), thinking level (radio; `validThinkingLevels(model)` from change 3 disables invalid options; auto-snaps current selection to `"off"` only when the user changes the model and the previously-selected level becomes invalid), tools (toggle between `session` — pass session tools through unchanged — and `preset` — a multi-select of `pi.getAllTools()`), instructions (multi-line text area; Enter inserts a newline), hotkey (text input with format validation; warning displayed when changed — change 7 makes it functional), and Save / Cancel / Test actions.
- Wire picker action keys from change 4: `n` opens the editor with sensible defaults for a new preset; `e` opens editor for the selected preset; `d` duplicates the selected preset (creates a copy with a unique name suffix and clears `hotkey`); `x` confirms and deletes the selected preset; `⌃↑` / `⌃↓` reorder within scope; `c` clears the active preset.
- Add `clampWarning` computation in storage (delayed from change 2): for any loaded preset whose declared `thinkingLevel` is non-`"off"` and whose resolved model has `reasoning: false`, set `clampWarning: true`. The picker renders a small `⚠ thinking will be clamped` hint on those cards. The editor's radio uses the same logic to grey invalid options.
- Add a "Test (apply temporarily)" action in the editor that applies the current form state for the session without writing to disk. The user can then `Cancel` to walk away from a non-persistent change.
- Save validation in the editor: name uniqueness within the chosen scope; required fields; if the chosen hotkey is also held by another preset or matches a known pi built-in (e.g. `Ctrl+L`, `Ctrl+P`), warn and require explicit confirmation before saving.

## Capabilities

### New Capabilities

- `preset-editor`: editor dialog, picker CRUD action wiring, hotkey input field with conflict warnings (functional behavior in change 7), the editor's "Test (apply temporarily)" action, and the load-time `clampWarning` flag plus its picker indicator.

### Modified Capabilities

(None in delta-spec form.)

## Impact

- **JSON files are now written by the package** for the first time. The atomic-write recipe from change 2 is exercised in earnest. Every save from the editor routes through the existing storage CRUD primitives.
- **No external `$EDITOR` integration.** The instructions text area is fully in-process; Enter inserts a newline.
- **No new pi event handlers.** All UI work is request-driven via `ctx.ui.custom`. The `model_select` placeholder from change 3 stays a placeholder.
- **Hotkey field is captured but inert.** It is stored, validated for syntax, and warned about on conflict, but no `pi.registerShortcut` calls happen until change 7. The README documents this so users don't expect immediate effect.
- **Manual QA grows.** One UI surface (editor) plus picker action wiring means more visual smoke testing. The unit-testable layer (storage CRUD primitives, validation, thinking helpers, editor pure helpers) is covered by changes 2 and 3 plus the new helper tests added here.
