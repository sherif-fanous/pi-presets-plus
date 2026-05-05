## Context

This change adds the editor dialog and wires CRUD into the picker. After this change, the user never has to open the JSON file unless they want to. The picker becomes the central control surface and the editor becomes the form for one preset (used for both "new" and "edit" flows).

The thinking-level validation logic is already present (`validThinkingLevels` and `effectiveThinkingLevel` from change 3); this change is the first time we have a UI in which to render its results. Most of the new code is TUI composition.

## Goals / Non-Goals

**Goals**

- One usable editor UI, plus picker CRUD action wiring, all keyboard-driven.
- Editor that's reactive: changing the model re-evaluates valid thinking levels and snaps invalid selections — but only when the user changes the model, never on open.
- Picker CRUD that feels native: action keys defined in change 4 now do real work.
- Surface load-time `clampWarning` in the picker so users see thinking-clamp issues without activating.

**Non-Goals**

- Capture-current dialog. The "save my live state" affordance is dropped from this change. Users press `n` in the picker to open the editor with sensible defaults for a new preset.
- External `$EDITOR` integration for the instructions text area. The text area is fully in-process; Enter inserts a newline.
- Per-preset hotkey _registration_ (change 7). The hotkey field is captured and validated; nothing is bound until change 7.
- Drift detection (change 6). The editor doesn't show drift state; the picker doesn't render the dirty asterisk yet.
- File-watching. External edits still require `/presets reload` or `/reload`.
- Variable substitution in instructions (e.g. `{cwd}`, `{git_branch}`). Future work.
- Importing presets from `examples/extensions/preset.ts`'s config files. Documented as out of scope; users copy by hand.

## Decisions

### Editor layout

```text
┌─ Edit preset: plan ─────────────────────────────────────┐
│                                                         │
│  Name        [ plan____________________________ ]       │
│  Scope       (•) user   ( ) project                     │
│                                                         │
│  Provider    [ anthropic ▾ ]                            │
│  Model       [ claude-opus-4.5 ▾ ]                      │
│              200k ctx · reasoning ✓ · key ✓             │
│                                                         │
│  Thinking    ( ) off   ( ) minimal   ( ) low            │
│              ( ) medium   (•) high   ( ) xhigh          │
│              ↑ all selectable (model is reasoning)      │
│                                                         │
│  Tools       (•) session   ( ) preset                  │
│              session: whatever tools are active right   │
│              now pass through unchanged                 │
│                                                         │
│  Instructions                                           │
│   ┌───────────────────────────────────────────────────┐ │
│   │ You are in PLANNING MODE. Your job is to deeply…  │ │
│   │                                                   │ │
│   └───────────────────────────────────────────────────┘ │
│   Enter newline · Tab leave row                         │
│                                                         │
│  Hotkey      [ ctrl+shift+1________ ]                   │
│              ⓘ takes effect after /reload (change 7)    │
│                                                         │
│  [ Save ]   [ Cancel ]   [ Test (apply temporarily) ]   │
└─────────────────────────────────────────────────────────┘
```

Composed from `Container` + custom row widgets (`LabelRow`, `RadioRow`, `SelectRow`, `MultiToggleRow`, `TextAreaRow`, `InputRow`, `ButtonsRow`). Tab cycles focus between rows. Each row owns its own input handling.

### Model dropdown sourcing

The Model row is populated from `ctx.modelRegistry.getAll()` rather than `getAvailable()`. This matters for the key-rotation path: a user who revokes or rotates an API key and then opens `/presets → edit` on a preset bound to the now-unkeyed provider would otherwise see the dropdown drop the original entry and be unable to cycle back to it. With `getAll()` the entry stays visible; we annotate each `ModelItem` with an `available: boolean` computed via `hasConfiguredAuth(model)` and render unavailable entries with a dim `(no key)` suffix. Save is permissive — the downstream `computeAvailability` check already tags the preset with `unavailable: "no-key"` at load time, so the picker card still surfaces the problem. The editor trades strict dropdown filtering for the reversibility invariant "what you can load, you can re-select and re-save".

### Reactive thinking radio

