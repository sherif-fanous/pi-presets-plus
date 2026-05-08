## Context

The preset editor renders a single bordered overlay with eight form
rows + a button row. Three of the rows already carry inline dim
hints describing some aspect of their state (Tools' session-mode
hint, Prompt's Enter-newline hint, Thinking's branched
dimmed-levels hint). The dialog has no other documentation surface.

Editor row semantics that today have no in-app explanation:

- **Name** — must be unique within the chosen scope; renaming an
  active preset migrates its file.
- **Scope** — user vs project, where the file lives, the
  consequences of changing it on an existing preset (a confirm
  dialog plus a file move).
- **Provider** — sourced from `ctx.modelRegistry`; the displayed
  list reflects providers known to pi-coding-agent.
- **Model** — entries without configured auth show `(no key)` and
  remain selectable so a preset whose key was lost can still be
  edited.
- **Thinking** — six levels with model-capability gating; the
  inline hint covers status only.
- **Tools** — session vs preset modes have different storage and
  apply-time semantics; the inline hint covers only the
  session-mode summary.
- **Prompt** — Enter inserts a newline (not submit), Tab exits;
  the typed text is appended to Pi's system prompt at apply time
  (not replaced).
- **Hotkey** — format (e.g. `ctrl+shift+1`), conflict and
  Pi-builtin warnings, blank meaning no hotkey.

The editor's existing infrastructure already supports nested
overlays via `runWithHiddenOverlay`, used today for `openConfirm`.
Reusing that pattern with `openInfoDialog` makes the help overlay
mechanically straightforward.

## Goals / Non-Goals

**Goals:**

- Single keystroke (`F1`) anywhere in the editor opens a help
  overlay scoped to the focused row.
- Help content lives in one authored constant; it does not
  duplicate the spec, the inline status hints, or any prose
  scattered through the implementation.
- The Prompt row's inline GENERAL hint (`"Enter inserts a newline.
Tab exits."`) is removed from the dialog body and migrated into
  the Prompt help entry. STATUS hints (Tools session, dimmed
  levels) stay inline.
- The footer hint surfaces `F1 Help` so the feature is
  discoverable without reading documentation.

**Non-Goals:**

- No per-row `?` glyph in the dialog body. Discoverability comes
  from the footer alone in v1; per-row indicators can be revisited
  if user feedback shows they're needed.
- No upstream changes to pi-tui or to `info-dialog`.
- No keyboard navigation inside the help overlay beyond Esc to
  dismiss (the `info-dialog` widget already supports Enter and Esc).
- No localization. English-only authored content matching project
  conventions.
- No screenshots, no images, no rich formatting. Plain prose
  paragraphs.

## Decisions

### Decision: F1 as the trigger key

```
Candidate          Pro                                  Con
─────────────────────────────────────────────────────────────────────
F1                 universal "help" key, almost never  Some terminal
                   bound elsewhere; not consumed by    keymaps map
                   pi-tui's Input or the textarea.     F1 to escape
                                                        sequences but
                                                        the editor
                                                        already handles
                                                        escape sequences
                                                        via matchesKey.
Ctrl+/             not commonly bound; easy to type.   Less recognizable
                                                       as "help".
?  (literal)       intuitive.                          Conflicts with
                                                       text-input rows
                                                       (typing "?" must
                                                       insert a "?").
Ctrl+H             "help" mnemonic.                    Conflicts with
                                                       backspace in some
                                                       terminal modes.
```

F1 is the conventional answer. It's the standard "help" key across
desktop and TUI applications (Midnight Commander, ranger, less,
nano, htop, irssi, etc.). pi-tui's `Input.handleInput` does not
handle F-keys; the editor's textarea similarly does not. The audit
comment for the new shortcut block names these.

### Decision: per-row content, not per-dialog

The user-facing question is "what does _this_ row do?", not "how
does the editor work?". The editor as a whole is small enough that
a single help screen would just paraphrase the spec. Per-row
content is more useful and naturally bounded to a few sentences
each.

### Decision: reuse `info-dialog` widget

`info-dialog` already renders a centered overlay with a title, a
multi-paragraph body, an Enter/Esc dismissal contract, and a
tone-aware footer (`info` / `warning` / `error`). Help uses
`info-dialog` with `tone: "info"` (the default) and:

- `title`: the row's display label (e.g. `"Name"`, `"Tools"`).
- `body`: the row's authored prose, joined with `\n\n`.

The editor's existing `runWithHiddenOverlay` pattern (used for
`openConfirm`) is reused to hide the editor while the help overlay
is up:

```ts
private async openHelpForFocusedRow(): Promise<void> {
  const entry = EDITOR_ROW_HELP[this.currentRow()];

  await this.runWithHiddenOverlay(() =>
    openInfoDialog(this.ctx, {
      title: entry.title,
      body: entry.body.join("\n\n"),
    }),
  );
}
```

