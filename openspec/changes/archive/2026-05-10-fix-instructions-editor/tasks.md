## 1. Spike: confirm pi-tui Editor fits a form-field role

- [x] 1.1 Read `node_modules/@mariozechner/pi-tui/dist/components/editor.d.ts` and the corresponding `.js` to confirm `disableSubmit = true`, `setText`, `getText`, and `onChange` form a sufficient set for "use this as a form field"
- [x] 1.2 Confirm that omitting `setAutocompleteProvider` leaves the autocomplete subsystem dormant (no background tasks, no console output, no file I/O)
- [x] 1.3 Confirm that omitting `addToHistory` leaves history navigation dormant
- [x] 1.4 Confirm that `Editor` can be embedded inside a `ctx.ui.custom` overlay (i.e. it does not assume it owns the whole TUI surface)
- [x] 1.5 Write a short note in `design.md` under "Spike outcomes" recording any constraints discovered (or, if a constraint blocks the chosen path, propose a revised approach before continuing)

## 2. Prompt-edit overlay component

- [x] 2.1 Create `src/ui/prompt-editor.ts` exporting `openPromptEditor(ctx, options): Promise<{ confirmed: true; text: string } | { confirmed: false }>` where `options = { presetName: string | undefined; initialText: string }`
- [x] 2.2 Implement the overlay by delegating to Pi's built-in `ctx.ui.editor(title, prefill)` with `Edit prompt: <name>` or `Edit prompt` as the title
- [x] 2.3 Pass `initialText` as the built-in editor prefill so Pi owns multi-line rendering, cursor behavior, keybindings, paste handling, autocomplete dormancy, and history behavior
- [x] 2.4 Map a string result from `ctx.ui.editor` to `{ confirmed: true, text }` and `undefined` to `{ confirmed: false }`
- [x] 2.5 Keep prompt-editor wrapper logic limited to title construction and result-shape normalization
- [x] 2.6 Unit tests for the pure helpers introduced by the overlay (initial state construction, confirm/cancel resolution shape)

## 3. Editor: convert Prompt row to activate-to-push

- [x] 3.1 In `src/ui/editor.ts`, simplify `handleInstructionsInput` to: on `Key.enter`, call `openPromptEditor(ctx, { presetName: state.name, initialText: state.instructions })`; on confirm, set `state.instructions` and request render; on cancel, no-op. All other keys delegate to the outer form's focus manager.
- [x] 3.2 Remove `instructionsCursor` and the single-row insert / backspace / left / right logic (now owned by the overlay)
- [x] 3.3 Keep `renderInstructionsRows` rendering a single-line preview (`replaceAll("\n", " ↵ ")` + `truncateToWidth(..., width - 16, "…")`). Append an inline footer hint adjacent to the Prompt row label when the Prompt row is focused: `Enter to edit`
- [x] 3.4 Update the F1 help registry entry for `instructions` to reflect the new activate-to-edit affordance
- [x] 3.5 Update the footer hint composition so that when the Prompt row is focused, the row-specific hint `Enter to edit` appears alongside the global Tab / Save / Cancel hints

## 4. Editor: focus-cycle and Save round-trip

- [x] 4.1 Confirm Tab / arrow-down from any row above lands focus on the Prompt row preview, not the (now-removed) inline cursor
- [x] 4.2 Confirm Tab / arrow-down from the Prompt row advances to the Hotkey row
- [x] 4.3 Confirm Save persists the current `state.instructions` (whose only entry point is now the overlay confirmation)
- [x] 4.4 Confirm Cancel in the outer form discards in-flight prompt edits even if they were already confirmed via the overlay (the overlay confirms _into form state_, not _into storage_; outer Cancel drops form state)
- [x] 4.5 Confirm Test (apply temporarily) uses the current form `state.instructions` (including any overlay-confirmed edits) as before

## 5. `show-prompt` subcommand: pure formatter

- [x] 5.1 Create `src/commands/presets/show-prompt.ts` exporting:
  - `findPresetForShowPrompt(name: string | undefined, active: ActivePresetState | null, loaded: readonly LoadedPreset[]): { kind: "active"; preset: LoadedPreset } | { kind: "named"; preset: LoadedPreset } | { kind: "no-active" } | { kind: "no-prompt"; name: string } | { kind: "unknown"; name: string }`
  - `formatShowPromptBody(result, theme): { body: string; severity: "info" | "warning" | "error" }`
- [x] 5.2 Behavior matrix (matches design.md):
  - no name + no active → `{ kind: "no-active" }` → severity `info`, body `No preset is active.`
  - no name + active + empty prompt → `{ kind: "no-prompt", name }` → severity `info`, body `Active preset "<name>" has no prompt.`
  - no name + active + non-empty prompt → `{ kind: "active", preset }` → severity `info`, body renders the prompt
  - name + not found → `{ kind: "unknown", name }` → severity `error` (parallel to other "unknown" cases in the router), body `No preset named "<name>".`
  - name + found + empty prompt → `{ kind: "no-prompt", name }` → severity `info`, body `Preset "<name>" has no prompt.`
  - name + found + non-empty prompt → `{ kind: "named", preset }` → severity `info`, body renders the prompt
