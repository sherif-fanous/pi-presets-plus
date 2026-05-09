## 1. Implementation fix: ⚠ glyph on availability messages

- [x] 1.1 In `src/ui/widgets.ts`, update `formatAvailabilityStatus` to prefix each return value with `"⚠ "`. The two case arms become `"⚠ This preset's provider has no API key configured."` and `"⚠ This preset's model is no longer available."`.
- [x] 1.2 Verify no other call site relies on the old prefix-less form (rg for `formatAvailabilityStatus` and inspect each).
- [x] 1.3 Confirm the picker card render path (`PresetCardComponent.render()`) does not double-add the glyph — `theme.fg("warning", availabilityStatus)` should wrap the now-prefixed message verbatim.

## 2. New flag: hotkeyShadowsBuiltin

- [x] 2.1 In `src/types.ts`, add `hotkeyShadowsBuiltin?: true | undefined` to the `LoadedPreset` interface, immediately after the existing `hotkeyConflict` field. Add a doc comment describing what the flag means and that it is computed at load time.
- [x] 2.2 In `src/hotkey-conflicts.ts`, inside `annotateAndAnalyzeHotkeys`, reset `preset.hotkeyShadowsBuiltin = undefined` at the top of the per-preset loop (alongside the existing `hotkeyConflict` reset). This guarantees stale annotations from a prior load cannot persist.
- [x] 2.3 In the same loop, after a successful `parseHotkey`, call `isPiBuiltin(parsed.parsed)` and assign `preset.hotkeyShadowsBuiltin = true` when it matches. Import `isPiBuiltin` from `src/ui/hotkey-input.js` (or refactor the helper to a shared location if importing from a UI file feels wrong — module-level helper, no UI dependencies, fine to share).
- [x] 2.4 Verify the new flag computation runs for both `shadowed` and non-shadowed presets — a preset that's overridden by a project-scope preset should still be annotated if its hotkey matches a Pi built-in (so the picker can surface the shadowing on the muted entry).

## 3. Picker card render

- [x] 3.1 In `src/ui/widgets.ts`, in `PresetCardComponent.render()`, add a new conditional Status-row push for `this.loadedPreset.hotkeyShadowsBuiltin === true`, placed adjacent to the existing `hotkeyConflict` block: `lines.push(this.renderField(`${STATUS_LABEL}:`, this.theme.fg("warning", "⚠ Hotkey shadows a Pi built-in.")));`.
- [x] 3.2 Verify the placement allows multiple Status rows to render simultaneously when several flags are set on the same preset — clampWarning + hotkeyConflict + hotkeyShadowsBuiltin + unavailable all rendering as four separate rows.

## 4. Tests

- [x] 4.1 In `tests/ui/widgets.test.ts`, update the availability-status assertions to expect the `⚠ ` prefix on both `no-key` and `no-model` messages.
- [x] 4.2 In `tests/ui/widgets.test.ts`, in the "renders readable key/value card combinations for visual smoke coverage" test, update the `⚠ ` prefix expectation for the availability line.
- [x] 4.3 Add a new test asserting that a preset with `hotkeyShadowsBuiltin: true` renders a Status row reading exactly `⚠ Hotkey shadows a Pi built-in.`.
- [x] 4.4 Add a multi-flag test that constructs a `LoadedPreset` with all four warning conditions (`clampWarning`, `hotkeyConflict`, `hotkeyShadowsBuiltin`, `unavailable: "no-key"`) and asserts four distinct Status rows render.
- [x] 4.5 Add a test in the hotkey-conflicts test file (or wherever `annotateAndAnalyzeHotkeys` is exercised) asserting that:
  - A preset whose hotkey matches a Pi built-in (e.g. `ctrl+l` if that's a documented built-in) is annotated `hotkeyShadowsBuiltin: true`.
  - A preset whose hotkey does NOT match any Pi built-in is NOT annotated.
  - A preset whose hotkey field is empty is NOT annotated.
  - A preset whose hotkey is malformed is NOT annotated (parsing fails before the builtin check).
  - The annotation is cleared on re-annotate when a previously-shadowing hotkey is changed to a non-shadowing one.

## 5. Verification

- [x] 5.1 Run `mise run check` and resolve any failures.
- [x] 5.2 Run `openspec validate --strict preset-picker` and `openspec validate --strict preset-shortcuts` to confirm both synced specs validate.
- [x] 5.3 Manually open the picker for a preset with `unavailable: "no-key"`; confirm the Status row reads `⚠ This preset's...` (with the glyph back).
- [x] 5.4 Manually create a preset with a hotkey that matches a Pi built-in (e.g. `ctrl+l`), confirm in the editor's existing builtin-shadow dialog, save. Open the picker; confirm the Status row reads `⚠ Hotkey shadows a Pi built-in.`. Verify it persists across `/reload`.
- [x] 5.5 Manually edit the same preset's hotkey to a non-shadowing key, save, reload. Confirm the Status row is gone.
