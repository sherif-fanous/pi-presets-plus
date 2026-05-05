## 1. Validate extension

- [x] 1.1 Extend `src/store/validate.ts` with `computeClampWarning(p, ctx)` per design
- [x] 1.2 Unit tests for `computeClampWarning` covering reasoning model + non-off, non-reasoning model + non-off, off level, unknown model
- [x] 1.3 Update `src/store/api.ts` `loadAll` so each `LoadedPreset` carries `clampWarning` (computed via `computeClampWarning`)
- [x] 1.4 Extend the `LoadedPreset` type with the `clampWarning?: true` field

## 2. Picker card extension

- [x] 2.1 Update `src/ui/widgets.ts` `PresetCard` to render `⚠ thinking will be clamped` when `loaded.clampWarning === true`
- [x] 2.2 Manual visual smoke test

## 3. Hotkey input helper

- [x] 3.1 Create `src/ui/hotkey-input.ts` with `parseHotkey(text)` returning `{ ok: boolean; reason?: string }`
- [x] 3.2 Add a constant list of documented pi built-ins (Ctrl+L, Ctrl+P, Ctrl+R, Ctrl+C, Ctrl+D, Ctrl+S, etc.) sourced from `docs/keybindings.md`
- [x] 3.3 Export `isPiBuiltin(parsedKey)` and `findConflictingPreset(parsedKey, loadedPresets, excludeName)`
- [x] 3.4 Unit tests for parse, builtin detection, and conflict detection

## 4. Editor

- [x] 4.1 Create `src/ui/editor.ts` exporting `openEditor(ctx, preset?)` returning `Promise<{ saved?: LoadedPreset; tested?: LoadedPreset } | undefined>`
- [x] 4.2 Build root container with form rows (LabelRow, RadioRow, SelectRow, MultiToggleRow, TextAreaRow, InputRow, ButtonsRow) — implement these as small helpers
- [x] 4.3 Implement Tab cycling between rows; per-row input handling
- [x] 4.4 Wire model select to re-evaluate `validThinkingLevels` on change; auto-snap and inline-notice when current level becomes invalid; auto-snap fires only on user-driven model/provider change, not on editor open
- [x] 4.5 Implement tools row with `session` / `preset` toggle; pre-check from preset.tools or current active tools
- [x] 4.6 Implement instructions text area (typing, backspace, arrow keys, Enter inserts newline)
- [x] 4.7 Implement hotkey input field; on save, validate via `parseHotkey`, check `isPiBuiltin` and `findConflictingPreset`, prompt confirmation as needed; show "/reload required" notice when value changed from saved
- [x] 4.8 Implement Save flow: validate required fields, validate name uniqueness within scope, route through `addPreset`/`updatePreset`; on scope change for existing preset, prompt then move
- [x] 4.9 Implement Cancel
- [x] 4.10 Implement Test (apply temporarily): build synthetic Preset from form, invoke activation `apply`, close editor without writing; the resolved result SHALL carry the candidate preset under `tested`
- [x] 4.11 Special case: renaming the currently-active preset updates in-memory `active` and appends a fresh `presets-plus:active` entry
- [x] 4.12 Hide the Test button when no `onTest` callback is wired
- [x] 4.13 Extract pure helpers (`initialState`, `buildPreset`) and add unit tests under `tests/ui/editor-helpers.test.ts`

## 5. Picker CRUD wiring

- [x] 5.1 Wire `n` → `await openEditor(ctx)` (no preset; new-preset defaults); on success, refresh list
- [x] 5.2 Wire `e` → `await openEditor(ctx, selectedPreset)`; on success, refresh list
- [x] 5.3 Wire `d` → confirm "Duplicate '<name>'?", build copy with unique name suffix and cleared hotkey, persist via `addPreset` to same scope, then `reorderWithinScope` to slot the copy after the source
- [x] 5.4 Wire `x` → confirm "Delete '<name>'?", call `removePreset`, refresh
- [x] 5.5 Wire `c` → confirm "Clear active preset?", call activation `clear`
- [x] 5.6 Wire `Ctrl+↑` / `Ctrl+↓` → reorder within scope via `reorderWithinScope`; clamp at scope boundaries (no-op)
- [x] 5.7 After every CRUD operation, call `loadAll` and re-render the picker
- [x] 5.8 Plumb the editor's `tested` payload through to the picker's resolved result so the outer surface names the right preset

## 6. Command surface guardrails

- [x] 6.1 Keep `/presets save` unsupported; verify it does not open the editor
- [x] 6.2 Keep `/presets edit` unsupported; verify it does not open editor
- [x] 6.3 Keep `/presets rm` unsupported; verify it does not remove presets
- [x] 6.4 Keep `getArgumentCompletions` from adding `save`, `edit`, or `rm`

## 7. Manual QA

- [x] 7.1 Use the editor to create a new preset from scratch with a reasoning model and `thinking: high`; verify file persisted; activate; confirm behavior
- [x] 7.2 In the editor, change the model to a non-reasoning one; verify thinking radio greys non-`off` options and snaps current selection; save; verify file omits the high level (or saves it, depending on user choice — the file stores what's selected)
- [x] 7.3 Edit instructions via the inline text area, including a multi-line entry; save; verify newlines round-trip
- [x] 7.4 Add a hotkey conflicting with `ctrl+l`; verify confirmation prompt
- [x] 7.5 Add a hotkey already used by another preset; verify confirmation prompt
- [x] 7.6 Save with an existing name in the chosen scope; verify refusal
- [x] 7.7 Move a preset between scopes; verify confirmation, removal from old scope, addition to new
- [x] 7.8 Picker actions: new, edit, duplicate, delete, reorder, clear — exercise each
- [x] 7.9 Activate preset, edit, rename it; verify status badge shows new name and active state survives
- [x] 7.10 Use Test in the editor; verify apply runs without persisting and the picker's outer notice names the candidate preset
- [x] 7.11 Verify clamp warning hint shows in picker for a preset with non-reasoning model + non-off thinking
- [x] 7.12 Open the editor for a clamp-warning preset; verify thinking level remains at the declared value, no "switched to off" notice appears, and a no-edit Save round-trips the original `thinkingLevel`
