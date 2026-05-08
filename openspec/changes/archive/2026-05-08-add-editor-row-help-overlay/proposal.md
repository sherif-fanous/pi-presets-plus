## Why

The preset editor exposes eight semantically distinct form rows
(Name, Scope, Provider, Model, Thinking, Tools, Prompt, Hotkey) plus
a button row. Several rows have non-obvious behavior — Scope's choice
determines where the file lives on disk and whether changing it later
moves the file; Hotkey's blank-vs-set distinction has runtime
implications; Tools' `session` vs `preset` modes mean different
things at apply time; the Prompt row's Enter inserts a newline rather
than submitting. Today this knowledge lives in three places:

- The OpenSpec specs (not visible to users).
- A few inline dim hints scattered through the dialog
  (`"Session: inherits the active tool set."`, `"Enter inserts a
newline. Tab exits."`, `"Dimmed levels are unavailable for this
model."`).
- Implicit conventions a user has to learn by trying.

Inline hints work for status feedback ("the current state of this
row has consequences") but are a poor fit for general explanations
("what does this row do?"). They consume vertical space in every
render, regardless of whether the user wants the explanation, and
they force every concept to fit on one short line.

This change adds a contextual help overlay: pressing `F1` while the
editor is focused opens an `info-dialog` overlay scoped to the
currently-focused row, showing a short authored explanation of that
row's purpose, behavior, and caveats. The footer hint surfaces `F1
Help` so the feature is discoverable.

## What Changes

- The editor SHALL accept the `F1` key as a global shortcut. When
  pressed, the editor SHALL open an overlay dialog (built on the
  existing `info-dialog` widget) showing per-row help content
  scoped to the currently-focused row. The overlay SHALL be
  dismissible via `Esc`.
- The footer hint SHALL include the token `F1 Help`. The token
  SHALL be unconditional (it does not gate on any callback wiring).
- Help content SHALL be authored as a `Record<EditorRowId, HelpEntry>`
  module-level constant, where each entry contains a title and one
  or more paragraphs of sentence-cased prose. The constant SHALL be
  the single source of truth for help text.
- The Prompt row's inline hint introduced by `polish-editor-picker-copy`
  (`"Enter inserts a newline. Tab exits."`) SHALL be REMOVED from
  the dialog body. Its content SHALL be migrated into the Prompt
  row's F1 help entry. Other inline hints — the Tools-row session
  hint (`"Session: inherits the active tool set."`) and the
  branched dimmed-levels hint — SHALL remain inline because they
  describe the row's _current state_, not its general behavior.
- Per-row help content SHALL cover at minimum: Name (uniqueness
  rules per scope), Scope (where each scope's files live, the
  consequences of changing scope on an existing preset), Provider
  (how the list is sourced), Model (why some entries appear with
  `(no key)` and remain selectable), Thinking (level meanings and
  the relationship to model capability), Tools (the full
  session-vs-preset explanation), Prompt (Enter behavior and that
  the prompt is appended to Pi's system prompt at apply time), and
  Hotkey (format, Pi-builtin warnings, conflict warnings, blank
  meaning no hotkey).

## Capabilities

### New Capabilities

<!-- None — the help overlay belongs to preset-editor as a new
     editor capability rather than a standalone capability. -->

### Modified Capabilities

- `preset-editor`: adds an F1-triggered contextual help overlay,
  the corresponding footer-hint token, the per-row help-content
  registry, and migrates the Prompt row's inline general hint into
  the help registry.

## Impact

- `src/ui/editor.ts`:
  - Add `F1` interception in `handleInput` near the existing
    Ctrl+S / Ctrl+T block.
  - Add a method that opens an `info-dialog` overlay with the help
    entry for `this.currentRow()` as content.
  - Remove the inline render of `PROMPT_NEWLINE_HINT` from
    `renderInstructionsRows()` (the constant itself can stay or
    be moved into the help-registry file).
  - Extend `renderFooterHint()` to include `F1 Help`.
- New file (or new section in `editor.ts`): `EDITOR_ROW_HELP`
  registry typed as `Record<EditorRowId, HelpEntry>` where
  `HelpEntry = { title: string; body: readonly string[] }` (or
  similar). Authored content per row.
- `src/ui/info-dialog.ts`: re-used as-is for the overlay. No changes
  expected, but verify the existing API supports being opened from
  inside another overlay (the editor itself is rendered via
  `ctx.ui.custom`).
- Tests:
  - New tests verifying F1 opens the help overlay scoped to the
    currently-focused row, and that the overlay's content matches
    the authored entry for that row.
  - Update the existing footer-hint tests in
    `tests/ui/editor-input-ux.test.ts` to expect `F1 Help` in the
    rendered hint.
  - Update or remove the test for the Prompt-row inline hint
    (since the inline hint is being removed in favor of F1
    content).
- No schema changes, no storage changes, no public-API changes.
- No new keyboard shortcut conflicts: `F1` is the universal "help"
  key and is not bound by pi-tui's `Input` widget, the multi-line
  textarea, or any other consumer in the editor's input handler
  chain. Audit notes this in the implementation comment.
