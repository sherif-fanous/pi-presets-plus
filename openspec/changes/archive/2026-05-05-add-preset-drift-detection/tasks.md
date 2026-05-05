## 1. Type extension

- [x] 1.1 Add `dirty: boolean` as a sibling of `restore` on both variants of `ActivePresetState` in `src/types.ts`
- [x] 1.2 Update the apply path in `src/activation/apply.ts` to construct the active state with `dirty: false`
- [x] 1.3 Update the session-restore path in `src/index.ts` (`restoreActiveFromBranch`) to construct the `restore: { kind: "unknown" }` attachment with `dirty: false`
- [x] 1.4 Type-check passes; existing tests still pass

## 2. Dirty helpers

- [x] 2.1 Create `src/activation/dirty.ts` exporting `markDirty(ctx, reason)` and `markClean(ctx)` that update the active state's `dirty` flag (no-op when not active or already in target state), spread `...active` so the `restore` discriminator is preserved, and refresh the status badge
- [x] 2.2 Unit tests for both helpers covering active/inactive, already-in-target-state, baseline-vs-unknown restore variants, and confirmation that `restore` survives the spread

## 3. model_select handler (real)

- [x] 3.1 Replace the change-3 placeholder `model_select` handler with the real implementation per design
- [x] 3.2 Apply self-call guard, source filter (skip "restore"), no-op when no active preset
- [x] 3.3 Mark dirty when new model differs from active preset's model
- [x] 3.4 Mark clean when new model matches active preset's model and currently dirty
- [x] 3.5 Unit tests covering: self-trigger, restore source, no active preset, drift, re-sync

## 4. turn_start drift detection

- [x] 4.1 Create `src/activation/drift.ts` exporting `detectDriftReasons(preset, pi, ctx) -> string[]` covering model, thinking level (using `effectiveThinkingLevel`), and conditional tools (set equality via `sameSet`)
- [x] 4.2 Refactor `src/activation/state-matches.ts` so `stateMatches` delegates to `detectDriftReasons(...).length === 0` (single source of truth shared by apply fast-path, picker card, and `turn_start`)
- [x] 4.3 Confirm tools comparison still routes through the existing `sameSet` helper in `src/activation/same-set.ts`
- [x] 4.4 Register the `thinking_level_select` and `turn_start` handlers in `src/index.ts` that call `detectDriftReasons`, then `markDirty` or `markClean` per spec
- [x] 4.5 Unit tests for `detectDriftReasons`: clean state, model drift, thinking drift on reasoning model, tools drift, tools change with no-tools preset (no drift), order-independent tools, effective-thinking comparison for non-reasoning model
- [x] 4.6 Confirm existing `stateMatches` tests still pass after the refactor (they should be unchanged — the boolean projection has the same semantics)

## 5. Status badge

- [x] 5.1 Update `src/ui/status.ts` `updateStatus` so that, when `active.dirty === true`, it renders the slim activation format with a `warning`-themed `!` appended directly after `<name>` (no space): `preset: <name>` + `theme.fg("warning", "!")`. When clean, the existing dim `preset: <name>` rendering is unchanged.
- [x] 5.2 Update the activation delta spec in this change (`specs/preset-activation/spec.md`) to MODIFY the footer-status-entry requirement so the dirty marker is permitted by spec
- [x] 5.3 Manual visual smoke test: apply preset, change model, verify badge gains warning-colored `!`; re-select preset's model manually, verify `!` disappears

## 6. Picker drift indicator

- [x] 6.1 Extend `PresetCardOptions` in `src/ui/widgets.ts` with `dirty?: boolean` and `driftReasons?: readonly string[]`
- [x] 6.2 In `PresetCardComponent.render`, when `options.active && options.dirty && options.driftReasons.length > 0`, append a `Drift:` row whose value is `⚠ Dirty — <reasons> differ` rendered via `theme.fg("warning", …)`, matching the existing clamp / availability `Status:` row pattern
- [x] 6.3 In `src/ui/picker.ts` (around the existing `active: active?.name === preset.name && …` flag), thread `dirty` and `driftReasons` (computed via `detectDriftReasons` for the active preset) into the card options
- [x] 6.4 Manual test: picker card reflects clean and dirty states correctly

## 7. Apply re-apply edge case

- [x] 7.1 Update the idempotent fast-path early return in `src/activation/apply.ts` so that when the existing active state is dirty, `markClean(ctx)` is invoked (then `updateStatus`) before returning `{ ok: true }`. This ensures "select active preset → Enter while dirty but state already matches" clears the marker immediately rather than waiting for the next `turn_start`.
- [x] 7.2 Unit test: re-apply when current state matches preset and `dirty === true` returns ok and leaves `dirty === false`

