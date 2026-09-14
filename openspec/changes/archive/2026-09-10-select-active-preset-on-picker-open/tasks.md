## 1. Opening selection

- [x] 1.1 In `src/ui/picker.ts`, set `this.state` in the `PresetPickerComponent`
      constructor body by running `initialPickerState()` through
      `preserveSelectionOrFirst` with the key of `session.current()` (via
      `loadedPresetKey`) when one is active, the full preset list, an empty
      query, and `this.pageSize`; verify by opening `/presets` with a preset
      active that is not first in list order and seeing the cursor on its card.
- [x] 1.2 Keep `initialPickerState()` in `src/ui/picker-state.ts` argument-free
      and unchanged, and verify `tests/ui/picker-state.test.ts` still passes
      untouched.
- [x] 1.3 Confirm the field initializer no longer fights the constructor
      assignment (no stale `selectedIndex: 0` state observable before the first
      render) by reading back `this.state` in a unit test for a component built
      with an active session.

## 2. Tests

- [x] 2.1 Add a picker test covering the active preset being selected on open,
      including the card carrying both the status dot and the selection
      highlight; verify it fails against the current `selectedIndex: 0`
      behavior.
- [x] 2.2 Add a test for an active preset whose card sits below the viewport
      packed from the top, asserting the first rendered frame includes that
      card.
- [x] 2.3 Add tests for both fallbacks: no active preset, and an active preset
      absent from the loaded list; both assert the first visible card is
      selected.
- [x] 2.4 Add a test that a user preset and a project preset sharing a name
      resolve to the active one by scope.
- [x] 2.5 Add a test that `⏎` immediately after open targets the active preset
      rather than the first preset.
- [x] 2.6 Audit `tests/ui/picker-active-status.test.ts`,
      `tests/ui/picker-variable-height.test.ts`,
      `tests/ui/picker-info-actions.test.ts`, and
      `tests/ui/picker-reload.test.ts` for assumptions that the opening cursor
      is row 0 with a preset active, and update the ones that break; verify with
      `mise run test`.

## 3. Documentation

- [x] 3.1 Check `README.md` for any statement about where the picker cursor
      starts and update it only if one exists.

## 4. Verification

- [x] 4.1 Run `mise run check` and confirm it passes clean.
- [x] 4.2 Manual smoke test: activate a preset that sorts near the bottom of a
      long list, reopen `/presets`, and confirm the cursor and the viewport both
      land on it, then confirm `↑`, `↓`, `PgUp`, `PgDn`, `←`, `→`, and `/` all
      behave as before.
- [x] 4.3 Run `openspec validate select-active-preset-on-picker-open --strict`.
