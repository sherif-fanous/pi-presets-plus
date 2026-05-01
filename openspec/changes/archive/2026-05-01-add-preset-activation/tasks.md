## 1. Types

- [x] 1.1 Replace `PriorSnapshot` with `PresetOverlayBaseline`, `LastAppliedPresetEffects`, and `PresetOverlayOwnership` in `src/types.ts`
- [x] 1.2 Update `ActivePresetState` to the baseline/priorUnknown union with `restore.kind` discriminator per design
- [x] 1.3 Type-check passes against the change-2 storage types

## 2. Thinking helpers

- [x] 2.1 Create `src/activation/thinking.ts` exporting `validThinkingLevels(model)` and `effectiveThinkingLevel(preset, model)`
- [x] 2.2 Unit tests covering: reasoning model with declared level, reasoning model with no declared level, non-reasoning model with declared level (clamped to off), non-reasoning model with no declared level, undefined model

## 3. Active state, baseline, and state-matching

- [x] 3.1 Create `src/activation/active-state.ts` exporting a module-scoped active reference plus `setActive`, `clearActive`, and a getter
- [x] 3.2 Replace `src/activation/snapshot.ts` with `src/activation/baseline.ts` exporting `captureBaseline(pi, ctx)` that reads current model/thinking/tools
- [x] 3.3 Create `src/activation/state-matches.ts` exporting `stateMatches(preset, pi, ctx)` using `effectiveThinkingLevel` for the thinking comparison
- [x] 3.4 Unit tests for `captureBaseline` (captures current model/thinking/tools regardless of preset shape) and `stateMatches` (covering model match/mismatch, thinking match/mismatch with reasoning and non-reasoning models, tools match/mismatch as set)

## 4. Apply

- [x] 4.1 Rewrite `src/activation/apply.ts` around the baseline-overlay model with `setModelGuarded` and `apply(preset, ctx, pi)`
- [x] 4.2 Preserve existing baseline across preset switches; capture a fresh baseline when no overlay exists or the attachment is `priorUnknown`
- [x] 4.3 Maintain `applyCount`, `lastApplied`, and sticky-true `owned.tools` bookkeeping across switches
- [x] 4.4 Implement the no-op re-apply short-circuit (only for `restore.kind === "baseline"` and `stateMatches` true)
- [x] 4.5 Implement clamp notification when effective ≠ declared thinking level
- [x] 4.6 Filter unknown tool names with a warning before `setActiveTools`; carry forward `lastApplied.tools` when the current preset omits tools
- [x] 4.7 Refuse activation of `unavailable` presets with a clear error notification (no state change, no baseline capture)
- [x] 4.8 Persist `presets-plus:active` custom session entry
- [x] 4.9 Send `presets-plus:activated` custom message
- [x] 4.10 Trigger footer indicator update
- [x] 4.11 Unit tests covering all apply scenarios: first activation, baseline-to-baseline switch, priorUnknown-to-baseline transition, re-apply no-op, re-apply after drift, unavailable preset, clamp, unknown tools, owned-tools stickiness

## 5. Clear

- [x] 5.1 Rewrite `src/activation/clear.ts` around the per-field decision table with user-override protection
- [x] 5.2 Implement equality helpers for model (provider+id), thinking (string), and tools (set of names)
- [x] 5.3 Implement `priorUnknown` soft-clear branch that never writes Pi state
- [x] 5.4 Handle `owned.tools === false` by leaving tools unchanged regardless of comparisons
- [x] 5.5 Continue clearing active state even when individual field restores fail (e.g. `pi.setModel` returns false, baseline tools include unavailable names)
- [x] 5.6 Persist `presets-plus:active` with `name: null` in all branches (including the no-active-preset path only emitting the notification, without a session entry)
- [x] 5.7 Trigger footer indicator update in all branches
- [x] 5.8 Expose a pure `renderClearSummary(name, parts)` formatter for test coverage; the runner routes it through `ctx.ui.notify`
- [x] 5.9 Unit tests covering: single-activation clear, A→B→clear back to baseline, user model override, user tools override, owned.tools false, priorUnknown soft clear, no-active-preset, baseline model restore failure, baseline tools filtering, chain that changes tools only in A

## 6. Custom message renderer

- [x] 6.1 Create `src/messages.ts` exporting `presets-plus:activated` shape and renderer
- [x] 6.2 Register the renderer via `pi.registerMessageRenderer` in `src/index.ts`

## 7. Compact preset footer indicator

