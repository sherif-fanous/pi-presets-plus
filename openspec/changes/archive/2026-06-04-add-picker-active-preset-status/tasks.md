## 1. Render the status row

- [x] 1.1 Add a `renderActiveStatusContent()` method to
      `PresetPickerComponent` in `src/ui/picker.ts` that reads
      `this.session.current()` and returns `Active: <name>` when a preset is
      active or `Active: none` when none is, using the existing theme
      helpers for styling (name only, no drift suffix).
- [x] 1.2 Middle-ellipsize the active preset name when it exceeds the
      interior width, reusing the existing frame/width utilities so both the
      leading and trailing portions remain visible.
- [x] 1.3 Insert the status row as its own `frameLine` between the top
      border and the filter input row in the render assembly (the array
      returned around the `renderTopBorder` / `renderFilterContent` block).

## 2. Keep chrome sizing correct

- [x] 2.1 Increment `CHROME_LINES` from 6 to 7 and update the adjacent
      comment to include the active-status row in the enumerated chrome
      lines.
- [x] 2.2 Manually verify (or via existing variable-height tests) that
      the list card budget still computes correctly with the extra row.

## 3. Tests

- [x] 3.1 Add picker tests asserting the status row reads
      `Active: <name>` when a preset is active and `Active: none` when none
      is.
- [x] 3.2 Add tests asserting the row is invariant under focus mode,
      scope filter, and a filter query that excludes the active preset (row
      still shows the active name in each case).
- [x] 3.3 Add a test asserting a long active preset name is
      middle-ellipsized and that the in-list dot/accent still render
      alongside the row.

## 4. Verify

- [x] 4.1 Run `mise run check` (format-check, type-check, lint, test) and
      resolve any violations.
