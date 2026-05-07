## 1. AGENTS.md convention

- [x] 1.1 Add a "User-facing strings" subsection under "Code conventions" in `AGENTS.md` listing: Title-Case labels with trailing colon, sentence-case prose with terminal periods, `Pi` proper-noun rules, literal command names (`/presets`, `/reload`, `/model`), Title-Case action labels, single-line labels carry no trailing period, multi-sentence prose blocks do.
- [x] 1.2 Add a one-line note under "Code conventions" linking to the new subsection so the existing reviewer-facing summary mentions it.

## 2. Shared label module

- [x] 2.1 Create `src/ui/labels.ts` (or extend `src/ui/frame.ts`) exporting the canonical Title-Case label set. Include at minimum:
  - **Field labels** (used by status, clear, editor row labels, picker cards): `MODEL_LABEL = "Model"`, `THINKING_LABEL = "Thinking level"`, `TOOLS_LABEL = "Tools"`, `PRESET_LABEL = "Preset"`, `SCOPE_LABEL = "Scope"`, `STATUS_LABEL = "Status"`.
  - **Per-surface composed forms** (used by status): `BASELINE_MODEL_LABEL = "Baseline model"`, `BASELINE_THINKING_LABEL = "Baseline thinking level"`, `BASELINE_TOOLS_LABEL = "Baseline tools"`, `PRESET_MODEL_LABEL = "Preset model"`, `PRESET_THINKING_LABEL = "Preset thinking level"`, `PRESET_TOOLS_LABEL = "Preset tools"`, `CURRENT_MODEL_LABEL = "Current model"`, `CURRENT_THINKING_LABEL = "Current thinking level"`, `CURRENT_TOOLS_LABEL = "Current tools"`.
  - **Dialog titles** (used by overlays introduced by `route-picker-info-output-through-overlay`, `surface-picker-activation-errors-in-overlay`, and `prompt-reload-on-hotkey-mutation`): `STATUS_DIALOG_TITLE = "Preset Status"`, `CLEAR_DIALOG_TITLE = "Preset cleared"` (composed at call site as `${CLEAR_DIALOG_TITLE}: ${name}`), `ACTIVATION_FAILED_TITLE = "Activation failed"`, `RELOAD_PROMPT_TITLE = "Reload Pi?"`, `MOVE_PRESET_TITLE = "Move preset?"`, `HOTKEY_SHADOWS_TITLE = "Hotkey shadows pi"`, `HOTKEY_CONFLICT_TITLE = "Hotkey conflict"`.
  - **Footer action labels** (used by picker footer hint row): `ACTIVATE_LABEL = "Activate"`, `FILTER_LABEL = "Filter"`, `STATUS_ACTION_LABEL = "Status"`, `QUIT_LABEL = "Quit"`, plus any other action labels the picker advertises.
- [x] 2.2 Refactor `src/commands/presets/status.ts` to consume the shared labels for `STATUS_LABELS`. Recompute `STATUS_LABEL_WIDTH` from the shared set.
- [x] 2.3 Refactor `src/activation/clear.ts` to consume the shared labels for `FIELD_LABELS`.
- [x] 2.4 Refactor `src/ui/editor.ts` to consume the shared labels where its row labels overlap (`Model`, `Thinking`, `Tools`).

## 3. Notify-surface rewrites

- [x] 3.1 Rewrite every `ctx.ui.notify` call in `src/activation/apply.ts`, `src/activation/clear.ts`, `src/commands/presets/status.ts`, `src/commands/presets/router.ts`, `src/commands/presets/notify.ts`, `src/commands/presets/reload.ts`, `src/hotkeys.ts`, `src/flag.ts`, and `src/index.ts` to follow the convention: sentence-case English, terminal periods, Title-Case label prefixes where used, `Pi` proper-noun.
- [x] 3.2 Rewrite `failureReason(kind, ...args)` (introduced by `surface-picker-activation-errors-in-overlay`) so each of the four refusal strings (`no-key`, `no-model`, `unknown-model`, `key-revoked`) follows the convention. The strings appear in both `ctx.ui.notify` (hotkey / flag / restore / router callers) and in the picker's error info-dialog body, so a single helper covers both surfaces.
- [x] 3.3 Rewrite the reload-error notification text introduced by `prompt-reload-on-hotkey-mutation` (the message surfaced when `ctx.reload()` throws or rejects) to follow the convention.
- [x] 3.4 Rewrite warnings emitted by `apply()` for unknown-tools (`preset "<name>" references unknown tools: ...`) and by hotkey conflicts to follow the convention.
- [x] 3.5 Verify (via grep) no remaining lowercase fragments without terminal punctuation appear in `notify` calls.

## 4. Editor inline-notice rewrites

- [x] 4.1 Rewrite `formatHotkeyReloadNotice` in `src/ui/editor.ts` to produce sentence-case prose with terminal periods.
- [x] 4.2 Rewrite `snapThinkingIfInvalid`'s notice text to sentence-case with a terminal period.
- [x] 4.3 Rewrite the editor's footer keybinding hint row to Title-Case action labels.
- [x] 4.4 Rewrite each validation error string returned from the editor's `validateForSave` and `validateRequired` to sentence-case with terminal periods.

## 5. Status / clear formatter rewrites

