## 1. CLI flag

- [x] 1.1 Create `src/flag.ts` registering the `--preset` flag of type string with a clear description
- [x] 1.2 Wire flag handling into `session_start` AFTER restore: if the flag is set, look up the preset and full-apply it, overriding any restored attachment
- [x] 1.3 On unknown name, warn with the list of available preset names; on unavailable, warn with the reason
- [x] 1.4 Manual test: start pi with `--preset plan` for an available preset; verify full apply
- [x] 1.5 Manual test: start pi with `--preset bad`; verify warning and no apply

## 2. Command surface guardrails

- [x] 2.1 Keep `/presets next` unsupported; verify it does not cycle presets
- [x] 2.2 Keep `/presets prev` unsupported; verify it does not cycle presets
- [x] 2.3 Keep `getArgumentCompletions` from adding `next` or `prev`

## 3. Hotkey registration

- [x] 3.1 Create `src/hotkeys.ts` exporting `registerHotkeys(pi, ctx, getPresets)`
- [x] 3.2 Iterate loaded presets; for each with a `hotkey`, parse via `parseHotkey` (from change 5)
- [x] 3.3 Track `claimed: Map<normalized, name>`; first-wins; subsequent presets get `hotkeyConflict: true` and a warning
- [x] 3.4 Detect built-in conflicts via `isPiBuiltin` (from change 5); register anyway, emit info-level notification
- [x] 3.5 Register the shortcut with a handler that re-fetches the _current_ preset definition each time
- [x] 3.6 Handler refuses gracefully when preset is missing (notify) or unavailable (notify)
- [x] 3.7 Wire `registerHotkeys` into `session_start` after `loadAll` completes
- [x] 3.8 Add `hotkeyConflict?: true` to the `LoadedPreset` type
- [x] 3.9 Update `src/ui/widgets.ts` `PresetCard` to render `⚠ hotkey conflict` when set

## 4. Editor copy update

- [x] 4.1 Refine the change-5 hotkey-changed notice wording per design (explicit old/new + "previous binding remains until /reload")
- [x] 4.2 Add the same explicit wording to the hotkey-removed and hotkey-added notices

## 5. Conflict and built-in lists

- [x] 5.1 Verify the built-in list in `src/ui/hotkey-input.ts` (change 5) is up to date with `docs/keybindings.md`
- [x] 5.2 Add tests covering the documented built-ins

## 6. Feature-scoped manual QA

- [x] 6.1 `--preset <name>` at startup: verify full apply, verify it overrides restore
- [x] 6.2 `/presets next` / `/presets prev`: verify they remain unsupported and do not activate presets
- [x] 6.3 Per-preset hotkey: declare hotkey, restart, press hotkey, verify activation
- [x] 6.4 Hotkey conflict between two presets: verify first-wins and warning
- [x] 6.5 Hotkey conflict with pi built-in: verify info notification, verify binding takes precedence
- [x] 6.6 Hotkey edit: change hotkey on a preset, verify "/reload required" notice; run `/reload`, verify new binding works and old binding is gone