- [x] 7.1 Create `src/ui/status.ts` with `updateStatus(ctx, active, lookup)`
- [x] 7.2 Render dim-themed `preset: <name>` while active, intentionally omitting model/thinking because Pi's built-in footer already shows them
- [x] 7.3 Render dim-themed `preset: none` when active is undefined or the active preset definition cannot be found
- [x] 7.4 Wire `updateStatus` calls from apply, clear, and `session_start`

## 8. Instruction injection

- [x] 8.1 Register a `before_agent_start` handler in `src/index.ts` that appends `active`'s preset's instructions to `event.systemPrompt`
- [x] 8.2 Verify it returns undefined when no active preset or no instructions
- [x] 8.3 Manual test: activate a preset with instructions; verify the LLM context shows the appended block

## 9. Session restore

- [x] 9.1 In `session_start`, walk the current branch for the most recent `presets-plus:active` custom entry
- [x] 9.2 If non-null name and the preset is loaded and available, set `active` to `{ restore: { kind: "unknown" } }`; do NOT call setModel/setThinkingLevel/setActiveTools and do NOT fabricate a baseline
- [x] 9.3 If preset missing or unavailable, leave `active` undefined and warn
- [x] 9.4 If most-recent entry has `name: null`, leave `active` undefined
- [x] 9.5 Update footer indicator after restore
- [x] 9.6 Manual test: apply a preset, restart pi (`/resume`), verify `priorUnknown` attachment via `/presets status`; manually run `/presets <name>` and verify it transitions to a fresh baseline-managed overlay (not the pre-original-activation state)

## 10. /new and /fork

- [x] 10.1 Manual test `/new` clears the active preset (no `presets-plus:active` on the new branch → restore finds nothing)
- [x] 10.2 Manual test `/fork` inherits the active preset name as `priorUnknown` (parent's last `presets-plus:active` is on the fork's branch → restore re-attaches with `restore.kind === "unknown"`; baseline is NOT inherited)

## 11. model_select reservation

- [x] 11.1 Register a `model_select` handler with the self-call guard in place
- [x] 11.2 Handler does nothing else in this change (placeholder for change 6)
- [x] 11.3 Add a TODO comment referencing change 6

## 12. /presets subcommand routing

- [x] 12.1 Extend `src/index.ts` command router with `clear`, `status`, and the bare-token-as-name fallthrough (after `list` and `reload` from change 2)
- [x] 12.2 Update `getArgumentCompletions` to include `clear` and `status`, plus the names of all loaded presets, all filtered by prefix
- [x] 12.3 Implement `runActivate(name, ctx)` (looks up preset, refuses on unknown name with available-name list, otherwise calls apply)
- [x] 12.4 Implement `runClear(ctx)` that invokes the new clear flow AND surfaces the result notification (including the no-active-preset path)
- [x] 12.5 Rewrite `runStatus(ctx)` to render baseline / lastApplied / current / per-field classification / applyCount / attachment kind per the new spec
- [x] 12.6 Manual tests for each subcommand

## 13. Manual QA

- [x] 13.1 Hand-create a preset with model+thinking+tools+instructions; run `/presets <name>`; verify model swaps, thinking changes, tools change, activation marker appears in conversation, and compact preset footer indicator appears
- [x] 13.2 Run `/presets clear`; verify all three fields restore to baseline and the clear result notification names the restored fields
- [x] 13.3 Apply A (no tools), then change tools manually with another tool/command, then `/presets clear`; verify tools were NOT touched by the clear and the notification states tools were unchanged (not owned)
- [x] 13.4 Apply A, then apply B (with tools), then `/presets clear`; verify state restored to the pre-A baseline (not to state-under-A) and notification names the restored fields
- [x] 13.5 Apply A, manually change model via `/model`, then `/presets clear`; verify model is left at the user's choice and notification explicitly says model was left unchanged because it changed after activation; verify thinking and tools are still evaluated against baseline/lastApplied independently
- [x] 13.6 Activate a preset whose model has `reasoning: false` but declared `thinkingLevel: "high"`; verify clamp notification fires and `pi.getThinkingLevel()` is `"off"`; verify subsequent `/presets clear` restores baseline thinking
- [x] 13.7 Activate, restart pi (`/resume`), verify `/presets status` shows priorUnknown; run `/presets clear`; verify model/thinking/tools are unchanged and notification states no restore baseline was available; verify the footer indicator changes to `preset: none`
- [x] 13.8 Verify documented gap: change model via `/model` while preset active; verify compact preset footer indicator does NOT change (this is intentional in this change; closed in change 6); verify `/presets clear` then correctly classifies model as a user override