## 8. Manual QA

- [x] 8.1 Activate a preset; verify badge shows `preset: <name>` (dim) with no trailing marker
- [x] 8.2 Change model via `/model`; verify badge becomes `preset: <name>!` with `!` in warning color; verify preset remains attached and instructions still inject (check on next turn)
- [x] 8.3 Manually re-select the preset's recorded model via `/model`; verify trailing `!` disappears
- [x] 8.4 Activate a reasoning preset with `thinking: high`; manually change thinking via another command; verify badge gains `!` immediately
- [x] 8.5 Manually return thinking to the preset's value; verify `!` disappears immediately
- [x] 8.6 Activate a preset with explicit tools; manually toggle a tool off; on next turn, verify badge gains `!`
- [x] 8.7 Activate a preset that omits tools; manually change active tools; verify badge does NOT gain `!`
- [x] 8.8 Activate a preset with `thinking: high` for a non-reasoning model; verify clamp warning AND verify badge does NOT show `!` (effective levels match)
- [x] 8.9 Re-apply a dirty preset by opening `/presets`, selecting the active preset, and pressing `Enter`; verify `!` clears immediately (covers the apply fast-path edge case from §7)
- [x] 8.10 Restore a session; verify badge starts clean; manually drift state; verify `!` appears on next turn
- [x] 8.11 Open `/presets` while clean; verify the active card has no `Drift:` line
- [x] 8.12 Open `/presets` while dirty due to multiple reasons; verify all reasons appear on the active card's `Drift:` line

## 9. Post-review fixes

Follow-up fixes from the adversarial review of the initial implementation;
these tighten correctness, restore the proposal's no-disk-I/O guarantee,
and harden test coverage. None require a separate proposal because they
re-align the code with the existing spec / proposal text.

- [x] 9.1 Fix `handleModelSelectDrift` so the model-match branch delegates to a full `syncDirtyFromCurrentState` recheck instead of unconditionally calling `markClean`, preventing a stale-clean badge when thinking or tools are still drifted. Thread `pi` into the handler and into the `model_select` registration in `src/index.ts`.
- [x] 9.2 Restore the proposal's "no new file I/O" promise: cache the resolved drift snapshot on `ActivePresetState.declared` (set at apply / restore time), refactor `detectDriftReasons` to compare against the snapshot, drop the `loadAll` calls from `drift-handlers.ts` and `dirty.ts`. Add a `snapshotPresetForDrift` helper.
- [x] 9.3 Convert `selfTriggeredModelSet` in `src/activation/apply.ts` from a boolean to a counter so nested `withSelfTriggeredModelSet` calls cannot accidentally lower the guard.
- [x] 9.4 Drop the unused `reason` parameter from `markDirty` / `markClean`. (Optional one-time-per-session notice deferred; not implemented in this change.)
- [x] 9.5 Memoize picker drift reasons by active-state signature so filter keystrokes / scrolls don't re-run `detectDriftReasons`. Only set `dirty` / `driftReasons` on the active card; leave them undefined on inactive cards.
- [x] 9.6 Reorder `PresetCardComponent.render` rows so both `Status:` rows (clamp + availability) sit together and the `Drift:` row follows them, instead of `Status: clamp` → `Drift:` → `Status: availability`.
- [x] 9.7 Drop `=== true` redundancy on `options.dirty` and add a `default` arm to `formatAvailabilityStatus` for forward-compatibility with new `unavailable` reasons.
- [x] 9.8 Document the `thinking_level_select` cast in `src/index.ts` as type-debt blocked on a pi peer bump to >= 0.71.0; note the graceful pre-0.71 fallback (turn_start safety net).
- [x] 9.9 Add new unit-test coverage: `syncDirtyFromCurrentState` for tools drift / no-tools preset / order-independent tools / clean-stays-clean idempotence, the M1 regression case (model match with thinking still drifted), and `snapshotPresetForDrift` (defensive copy of `tools`, omitted optional fields). Strengthen `dirty.test.ts` to assert `restore` substructure survives the spread and that the badge refresh uses the cached snapshot (no disk read).
- [x] 9.10 Bump the `@mariozechner/pi-coding-agent` dev / lock version to >= 0.71.0 and remove the local `ThinkingLevelSelectEvent` / `ThinkingLevelSelectPi` interfaces in favor of the imported event type. (Done: bumped to ^0.73.0 dev-dep; peer deps kept at `*` for install-time flexibility; cast and local interfaces removed — `pi.on("thinking_level_select", …)` now type-checks natively.)
