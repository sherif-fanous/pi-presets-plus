## Context

This change fixes a long-standing UX bug in the preset editor and adds one small reader subcommand. The bug: the Prompt row's implementation is a single-row truncated text widget pretending to be a multi-line text area. Real preset prompts are 1–4 KB markdown blocks; they cannot be authored or even meaningfully read in the current row.

The fix relies on Pi's built-in `ctx.ui.editor(title, prefill)` multi-line editor. That host API already wraps the same editor surface Pi users see elsewhere, so this extension only supplies the preset-specific title/prefill and maps `undefined` cancellation to the editor form's result shape.

## Goals / Non-Goals

**Goals**

- Replace the broken single-row Prompt input with an activate-to-push multi-line edit surface backed by Pi's built-in `ctx.ui.editor`.
- Preserve every other contract of the outer preset editor (Save validation, hotkey reload prompt, Test action, scope move, F1 help, drift detection, etc.).
- Add `/presets show-prompt [name]` for read-only inspection of preset prompts from the chat.

**Non-Goals**

- **`instructionsFile`** (storing the prompt as a path reference to an external markdown file). Explored and rejected — see "Rejected alternatives" below.
- **External `$EDITOR` shell-out.** Leaky abstraction: not every user has `$EDITOR` set, terminal multiplexers and SSH sessions interact badly, and the experience varies per terminal.
- **Inline expanding text area inside the form.** Considered and rejected — see "Rejected alternatives."
- **Live markdown-rendered preview half** alongside the editor (split view). Cool but YAGNI for v1; revisit if asked.
- **Picker-row prompt preview** (first ~80 chars of a focused row's prompt rendered inline). Out of scope; orthogonal change.
- **Picker-row "view full preset" modal (`v` key).** Considered; once activate-to-push lands, opening the editor on a row already shows the full prompt to a user willing to Cancel out. Not enough additional value to justify a new modal.
- **Tools-row activate-to-push** (same pattern applied to the chip list). Out of scope; deferred to a separate change if the chip list grows unwieldy.
- **Validation while editing the prompt** (length warnings, structure heuristics). Out of scope.
- **Variable substitution in prompts** (`{cwd}`, `{git_branch}`, etc.). Out of scope; was already deferred by the original `add-preset-editor` design and remains deferred.

## Decisions

### Push pattern, not inline elastic

```text
┌─ Edit preset: plan ─────────────────────────────────────────────┐
│ Name       plan                                                 │
│ Scope      (•) user   ( ) project                               │
│ Provider   amazon-bedrock                                       │
│ Model      us.anthropic.claude-opus-4-7                         │
│ Thinking   ( ) off  ( ) minimal  ( ) low  ( ) medium  (•) high  │
│ Tools      read  bash  mcp  web_search  ...                     │
│ Prompt     # Planning Mode ↵ You are in planning mode … ↵ Y…    │  ← single-line preview
│ Hotkey     ctrl+shift+1                                         │
│ [ Save ]  [ Cancel ]  [ Test ]                                  │
└─────────────────────────────────────────────────────────────────┘
  Tab/↓/↑ row · Enter activate row · Esc cancel form
```

When the Prompt row is focused and the user presses Enter, the form pushes a child overlay:

```text
┌─ Edit prompt: plan ─────────────────────────────────────────────┐
│                                                                 │
│ # Planning Mode                                                 │
│                                                                 │
│ You are in **planning mode**. Your single job is to deeply      │
│ understand the problem and produce a precise, actionable        │
│ implementation plan. You do **not** write or modify code in     │
│ this mode.█                                                     │
│                                                                 │
│ ## Hard rules                                                   │
│                                                                 │
│ - **Do not edit, write, create, move, or delete any files.**    │
│   You have no edit/write tools on purpose.                      │
│ ▼ more                                                          │
└─────────────────────────────────────────────────────────────────┘
  built-in editor confirm/cancel · arrows / page navigate
```

Confirm copies the built-in editor's returned text into the outer form's `state.instructions`; cancel (`undefined`) discards. The outer Save still fires only when the user explicitly presses Save in the outer form. This preserves the existing "Test (apply temporarily)" and "Cancel" semantics — Cancel in the outer form still throws away every change, including a confirmed-in-overlay prompt edit.

Why push, not inline elastic: the rest of the form is built around fixed-height rows (`renderValueRow`, `renderRadioRow`, etc.). Making one row variable-height forces every dropdown, diagnostic line, and help row to handle reflow. The complexity bleeds out of the Prompt row into the rest of the editor. Push localizes the multi-line concern to one child component.

Why push, not external `$EDITOR`: see Non-Goals.

### Backing the overlay with Pi's built-in editor

`ExtensionCommandContext.ui.editor(title, prefill)` is the host-level multi-line editor API. It gives the extension exactly the seam it needs: title in, initial text in, and either final text or `undefined` cancellation out. Using it avoids duplicating Pi's editor framing, keybindings, paste behavior, and future editor improvements in this package.

### Subcommand: `show-prompt`

The subcommand sits next to `reload`, `clear`, and `status` in `src/commands/presets/router.ts`'s `SUBCOMMANDS` registry. Behavior matrix:

| Invocation                    | Active state                            | Outcome                                       |
| ----------------------------- | --------------------------------------- | --------------------------------------------- |
| `/presets show-prompt`        | active preset, non-empty `instructions` | render prompt (markdown if available)         |
| `/presets show-prompt`        | active preset, empty `instructions`     | info: `Active preset "<name>" has no prompt.` |
| `/presets show-prompt`        | no active preset                        | info: `No preset is active.`                  |
| `/presets show-prompt <name>` | preset found, non-empty prompt          | render prompt                                 |
| `/presets show-prompt <name>` | preset found, empty prompt              | info: `Preset "<name>" has no prompt.`        |
| `/presets show-prompt <name>` | preset not found                        | error: `No preset named "<name>".`            |

Lookup follows the same scope-precedence rules as `findPreset` (project shadows user). Argument-position autocomplete (the same hook `presets-package` already uses for the subcommand list) SHALL offer known preset names when the cursor is past the subcommand token.

A pure formatter `formatShowPromptBody(preset | undefined, loadedByName, options): { body, severity }` keeps the runtime thin and matches the project's "pure formatter + thin runner" convention from `AGENTS.md`. Tests assert on the formatter; the runner is one function call away.

Why `show-prompt` and not `show-instructions`: the editor's row is labeled `Prompt` (per `src/ui/labels.ts`). Chat commands should sit in the same vocabulary the picker uses. `instructions` is the JSON field name; users of the picker may never see it.

Why optional name argument: peeking at a preset's prompt before switching to it is the natural workflow (e.g. "what does `llm-review` ask me to do? I want to know before I activate it"). Without the optional argument, the user would have to activate the preset to see the prompt — which is destructive (changes model / thinking / tools). The argument is cheap and addresses a real workflow.

## Spike outcomes

The installed Pi extension API exposes `ctx.ui.editor(title, prefill): Promise<string | undefined>`, documented as "Show a multi-line editor for text editing." That supersedes a custom `ctx.ui.custom` wrapper around `pi-tui`'s lower-level `Editor`: the package delegates to the host API and keeps only title construction plus result-shape normalization locally.

## Rejected alternatives

### `instructionsFile: "<path>"` (option D from exploration)

Store the prompt as a path reference into a markdown file next to the JSON. The activation overlay reads the file at apply time.

Considered for:

- Long prompts version-controlled and diffed cleanly. Real, but JSON is also versioned; diffs are readable enough.
- Sharing prompt libraries across teams / repos. Real, but the new overlay lets users paste markdown into the JSON in two seconds.
- Editing in the user's favorite editor. Solved by the push overlay.
- Reusing one prompt across multiple presets (a shared `preamble.md`). Real but speculative; YAGNI until someone files an issue.
- Running `markdownlint` / `prettier --parser markdown` / `vale` on the prompt. Real but niche.

Rejected because: two sources of truth for one logical field, hot-reload semantics need to follow file mtimes as well as JSON contents, picker UI needs a "this preset's prompt lives at a path" marker, atomic-write semantics extend across multiple files, and migration semantics for existing presets. The complexity is non-trivial; the use cases are addressable elsewhere or speculative.

If a concrete use case surfaces in an issue, revisit as a separate change.

### Inline expanding text area (option A from exploration)

Make the Prompt row grow vertically inside the form as the user types, with internal wrap and a 2-D cursor.

Rejected because: every other row in the form is fixed-height, and the layout primitives (`renderValueRow`, `renderRadioRow`, `renderDescriptorRow`, the diagnostic-line attachment) assume that. Making one row elastic ripples into every other row's layout, footer hint placement, and overlay alignment. The complexity cost lands across the whole editor, not just in the Prompt row.

### External `$EDITOR` shell-out (option C from exploration)

`e` on the Prompt row opens `$EDITOR` on a tmp file; on save the package reads the file back in.

Rejected because: not every user has `$EDITOR` configured (especially in SSH or tmux sessions with stripped environments); the resulting editor experience varies by terminal, OS, and the user's dotfiles; "press `e` and end up in an unfamiliar editor" is a usability cliff for newcomers; and `pi-tui`'s `Editor` makes the in-process flow comfortable enough that the value of shelling out is small.

### Full-preset "view" modal on a `v` picker key (mechanism α from exploration)

A read-only modal opened via `v` on any picker row, rendering every field of the highlighted preset.

Rejected because: every field except the prompt is already legible on the picker card itself (name, scope, provider/model, thinking, tools, hotkey). The only field the modal would meaningfully add is the prompt. Once the push overlay lands, a user can already see the full prompt by opening the editor and pressing Cancel. The marginal value of a dedicated read-only modal does not justify the additional surface.

`show-prompt` covers the chat-side equivalent of the same workflow.

## Risks

- **Host editor API contract.** The implementation depends on `ctx.ui.editor(title, prefill)` continuing to return edited text on confirm and `undefined` on cancel.
- **Visual interaction with the outer form.** Pushing the host editor from inside the preset editor temporarily hides the outer overlay and restores focus afterward, matching the existing nested-overlay pattern used by help and confirmation dialogs.
- **`pi-tui` `Markdown` component availability.** Older pi builds may not expose it. The `show-prompt` formatter falls back to plain text in that case; no hard dependency is created.
- **Test coverage for visual flow is limited.** Manual smoke testing covers the new overlay; unit tests cover the pure helpers (push trigger predicate, formatter for `show-prompt`, focus-cycle behavior when the Prompt row is focused).

## Out of scope (deferred follow-ups)

- Picker-row prompt preview line (passive visibility for the focused row).
- Markdown-rendered live preview half inside the overlay.
- Variable substitution (`{cwd}`, `{git_branch}`, ...).
- Tools-row activate-to-push.
- `instructionsFile` path option (revisit only if a concrete issue lands).
