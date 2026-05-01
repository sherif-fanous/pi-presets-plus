## Why

This is the third of seven changes building `pi-presets-plus` (see `openspec/breakdown.md`). Storage exists from change 2; users can hand-edit JSON and view loaded presets. This change makes presets _do_ something: applying a preset swaps model, thinking level, and (optionally) active tools; clearing reverses those changes back to the pre-extension baseline while respecting manual user overrides; instructions are appended to the system prompt while a preset is active; the compact preset footer indicator reflects the active preset; and re-applying handles drifted state. After this change, the core preset workflow exists end-to-end via keyboard commands — the picker UI in change 4 just makes it pleasant.

This change deliberately defers drift detection (change 6) and the `--preset` CLI flag, cycle commands, and per-preset hotkeys (change 7). Manual model changes via `/model` are not yet auto-detected; the compact preset footer indicator can continue showing an active preset name even after the user drifts away from its values. We document that gap clearly until change 6 closes it.

## What Changes

- Add `ActivePresetState`, `PresetOverlayBaseline`, `LastAppliedPresetEffects`, and `PresetOverlayOwnership` types to `src/types.ts`. `ActivePresetState` is a two-variant union: a baseline-managed variant carrying baseline/lastApplied/owned/applyCount, and a `priorUnknown` variant for session-restore attachments.
- Add `src/activation/baseline.ts` exporting `captureBaseline(pi, ctx)` that reads current Pi model, thinking level, and active tools so clear can later attempt to restore them.
- Add `src/activation/thinking.ts` exporting `validThinkingLevels(model)` and `effectiveThinkingLevel(preset, model)`.
- Add `src/activation/apply.ts` implementing the apply flow: decide whether to reuse an existing overlay baseline or capture a fresh one; `setModel` (guarded); `setThinkingLevel(effective)` with a clamp notification when the effective level differs from the declared level; conditional `setActiveTools`; update `lastApplied` and `owned` bookkeeping; persist a `presets-plus:active` custom session entry; send a custom-typed activation marker message; update the footer indicator.
- Add `src/activation/clear.ts` implementing a baseline-overlay restore with user-override protection: for each extension-owned field, restore the baseline only when current value still equals the last value applied by presets-plus (or already equals the baseline); otherwise leave the value alone as a user override. Keep a soft-clear branch for `priorUnknown` attachments that never touches Pi state.
- Add `src/activation/active-state.ts` holding the in-memory `active` reference, plus `setActive`/`clearActive` helpers.
- Add `src/messages.ts` defining the `presets-plus:activated` custom message shape and registering the renderer.
- Add `src/ui/status.ts` exporting `updateStatus(ctx, active, lookup)` that renders a compact dim-themed footer indicator: `preset: <name>` while active and `preset: none` otherwise. The indicator intentionally does not repeat model or thinking because Pi's built-in footer already shows those values.
- Add `before_agent_start` handler that appends the active preset's `instructions` to the incoming `event.systemPrompt`. Append, never replace, because the incoming prompt contains pi's tool descriptions and contributions from earlier extensions.
- Add `session_start` logic that walks the current branch for the most recent `presets-plus:active` entry and re-attaches the preset as `priorUnknown` (without re-applying model/thinking/tools and without fabricating a baseline).
- Document `/new` and `/fork` behavior: `/new` results in no active preset (the new branch has no `presets-plus:active` entry); `/fork` inherits the parent's active preset name (same mechanism — the entry exists on the fork's branch).
- Extend the `/presets` command router with subcommands `<name>` (activate), `clear`, and `status`. `/presets status` shows the active preset, its baseline, last-applied values, current Pi values, and whether each field currently looks extension-owned, user-overridden, or already at baseline.
- Clear SHALL always emit a user-visible result message describing, for each field, whether it was restored, already at baseline, left as a user override, left unchanged because no baseline was available, or could not be restored.
- Add a placeholder `model_select` handler that does nothing for now (no auto-clear, no mark-dirty); change 6 fills it in.

## Capabilities

### New Capabilities

- `preset-activation`: apply, clear, re-apply rules based on a baseline overlay with user-override protection; session restore; `/new`/`/fork` behavior; instruction injection (append-not-replace); compact preset footer indicator; activation marker message; clear result notification; `/presets <name>`, `/presets clear`, `/presets status`.

### Modified Capabilities

(None in delta-spec form. Like change 2, this change extends the storage capability's command router with new subcommands; the requirements live in the new `preset-activation` capability.)

## Impact

- **No new file paths.** Storage paths are inherited from change 2.
- **New runtime side effects on apply**: `pi.setModel`, `pi.setThinkingLevel`, `pi.setActiveTools`, `pi.appendEntry`, `pi.sendMessage`, `ctx.ui.setStatus`. All documented APIs from `docs/extensions.md`.
- **New runtime side effects on clear**: conditional `pi.setModel`, `pi.setThinkingLevel`, `pi.setActiveTools` driven by the baseline-overlay restore rules, plus `pi.appendEntry`, `ctx.ui.notify`, `ctx.ui.setStatus`.
- **Documented gap**: manual model changes (via `/model` or `Ctrl+P`) do not auto-update the active preset attachment until change 6. The compact preset footer indicator can continue showing an active preset name after drift. README notes this and points users at `/presets clear` to manually un-attach; drift is handled gracefully by clear's user-override protection.
- **No UI surface beyond the compact preset footer indicator, activation marker, and clear result notification.** Users still interact via keyboard commands.
