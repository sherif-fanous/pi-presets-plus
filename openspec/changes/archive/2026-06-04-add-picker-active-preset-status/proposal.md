## Why

When the picker opens, the active preset can be scrolled, filtered, or
scoped off-screen, so the first paint can show no green dot anywhere —
implying that no preset is active. This directly contradicts the Pi
footer, which always names the active preset, and the false negative is
most acute in exactly the cases users hit daily (long preset lists, a
narrowed scope, or a non-empty filter).

## What Changes

- Add a permanent active-preset status row to the picker chrome,
  rendered on its own line (not folded into the bordered header).
- The row is driven solely by session state and is invariant under
  focus mode, scope filter, filter query, scroll position, and reorder.
- When a preset is active the row reads `Active: <name> (<Scope>)`, where
  `<Scope>` is `User` or `Project`; when none is active it reads
  `Active: none` with the `none` sentinel rendered in `dim`. The row is
  always present, so only its text varies.
- The scope suffix disambiguates presets that share a name across scopes,
  matching the in-list dot's name + scope identity, and is rendered `dim`
  so the name stays primary.
- The row shows the preset name only — no drift/`(modified)` suffix.
  Drift remains the in-list card's responsibility.
- The existing green dot + accent highlight on the active card is
  retained unchanged; the status row is an always-visible identity
  signal that complements the dot's in-list locator role.
- Long names are middle-ellipsized to fit the interior width.

## Capabilities

### New Capabilities

<!-- None; this extends the existing picker capability. -->

### Modified Capabilities

- `preset-picker`: add a requirement that the picker always displays the
  active preset's identity in a dedicated status row, independent of
  list visibility.

## Impact

- Source: `src/ui/picker.ts` render layer only — a new status-row render
  method plus inclusion in the render assembly, and a bump to the chrome
  line-budget tally. No changes to picker state
  (`src/ui/picker-state.ts`), cursor/selection behavior, scope/filter
  logic, or storage.
- No new dependencies. No breaking changes.
