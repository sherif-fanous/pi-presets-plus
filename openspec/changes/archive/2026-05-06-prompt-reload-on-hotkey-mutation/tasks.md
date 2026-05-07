## 1. Shared predicate

- [x] 1.1 Add `hotkeyChanged(prev: string | undefined, next: string | undefined): boolean` to `src/hotkey-conflicts.ts` (or a sibling file). Trim both inputs, treat undefined/empty as equivalent, return true when the trimmed strings differ. Add JSDoc explaining the contract and the empty-vs-undefined equivalence.
- [x] 1.2 Add a small `confirmReload(ctx): Promise<void>` helper that opens `openConfirm(ctx, "Reload Pi?", <body>)` and on Yes calls `ctx.reload()`, defensively guarding `typeof ctx.reload === "function"`. Catches reload errors and surfaces them via `ctx.ui.notify(_, "error")`.
- [x] 1.3 Unit-test `hotkeyChanged` for: both empty, both undefined, one empty / one whitespace, "ctrl+1" vs "ctrl+1", "ctrl+1" vs "ctrl+2", "ctrl+1" vs "", "" vs "ctrl+1".

## 2. Editor Save integration

- [x] 2.1 In `src/ui/editor.ts` after a successful Save (both new-preset and existing-preset paths, including the scope-move path), call `hotkeyChanged(initialPreset?.hotkey, savedPreset.hotkey)`. If true, await `confirmReload(ctx)` before `finish({ saved })`.
- [x] 2.2 Ensure the prompt opens exactly once per Save. For the scope-move path verify a single prompt regardless of the add+remove split.
- [x] 2.3 Hide and restore the editor overlay around the prompt the same way the existing confirm-shadows-pi flow does (the editor already has a `confirm()` helper that handles `setHidden` / focus).

## 3. Picker Delete integration

- [x] 3.1 In `src/ui/picker.ts` after a successful delete, call `hotkeyChanged(deletedPreset.hotkey ?? "", "")`. If true, await `confirmReload(ctx)` before refreshing the list.
- [x] 3.2 Hide and restore the picker overlay around the prompt using the same setHidden / focus / requestRender pattern other picker overlays use.

## 4. Tests

- [x] 4.1 Editor Save tests: add-hotkey, change-hotkey, remove-hotkey, no-change, scope-move-with-change, scope-move-without-change. Assert prompt fires exactly once iff `hotkeyChanged` is true; assert `ctx.reload` invocation happens iff the user chooses Yes.
- [x] 4.2 Editor Save failure test: validation error or persistence error → no prompt.
- [x] 4.3 Picker Delete tests: delete preset with hotkey → prompt; delete preset without hotkey → no prompt; user chooses No → picker refreshes and stays open without reload.
- [x] 4.4 ctx.reload error test: stub `ctx.reload` to throw; assert `ctx.ui.notify(_, "error")` fires once and the exception does not escape.
- [x] 4.5 ctx.reload absent test: stub `ctx.reload` as undefined; assert no prompt opens (fallback to inline notice).

## 5. Verification

Manual live-session checks below were marked complete at operator request after interactive verification.

- [x] 5.1 Run `mise run check` and confirm a clean tree.
- [x] 5.2 Manually verify in a live pi session: add a hotkey to a preset, save, choose Yes on the prompt, confirm pi reloads and the binding works on the next press.
- [x] 5.3 Manually verify: change a hotkey, choose No on the prompt, confirm the editor closes, the inline notice was visible during editing, and `/reload` (typed manually) eventually picks up the change.
- [x] 5.4 Manually verify: delete a hotkey-bearing preset from the picker, confirm the prompt fires, choose Yes, confirm pi reloads and the orphan binding is gone.
- [x] 5.5 Manually verify: delete a hotkey-less preset, confirm no prompt fires.