When the user changes the model select, the editor re-evaluates `validThinkingLevels(model)`. Invalid options render greyed and become unselectable. If the currently-selected level is no longer valid, the editor snaps the selection to `"off"` and shows a small inline notice: "model doesn't support extended thinking — switched to off."

This auto-snap is **only** triggered by user-driven model/provider changes. Opening the editor for a preset whose declared thinking level is already incompatible (e.g. a preset carrying `clampWarning: true`) leaves the form's selected level untouched, displays the disabled radio entries dimmed, and shows no "switched to off" notice. This matters because the storage spec requires that the user's preset file is never silently modified by the package; opening + saving without intentional edits must round-trip the original `thinkingLevel`.

This is the only piece of _editor logic_ (vs. layout) that's nontrivial. It's important because it eliminates the "saved a preset that won't do what I think" failure mode entirely.

### Tools row: session vs. preset

```text
Tools       (•) session   ( ) preset
              session: whatever tools are active right now pass through unchanged
```

Switching to `preset` mode reveals a multi-toggle for all tools from `pi.getAllTools()`, pre-checked from the preset's current `tools` list (or from `pi.getActiveTools()` if the preset has no tools yet):

```text
Tools       ( ) session   (•) preset
              [x] read   [x] grep   [x] find
              [x] ls     [ ] bash   [ ] edit  …
```

`session` means the saved preset has no `tools` field (per change 3, presets without `tools` don't touch `pi.setActiveTools` on apply) — the session's active tools pass through at apply time. `preset` means the saved preset carries an explicit `tools` array that wins at apply time. The editor's labels pair with `formatToolsSummary` on the picker card (`"session: read, bash"` / `"preset: read, grep"`) so users see the same vocabulary on both surfaces.

The multi-toggle's pre-selection is computed **eagerly, at open time**, from either the preset's own `tools` field (when present) or `pi.getActiveTools()` (when absent). Eager pre-fill matters for two reasons: (1) it decouples the initial selection from whatever the user does between opening the editor and first toggling to `preset` mode; (2) it lets the user switch to `preset` mode and hit Save without any extra interactions to replicate their current session. While the user stays in `session` mode the persisted preset still omits `tools` — the pre-fill only materializes on disk if they explicitly toggle.

Built-in pi tools and tools from other extensions are mixed; we don't differentiate. (We could tag with `sourceInfo.source`, but it's noise for v1.)

### Instructions text area

The text area supports basic editing (typing, backspace, arrow keys). Pressing Enter inserts a literal `\n` into the buffer; pressing Tab cycles focus to the next row (so the user can leave the text area without saving). There is no external-editor escape hatch in this change — keeping the workflow fully in-process avoids the shellish edge cases (`$EDITOR` unset, `vi` missing, tempfile cleanup on crash) and shrinks the dependency surface. Users with very long instructions can hand-edit the JSON file directly and `/presets reload`.

### Hotkey field

Free-text input with format hints ("ctrl+shift+1", "alt+p"). On save, we:

1. Validate format against pi-tui's keybinding parser (we'll likely import a helper or implement a small regex).
2. If parsing fails, refuse save with an inline error.
3. If the parsed key matches a documented pi built-in (Ctrl+L, Ctrl+P, etc., from `docs/keybindings.md`), warn and require explicit confirmation ("This shadows pi's built-in for the model picker. Save anyway?").
4. If another preset already declares the same hotkey, warn and require explicit confirmation ("Hotkey conflicts with preset 'review'. Save anyway?").
5. On save, the file is updated. The actual binding registration happens at session_start in change 7. We surface a notice in the editor: "Hotkey takes effect after /reload (change 7)."

If the hotkey field changes from a previously-saved value (or is cleared from one), the same "/reload required" notice fires — pi has no `unregisterShortcut`.

### Save / Cancel / Test

- **Save**: validates required fields (name non-empty, provider+model selected), validates name uniqueness within the chosen scope (excluding the preset being edited), then routes through `addPreset`/`updatePreset` from change 2's storage API. On success, closes the editor with a confirmation. On scope change (user → project or vice versa), the file write happens to the new scope and an `removePreset` happens from the old (move semantics).
- **Cancel**: closes without writing.
- **Test (apply temporarily)**: builds a synthetic `Preset` from the current form state, calls `apply` (change 3) directly, and closes the editor with the candidate preset returned in the result so the picker can route a "preset activated" notice for the right name. Nothing is persisted. Useful for "let me see what this preset feels like before I commit."

