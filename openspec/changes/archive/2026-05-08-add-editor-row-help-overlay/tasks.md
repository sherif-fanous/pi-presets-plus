## 1. Help-content registry

- [x] 1.1 Define an interface near the editor's existing types: `interface EditorRowHelpEntry { readonly title: string; readonly body: readonly string[]; }`. Each `body` entry is one paragraph; the dialog joins paragraphs with `"\n\n"`.
- [x] 1.2 Define a module-level constant `EDITOR_ROW_HELP: Record<EditorRowId, EditorRowHelpEntry>` covering all 9 values of `EditorRowId` (`name`, `scope`, `provider`, `model`, `thinking`, `tools`, `instructions`, `hotkey`, `buttons`). Use a `Record<...>` type so TypeScript's exhaustiveness check fires on missing entries.
- [x] 1.3 Author content for each entry. Per-row content guidance:
  - **Name**: must be unique within the chosen scope; renaming an active preset migrates its file.
  - **Scope**: User vs Project, where each lives, the consequences of changing scope on an existing preset (confirm + file move).
  - **Provider**: sourced from `ctx.modelRegistry.getAll()`; only providers known to pi-coding-agent appear.
  - **Model**: filtered by Provider; entries with `(no key)` remain selectable so a preset whose key was lost can still be edited.
  - **Thinking**: six levels; what each means at a high level; reference to the inline hint when the model can't honor a level.
  - **Tools**: full session vs preset explanation (the long version of the inline hint).
  - **Prompt** (`instructions`): Enter inserts a newline; Tab exits; multi-line OK; the typed text is appended to Pi's system prompt at apply time, not replaced.
  - **Hotkey**: format (`ctrl+shift+1`, `ctrl+m`); blank means no hotkey; conflicts with other presets warn but don't block; matching a Pi built-in warns.
  - **Buttons** (`buttons`): Save persists the preset; Cancel discards changes; Test temporarily applies without persisting (when wired).
- [x] 1.4 Decide placement: leave the constant inline in `editor.ts` if it's < ~80 lines total, or move to a new file `src/ui/editor-help.ts` (re-exported for tests) if it exceeds that. Either is acceptable; pick at implementation time based on file length.

## 2. F1 interception

- [x] 2.1 In `src/ui/editor.ts`, add a private method `openHelpForFocusedRow(): Promise<void>` that reads `EDITOR_ROW_HELP[this.currentRow()]`, joins the paragraphs with `"\n\n"`, and calls `runWithHiddenOverlay(() => openInfoDialog(this.ctx, { title: entry.title, body: paragraphs.join("\n\n") }))`.
- [x] 2.2 In `handleInput`, add an interception block for `F1` near the existing Ctrl+S / Ctrl+T block. Use `matchesKey(input, Key.f1)`. On match, call `void this.runAsync(() => this.openHelpForFocusedRow())` and return early.
- [x] 2.3 Audit and document: pi-tui's `Input.handleInput`, the editor's textarea handler, and the existing key-binding chain do not bind `F1`. Add a comment naming the audit and a "re-audit if pi-tui's Input changes its key map" reminder, matching the audit-comment style introduced by `improve-editor-input-ux`.

## 3. Footer hint

- [x] 3.1 In `renderFooterHint()` (introduced by `polish-editor-picker-copy`), add the token `F1 Help` between `Enter Action` and `^S Save`. The token is unconditional — present in every render regardless of `this.options.onTest`.

## 4. Remove the Prompt row's inline hint

- [x] 4.1 In `renderInstructionsRows()`, remove the line that pushes the `PROMPT_NEWLINE_HINT` constant (introduced by `polish-editor-picker-copy`). The constant itself can be removed if it is not referenced elsewhere; if it is referenced by a help-overlay path or test fixture, keep it as a single source of truth.
- [x] 4.2 Verify the Prompt row continues to render its label, value/placeholder, and the row's general layout — only the inline general hint line is removed.

## 5. Tests

- [x] 5.1 Add a test that opens the editor, focuses each row in turn, presses `F1`, and asserts an info-dialog overlay opens with a title matching the focused row. Test all 9 rows OR test a representative subset (e.g. Name, Tools, Hotkey, Prompt).
- [x] 5.2 Add a test asserting that pressing `F1` while focused on the Prompt text area opens the Prompt help overlay AND that the Prompt buffer is unchanged (no F1 keystroke leaked into the textarea).
- [x] 5.3 Add a test asserting the help overlay's body for the Prompt row contains the Enter-newline / Tab-exit content (migrated from the inline hint).
- [x] 5.4 Add a test asserting `Esc` dismisses the help overlay and the editor restores to its pre-help focus state.
- [x] 5.5 Update `tests/ui/editor-input-ux.test.ts`'s footer test to expect `F1 Help` in the rendered hint.
- [x] 5.6 Update or remove any test asserting the Prompt row's inline hint string (`"Enter inserts a newline. Tab exits."`). The inline hint is gone; the assertion should either move to a help-overlay test or be deleted.
- [x] 5.7 Verify the Tools session-mode hint and the Thinking dimmed-levels hint remain inline (unchanged by this change). Add a regression test if not already covered.

## 6. Verification

- [x] 6.1 Run `mise run check` and resolve any failures.
- [x] 6.2 Run `openspec validate --strict preset-editor` to confirm the synced spec validates.
- [x] 6.3 Manually open the editor for an existing preset; press `F1` while focused on each row in turn; confirm the help overlay opens with row-appropriate content and Esc returns focus to the same row.
- [x] 6.4 Manually verify the Prompt row no longer shows the inline hint and that pressing F1 on the Prompt row opens help with the migrated content.
- [x] 6.5 Manually verify the Tools session-mode hint and the Thinking dimmed-levels hints still render inline (status feedback unaffected).
- [x] 6.6 Manually inspect the footer; confirm `F1 Help` appears between `Enter Action` and `^S Save`, regardless of whether a test callback is wired.
