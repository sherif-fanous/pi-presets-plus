## Why

The editor's Prompt row was specified and built as a "multi-line text area," but the implementation in `src/ui/editor.ts` renders the value as a single truncated row — `state.instructions.replaceAll("\n", " ↵ ")` is fed through `truncateToWidth(..., width - 16, "…")` and **no cursor glyph is drawn into the row at all**. The logical cursor moves on every keystroke, but the user sees nothing change after the first ~`width - 16` characters of content. Real-world preset prompts (markdown system prompts of 1–4 KB) cannot be authored in this UI: the cursor is invisible past the truncation point, there is no horizontal or vertical scroll, and arrow keys appear to do nothing.

This change replaces the inline single-row text area with an _activate-to-push_ multi-line editor backed by Pi's built-in `ctx.ui.editor` surface. The Prompt row remains a compact single-line preview in the form; pressing Enter on it pushes a full-screen prompt-edit surface with a real cursor, word-wrap, scroll, undo, kill ring, and paste support. The form's `state.instructions` is updated when the user confirms; cancellation discards the in-flight edit.

This change also adds a small `/presets show-prompt [name]` subcommand so the active preset's prompt — or any named preset's prompt — can be inspected from the chat without opening the picker. Inspecting a preset's prompt without activating it has no equivalent today: activation is the only way to "see" what a preset's prompt actually says, and activation is destructive (it also flips model / thinking / tools).

## What Changes

- **Replace the inline instructions text area with an activate-to-push pattern.** The Prompt row in the editor SHALL remain a single-line preview that flattens newlines to `" ↵ "` and truncates with `"…"` for layout purposes. Pressing Enter on the Prompt row SHALL push a dedicated full-screen prompt-editor overlay; pressing Tab / arrow keys SHALL continue to cycle row focus as today.
- **Back the prompt-editor overlay with Pi's built-in multi-line editor.** Call `ctx.ui.editor(title, prefill)` so unsaved edits live entirely in the host editor until the user confirms. Map returned text into form state and `undefined` to cancellation.
- **Update editor input dispatch.** `handleInstructionsInput` (currently the in-row character handler) SHALL be reduced to "Enter pushes the overlay; all other keys delegate to the form's focus manager." The current single-row cursor model (`instructionsCursor`, character-level left/right/backspace/insert) SHALL be removed; the overlay owns multi-line cursor state via its embedded `Editor`.
- **Preserve all current preset-editor semantics** (Save validation, name uniqueness, hotkey reload prompt, Test action, scope move, drift detection seeding, F1 help, etc.). The prompt-editor overlay is a child UI surface; it does not change the outer editor's contracts. Saving the outer editor still routes through `addPreset` / `updatePreset` with the (possibly updated) `instructions` value.
- **Add `/presets show-prompt [name]` subcommand.** With no name argument, the subcommand SHALL show the active preset's prompt if one is active and has a non-empty `instructions` field; if a preset is active with no prompt, or no preset is active, the subcommand SHALL emit a single-line informational message naming the case. With a name argument, the subcommand SHALL look up the preset by name across both scopes (project shadowing user, as elsewhere) and SHALL render that preset's prompt regardless of active state; an unknown name SHALL emit an error-severity message. The subcommand SHALL render the prompt via `pi-tui`'s existing `Markdown` component when the surrounding pi build exposes it; otherwise it SHALL fall back to plain text.
- **Add `show-prompt` to the `/presets` subcommand registry** so autocomplete surfaces it alongside `reload`, `clear`, and `status`. Argument-position autocomplete SHALL offer known preset names when the cursor is past the subcommand token.

## Capabilities

### Modified Capabilities

- `preset-editor`: the existing "Instructions text area" requirement is replaced by an "Activate-to-push prompt editor" requirement; the existing "Inline edit" and "Newline insertion" scenarios move into the overlay's contract.
- `presets-package`: the `/presets` subcommand registry SHALL include `show-prompt` and SHALL surface it through autocomplete.

### New Capabilities

(None — this change extends two existing capabilities rather than introducing a third.)

## Impact

- **Real-world prompts become editable inside Pi.** The single biggest friction in authoring presets via the picker is removed.
- **The activate-to-push pattern is borrowed from existing rows.** Hotkey input already enters a "capture mode" on activate; provider / model rows expand dropdowns on activate. The Prompt row joins that family rather than remaining the lone elastic widget.
- **No data-model change.** Presets continue to store inline `instructions: string`. The `instructionsFile` path option discussed during exploration was explicitly rejected (see design.md "Rejected alternatives").
- **No new dependencies.** The implementation uses Pi's existing extension UI APIs.
- **One new subcommand, one new spec requirement on `presets-package`.** `show-prompt` is a thin reader; it does not touch the activation overlay, the storage write path, or the hotkey registry.
- **Manual QA scope.** The full-screen prompt-editor overlay is a new visual surface; smoke testing covers push from each row direction, confirm / cancel round trips, paste of large content, undo, and word-wrap at narrow terminal widths.