- [x] 5.1 Rewrite `formatStatus` row labels (per the shared labels module) and add a Title-Case heading row (`Preset Status`).
- [x] 5.2 Rewrite `chooseClearLead` and `formatRowValue` strings in `src/activation/clear.ts` to sentence-case with terminal periods. Examples: `Restored your previous settings.` (lead); `Could not switch back to <model>.` (restore-failed); the parenthetical annotations on per-row values follow the same convention (`(Left as-is — you changed it after activation.)` etc.).
- [x] 5.3 Rewrite the title in `renderClearSummary` to `Preset cleared: <name>` using `CLEAR_DIALOG_TITLE` from the shared labels module.

## 6. Overlay-surface strings introduced by concurrent changes

- [x] 6.1 Confirm the info-dialog title `Preset Status` (used by `route-picker-info-output-through-overlay` for the picker's `s` action) is sourced from `STATUS_DIALOG_TITLE` in the shared labels module.
- [x] 6.2 Confirm the info-dialog title `Preset cleared: <name>` (used by `route-picker-info-output-through-overlay` for the picker's `c` action) reuses the same string `renderClearSummary` produces for prompt-invoked clear, so the dialog and notify paths share one title.
- [x] 6.3 Confirm the error info-dialog title `Activation failed` (used by `surface-picker-activation-errors-in-overlay`) is sourced from `ACTIVATION_FAILED_TITLE` and that its body text is the `failureReason` helper's output (covered by task 3.2).
- [x] 6.4 Rewrite the reload-prompt title `Reload Pi?` and body text introduced by `prompt-reload-on-hotkey-mutation` to follow the convention; source the title from `RELOAD_PROMPT_TITLE` in the shared labels module. The body text SHALL be sentence-case English with terminal periods, e.g. `Hotkey changes take effect after a reload. Reload now?`.
- [x] 6.5 Rewrite the editor's existing confirm-overlay titles introduced before this change (`Move preset?`, `Hotkey shadows pi`, `Hotkey conflict`) to follow the convention; source from `MOVE_PRESET_TITLE`, `HOTKEY_SHADOWS_TITLE`, `HOTKEY_CONFLICT_TITLE`. Body text SHALL be sentence-case with terminal periods.
- [x] 6.6 Confirm `formatHotkeyReloadNotice` continues to render in the editor (its strings were rewritten in task 4.1) and that the post-Save reload prompt body text introduced by `prompt-reload-on-hotkey-mutation` does not duplicate the inline notice's wording.

## 7. Store-layer warning rewrites

- [x] 7.1 Rewrite warnings in `src/store/load.ts`, `src/store/validate.ts`, and `src/store/merge.ts` to sentence-case with terminal periods.

## 8. Picker card / footer rewrites

- [x] 8.1 Rewrite picker card field labels and warning hints (`⚠ thinking will be clamped`, `⚠ hotkey conflict`, `Status: Unavailable — missing API key`, `Status: Unavailable — model not found`, `Shadowing: Overridden by project preset`) to use Title-Case labels and sentence-case explanatory text.
- [x] 8.2 Rewrite picker footer hint row to Title-Case action labels sourced from the shared labels module (`Activate`, `Filter`, `Status`, `Quit`, etc.). The `Status` entry is added by `route-picker-info-output-through-overlay`; this task covers its label only — the action wiring is in that change.
- [x] 8.3 Rewrite the picker title (`Presets Plus`) and the scope filter labels (`Scope: All`, `Scope: User only`, `Scope: Project only`) to confirm Title-Case label-with-colon convention is followed.

## 9. Tests

- [x] 9.1 Update every golden-style test that asserts on a status formatter, clear summary, notification, warning, or footer hint string to match the new voice. Where a test asserts on a substring (e.g. `"preset:"`), update it to the new substring (`"Preset:"`).
- [x] 9.2 Where a test assertion is on a full multi-line block, replace the golden with the new rendering produced by the updated formatter.
- [x] 9.3 Update tests for overlay titles introduced by `route-picker-info-output-through-overlay`, `surface-picker-activation-errors-in-overlay`, and `prompt-reload-on-hotkey-mutation` to assert on the canonical strings sourced from the shared labels module rather than inline literals.
- [x] 9.4 Add a small lint-style test (or convention test) under `tests/` that scans `src/` for known "old voice" patterns (lowercase `preset:` followed by a space-separated value, sentence fragments without terminal punctuation in `notify` calls, lowercase dialog titles) and reports any matches as failures. This serves as a regression guardrail for future contributions.

## 10. Verification

- [x] 10.1 Run `mise run check` and confirm a clean tree.
- [x] 10.2 Manually verify in a live pi session: `/presets status` from the prompt; `/presets clear` from the prompt; `/presets reload`; activate a preset; activate an unavailable preset; open `/presets`, press `s`, press `c`, press `n`/`e`/`x`/`d`. Each surface SHALL render in the new voice.
- [x] 10.3 Manually verify the overlays from concurrent changes: trigger an activation failure (open the picker, activate an unavailable preset) and confirm the `Activation failed` dialog renders in the new voice; save a hotkey change in the editor and confirm the `Reload Pi?` prompt renders in the new voice.
- [x] 10.4 Read through the resulting `AGENTS.md` "User-facing strings" subsection from the eyes of a new contributor and confirm it is self-contained (does not require reading the proposal or design to follow).