- [x] 5.3 Lookup follows existing scope-precedence rules via `findPreset` (project shadows user)
- [x] 5.4 Markdown rendering: when `@mariozechner/pi-tui` exposes a `Markdown` component _and_ pi exposes a render hook for it inside `ctx.ui.notify`-style flows, route the prompt body through it. Otherwise fall back to plain text. Document the detection check in code comments.
- [x] 5.5 Unit tests for every branch of the behavior matrix using a tiny `ctx` stub

## 6. `show-prompt` subcommand: runner and registry

- [x] 6.1 Create `src/commands/presets/show-prompt.ts`'s `runShowPrompt(ctx, args, pi, session, hotkeys)` that:
  - Reads `args[0]` as the optional name (untrimmed)
  - Calls `loadAll` to get the current `loaded` list
  - Reads `session.active` for the active preset state
  - Calls `findPresetForShowPrompt(name, active, loaded)`
  - Routes the formatter's result through `ctx.ui.notify(body, severity)`
- [x] 6.2 Register `show-prompt` in `SUBCOMMANDS` (`src/commands/presets/router.ts`) immediately after `status`, with label `show-prompt: show the active preset's prompt (or [name])`
- [x] 6.3 Extend `getArgumentCompletions` to accept a second parameter `getPresetNames: () => Promise<readonly string[]>` and return `Promise<{ value: string; label: string }[]>`. When the trimmed prefix starts with `"show-prompt "`, strip that prefix, await `getPresetNames()`, and return entries whose `value` starts with the remaining argument prefix (case-sensitive, matching the existing autocomplete style). Pi's `getArgumentCompletions` callback type already permits a `Promise` return, so no host API change is needed.
- [x] 6.4 Wire the loader from `src/index.ts`: introduce a small mutable holder at extension scope (e.g. `const presetNamesLoader: { fn: () => Promise<readonly string[]> } = { fn: async () => [] }`), pass `(prefix) => getArgumentCompletions(prefix, () => presetNamesLoader.fn())` to `pi.registerCommand`, and inside `session_start` overwrite `presetNamesLoader.fn = async () => (await loadAll(ctx)).presets.map((p) => p.name)` so the closure captures the freshly-arrived `ctx`. This mirrors the existing `CurrentPresetsLoader` pattern in `src/index.ts` and preserves the AGENTS.md "no module-level caches of on-disk state" rule: every autocomplete invocation re-reads the JSON files via `loadAll`.
- [x] 6.5 Unit tests asserting that (a) the router dispatches `show-prompt` to `runShowPrompt`, (b) `getArgumentCompletions("show-prompt ", stubLoader)` returns the full name list when `stubLoader` resolves to `["plan", "peer-review"]`, (c) `getArgumentCompletions("show-prompt p", stubLoader)` returns only `plan` and `peer-review` (filtered by prefix), and (d) before `session_start` runs (default `presetNamesLoader.fn` still returns `[]`), the autocomplete returns `[]` without throwing.

## 7. Documentation

- [x] 7.1 Update `README.md`'s "Commands" table to add `/presets show-prompt [name]` with a one-line description matching the spec
- [x] 7.2 Update `README.md`'s "Quick start" if it currently implies that prompts can be authored entirely from the picker row (no separate edit surface)
- [x] 7.3 Update `AGENTS.md` only if the existing conventions are extended by this change (likely not — the change reuses the pure-formatter / thin-runner pattern already documented)

## 8. Verification

- [x] 8.1 `mise run check` clean (format-check, type-check, lint, test)
- [x] 8.2 Manual smoke test: create a new preset from `n` in the picker, push into the prompt overlay, paste a 3 KB markdown block, confirm, save; reopen the preset and confirm the prompt round-trips exactly
- [x] 8.3 Manual smoke test: edit an existing preset, push into the prompt overlay, type and delete, cancel the overlay; confirm the outer form's `state.instructions` is unchanged
- [x] 8.4 Manual smoke test: edit an existing preset, push into the prompt overlay, confirm an edit, then Cancel the outer form; confirm the on-disk preset is unchanged
- [x] 8.5 Manual smoke test: `/presets show-prompt` with no preset active, with a prompt-less active preset, with a prompt-having active preset, with a named preset that has a prompt, with a named preset without a prompt, and with an unknown name
- [x] 8.6 Manual smoke test at narrow terminal width (40 cols): word-wrap behaves and the cursor remains visible
- [x] 8.7 Run `openspec validate fix-instructions-editor --strict` and address any findings before archiving