`F1` interception in `handleInput`:

```ts
// Audited pi-tui Input.handleInput, the multi-line textarea
// handler, and matchesKey: none consume F1. Re-audit if pi-tui's
// Input changes its key map.
if (matchesKey(input, Key.f1)) {
  void this.runAsync(() => this.openHelpForFocusedRow());
  return;
}
```

`runAsync` is reused so the existing `actionInFlight` guard prevents
re-entry while the help overlay is open and so the editor's render
state stays consistent.

### Decision: help content is a typed module-level constant

```ts
interface EditorRowHelpEntry {
  readonly title: string;
  readonly body: readonly string[];   // one string per paragraph
}

const EDITOR_ROW_HELP: Record<EditorRowId, EditorRowHelpEntry> = {
  name:         { title: "Name",     body: [...] },
  scope:        { title: "Scope",    body: [...] },
  provider:     { title: "Provider", body: [...] },
  model:        { title: "Model",    body: [...] },
  thinking:     { title: "Thinking", body: [...] },
  tools:        { title: "Tools",    body: [...] },
  instructions: { title: "Prompt",   body: [...] },
  hotkey:       { title: "Hotkey",   body: [...] },
  buttons:      { title: "Actions",  body: [...] },
};
```

The `Record<EditorRowId, ...>` typing makes it impossible to forget
a row: TypeScript's exhaustiveness check fires if a future
`EditorRowId` value is added without help content.

The constant lives at module scope in `editor.ts` (or a sibling
file `editor-help.ts` to keep `editor.ts` from growing). Either
placement works; choose by file-size feel at implementation time.

### Decision: remove only the GENERAL inline hint (Prompt), keep STATUS hints

```
Inline hint                                          After this change
─────────────────────────────────────────────────────────────────────────
"Session: inherits the active tool set."             KEEP (STATUS — depends
                                                     on toolsMode)

"Enter inserts a newline. Tab exits."                REMOVE (GENERAL — same
                                                     answer regardless of state)

"This model does not support thinking."              KEEP (STATUS — depends
"Dimmed levels are unavailable for this model."      on selected model)
```

The Prompt row's inline hint is the only one that's purely general
("Enter inserts a newline" is true regardless of any state). The
other inline hints describe what the _current_ state means and
update as the user makes choices — the help overlay would need to
re-render every time, defeating the point of moving content into
help.

So this change removes one inline line and adds one help entry per
row. The Tools and Thinking rows' help entries reference the
inline hints, so the user can read the row's general semantics in
F1 and see status feedback in the dialog body.

### Decision: footer hint adds `F1 Help` unconditionally

The `F1 Help` token sits in the footer regardless of whether the
caller wired a test callback (unlike `^T Test`, which gates on the
callback). Help is always available; no caller condition makes it
not.

After `polish-editor-picker-copy` collapses the footer to one
line, the new hint length grows by ~8 chars to about 95 chars
(with all tokens) — still under the 100-column threshold, still
fits without wrap on standard terminals. The line:

```
 ⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · F1 Help · ^S Save · ^T Test · Esc Cancel
```

If you don't have a test callback, drop `^T Test ·` (~84 chars).

Placement: `F1 Help` sits between `Enter Action` and `^S Save`,
separating navigation/action keys from save/cancel shortcuts. A
visual divider that signals "the rest are commit-or-cancel keys".

## Risks / Trade-offs

- **[Risk]** F1 is sometimes intercepted by terminal multiplexers
  (tmux, screen) that bind it to escape or menu activation. → Same
  risk as Ctrl+S/Ctrl+T in the previous change. Footer hint is a
  hint, not a guarantee; users in incapable terminals fall back
  to no help (the inline status hints still convey current state).
  Acceptable.
- **[Risk]** Authoring eight help blurbs is real content work, and
  content drift is a maintenance hazard (specs change, prose
  doesn't get updated). → Mitigation: keep the prose short
  (1–3 paragraphs per row), fact-checked against the relevant
  spec at authoring time. Not a goal to mirror the spec verbatim.
- **[Risk]** Nested overlays interacting with `runWithHiddenOverlay`
  might surface a bug not caught by the existing `openConfirm`
  path (different content layout, different focus dynamics). →
  Mitigation: the contract is the same: editor hides, child
  overlay runs, child resolves, editor restores. New tests
  exercise the open/close cycle.
- **[Trade-off]** Help content is plain prose, not interactive.
  Users can't drill into "show me the spec for this", "show me an
  example preset". Fine for v1; later iterations can add inline
  links or examples if needed.
- **[Trade-off]** Removing the Prompt row's inline hint means a
  user who has not discovered F1 may press Enter on the Prompt
  row and be momentarily confused. Mitigation: F1 Help is in the
  footer; the worst case is a few keystrokes of confusion before
  the user reads the footer. The status hints (Tools, Thinking)
  stay because they update with state and _can't_ live in a help
  overlay.
