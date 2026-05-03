## 1. Filter ranking module

- [x] 1.1 Create `src/ui/filter.ts` exporting `rankPresets(items, query)` and a private `subsequenceMatch(haystack, query)`
- [x] 1.2 Unit test: empty query returns input order unchanged
- [x] 1.3 Unit test: literal substring match always precedes subsequence-only match
- [x] 1.4 Unit test: reproduces the upstream #3433 example (`opus` query against multi-provider list) and asserts literal-block-first ordering
- [x] 1.5 Unit test: case-insensitive matching
- [x] 1.6 Unit test: query that matches none returns empty array

## 2. Reusable widgets

- [x] 2.1 Create/update `src/ui/widgets.ts` with `presetCard(loaded, theme, opts)` returning a multi-line key/value card component
- [x] 2.2 Implement readable scope/status/shadowing fields: `Scope: User|Project`, `Status: Unavailable — ...`, `Shadowing: Overridden by project preset`, and active-state dot
- [x] 2.3 Implement readable tools summary (comma-separated explicit names, including actual current tool names for inherited presets) and prompt preview truncation without cryptic abbreviations
- [x] 2.4 Unit/manual visual smoke test: render a card with active, unavailable, shadowed, project, user, tools, inherit-tools, and prompt-preview combinations

## 3. Picker scaffolding

- [x] 3.1 Create/update `src/ui/picker.ts` exporting `openPicker(ctx, opts)` returning `Promise<{ activated?: LoadedPreset } | undefined>`
- [x] 3.2 Build a full bordered dialog component with top, bottom, left, and right borders
- [x] 3.3 Add header row showing title + scope state
- [x] 3.4 Add filter input row (focused via `/`; not always focused) with visible cursor/focus indicator
- [x] 3.5 Add scrollable list area composed of multi-line key/value preset cards with selection highlight
- [x] 3.6 Add footer hint row with readable title-case action labels

## 4. Picker behavior

- [x] 4.1 On open, call `loadAll(ctx)`; surface load warnings as a single info notification
- [x] 4.2 Implement up/down/page-up/page-down selection movement; wrap up/down at first/last visible preset and keep page movement bounded
- [x] 4.3 Implement `←`/`→` scope cycling between `All`, `User only`, `Project only`; re-render list per spec scope-handling rules
- [x] 4.4 Implement `/` to focus filter input; `Esc` from input returns focus to list
- [x] 4.5 Implement Enter activation: look up selected preset, close picker, call activation `apply`
- [x] 4.6 Implement Enter on unavailable preset: keep open, surface refusal notification (apply already handles this; just don't close)
- [x] 4.7 Implement Esc from list focus to close picker without action
- [x] 4.8 Implement reserved keys `n`/`e`/`d`/`x` showing the "editor coming in next change" hint without closing

## 5. Filter integration

- [x] 5.1 As the user types in the filter input, re-rank via `rankPresets` and re-render
- [x] 5.2 When filtered list is empty, render a "no matches" notice and disable Enter
- [x] 5.3 Selection clamps to the visible (filtered) list; if previous selection is now hidden, jump to the first visible item

## 6. Command routing

- [x] 6.1 Update `/presets` (bare) to open the picker via `openPicker`
- [x] 6.2 Remove `/presets list` as a picker synonym; it should follow unknown-subcommand behavior rather than opening the picker
- [x] 6.3 Remove `/presets list --text`; no textual list escape hatch is exposed by this change
- [x] 6.4 Update `getArgumentCompletions` so it does not complete `list`, `--text`, or preset-name exact activation entries
- [x] 6.5 Remove exact-name activation fallback (`/presets <preset-name>`) from router behavior
- [x] 6.6 Manual test: bare invocation opens picker; `list`, `list --text`, exact-name activation, and unrelated unknown subcommands do not open picker or activate; `reload` still works

## 7. Documentation

- [x] 7.1 Update README picker docs to describe `/presets` as the sole picker entry point and remove `list` / `--text` references
- [x] 7.2 Document that literal-first filtering is local to the picker and does not change Pi's built-in `/model` behavior

## 8. Manual QA

- [x] 8.1 Hand-create at least 8 presets across both scopes including a shadowed pair, an unavailable one, and reasoning + non-reasoning models
- [x] 8.2 Open picker via `/presets`; verify all presets appear with readable key/value cards and full side borders
- [x] 8.3 Type `opus` (or another partial substring of a model name); verify literal matches appear above any subsequence-only matches
- [x] 8.4 Cycle scope with `←/→`; verify hide/show behavior
- [x] 8.5 Activate a preset; verify the apply flow runs and the picker closes
- [x] 8.6 Activate an unavailable preset; verify the refusal notification fires and the picker stays open
- [x] 8.7 Press `n` / `e` / `d` / `x`; verify the "editor coming" hint
- [x] 8.8 Press `Esc` from filter focus; verify focus returns to list and picker stays open
- [x] 8.9 Press `Esc` from list focus; verify clean close with no state change
- [x] 8.10 Edit the JSON file in another editor; close+reopen picker; verify changes are reflected without `/reload`