The Test button is only rendered when the caller wires an `onTest` callback. Standalone callers without a test seam see Save / Cancel only.

### Picker CRUD wiring (modifying change 4 picker)

The picker's `n`/`e`/`d`/`x`/`c` keys, which were stubs in change 4, become real:

- `n` → `await openEditor(ctx)` (no preset → opens for a new preset with sensible defaults); on success, refresh the picker list via `loadAll`.
- `e` → `await openEditor(ctx, selectedPreset)`; on success, refresh.
- `d` → confirm "Duplicate '<name>'?", then build a copy with name `<name>-copy` (or `<name>-copy-2` etc. to ensure uniqueness within scope) and `hotkey` cleared. Persist via `addPreset` to the same scope (canonical CRUD primitive), then call `reorderWithinScope` to slot the copy immediately after the source.
- `x` → confirm "Delete '<name>'?"; on yes, `removePreset` and refresh.
- `⌃↑` / `⌃↓` → swap selected preset's position with its neighbor _within the same scope_; persist via `reorderWithinScope`. (Cross-scope reorder is meaningless; the picker quietly clamps.)
- `c` → confirm "Clear active preset?"; on yes, call activation `clear` (change 3).

The picker's `loadAll` + re-render after each successful CRUD operation is what makes it feel snappy. Failed operations leave the picker open with the relevant error notification.

### `clampWarning` computation

Computed at load time for each preset:

```ts
function computeClampWarning(p: Preset, ctx: ExtensionContext): boolean {
  if (!p.thinkingLevel || p.thinkingLevel === "off") return false;
  const m = ctx.modelRegistry.find(p.provider, p.model);
  if (!m) return false; // unknown model → no-model already flagged
  return !m.reasoning;
}
```

The picker card adds a `⚠ thinking will be clamped` line in the right column when `clampWarning: true`. The editor's reactive radio is the user's interactive way to see the same thing, so the `clampWarning` flag is mostly for quick scan-the-list visibility.

### Module additions

```text
src/store/validate.ts        (extended) — adds computeClampWarning
src/store/api.ts             (extended) — loadAll now sets clampWarning per preset
src/ui/widgets.ts            (extended) — PresetCard renders clamp hint
src/ui/picker.ts             (extended) — n/e/d/x/c/Ctrl+arrows now functional
src/ui/editor.ts             (new)
src/ui/hotkey-input.ts       (new) — small helper for hotkey field validation
```

## Risks / Trade-offs

- **TUI form composition is the largest code surface in the package so far.** Risk: rendering bugs, focus-management bugs. Mitigation: build editor as the single source of truth for all CRUD entry points; manual QA checklist with named scenarios; pure helpers (initial-state derivation, preset assembly) extracted and unit-tested.
- **Hotkey conflict detection is best-effort.** We compare against a static list of documented pi built-ins; pi could add new ones. Mitigation: just a warning, not a refusal; users who know what they're doing can override.
- **Hotkey field is inert until change 7.** Risk: user expects immediate hotkey behavior. Mitigation: editor notice ("takes effect after /reload — change 7"); README.
- **"Test (apply temporarily)"** could surprise users who don't realize they made non-persistent changes. Mitigation: button label is explicit; the change is exactly an apply (with the marker message in the conversation), so it's visible in the audit trail.
- **No external editor for instructions** means users with very long prompts have a worse UX. Mitigation: documented; the storage layer accepts hand-edited JSON, and `/presets reload` re-reads it.
- **Move semantics on scope change** (save with a different scope than load) could confuse if the user expected a copy. Mitigation: confirmation dialog when scope changes ("Move 'plan' from user to project? The user-scope copy will be removed.").
- **No direct CRUD subcommands.** Users must enter `/presets` and use picker actions for save/edit/remove flows. Mitigation: this keeps the command surface small and makes the dialog the central control surface.
- **Renaming and the active-preset link**: if the user renames the currently-active preset, the in-memory `active.name` becomes stale. Mitigation: editor's save flow detects this and updates `active` in place (and writes a new `presets-plus:active` custom entry with the new name).
