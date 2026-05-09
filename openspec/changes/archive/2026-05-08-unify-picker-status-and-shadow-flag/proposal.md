## Why

The picker card's `Status:` row has two issues: a regression where
the implementation no longer matches its own spec, and a missing
flag that hides a real condition from users after they save.

**Regression: `⚠` glyph missing from availability messages.** The
`polish-editor-picker-copy` change wrote a spec scenario that
explicitly requires the `Status:` field to render as
`⚠ This preset's provider has no API key configured.` (with the
glyph). The implementation, however, only produces the message
body — `formatAvailabilityStatus` returns the sentence without
the glyph and the render path doesn't add one. The result is
asymmetric:

```text
Status:  ⚠ Thinking will be clamped.            (matches spec)
Status:  ⚠ Hotkey conflict.                     (matches spec)
Status:  This preset's provider has no API key   (violates spec)
         configured.
Status:  This preset's model is no longer        (violates spec)
         available.
```

This is a pure implementation gap; the spec doesn't need to change.

**Missing flag: hotkey shadowing a Pi built-in is invisible after
save.** When the user creates a preset whose hotkey matches a
documented Pi built-in, the editor surfaces a confirmation dialog
asking whether to save anyway. If the user confirms, the saved
preset carries no flag indicating it shadows a Pi built-in, so
the picker card has no status to render. The user has no
ongoing reminder that their preset is shadowing — and the user
who later opens the preset list won't know the preset's hotkey
masks one of Pi's keys.

This change addresses both: fixes the implementation to render
the spec-required `⚠ ` prefix, and introduces a new
`hotkeyShadowsBuiltin?: true` flag on `LoadedPreset` (computed at
preset-load time, parallel to `hotkeyConflict`) with a
corresponding picker-card status row.

## What Changes

- The `formatAvailabilityStatus` implementation SHALL prefix every
  return value with `⚠ ` so the rendered Status field matches
  the existing spec contract that already mandates the prefix.
- The `LoadedPreset` shape SHALL gain an optional
  `hotkeyShadowsBuiltin?: true | undefined` annotation, set when
  the preset's parsed hotkey matches a documented Pi built-in (via
  `isPiBuiltin`). Computation runs at load time so the picker
  always reflects the saved state without requiring the editor's
  validation pipeline to re-run.
- The picker card SHALL render `⚠ Hotkey shadows a Pi built-in.`
  as a Status row when the underlying preset carries
  `hotkeyShadowsBuiltin: true`. The new row SHALL render
  alongside any other `Status:` rows the preset already carries
  (clamp, conflict, availability) without replacing them; a single
  preset can plausibly have multiple Status rows, and that's fine.
- The flag SHALL be cleared and recomputed on every load (mirroring
  how `hotkeyConflict` already behaves) so stale annotations from a
  prior load can never persist.
- Length harmonization across status messages is **not** in scope.
  The user explicitly approved the longer "This preset's provider
  has no API key configured." form during
  `polish-editor-picker-copy`; only the missing glyph and missing
  flag are addressed here.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-picker`: adds a Status row for the new
  hotkey-shadows-builtin condition. (No change to the existing
  availability-message wording or scenarios — the implementation
  fix is to MAKE the implementation match the existing spec.)
- `preset-shortcuts`: extends the load-time hotkey annotation
  pipeline with `hotkeyShadowsBuiltin`, parallel to the existing
  `hotkeyConflict` computation.

## Impact

- `src/types.ts`:
  - Add `hotkeyShadowsBuiltin?: true | undefined` to `LoadedPreset`.
- `src/hotkey-conflicts.ts` (or wherever load-time hotkey
  annotation runs):
  - Reset `hotkeyShadowsBuiltin = undefined` on every preset at
    the start of the recompute loop (matching the existing reset
    of `hotkeyConflict`).
  - When a preset's hotkey parses successfully, call
    `isPiBuiltin(parsed)` and set `hotkeyShadowsBuiltin = true`
    when it matches.
- `src/ui/widgets.ts`:
  - In `formatAvailabilityStatus`, prefix each return value with
    `"⚠ "`.
  - In `PresetCardComponent.render()`, add a Status row for
    `loadedPreset.hotkeyShadowsBuiltin === true` reading exactly
    `⚠ Hotkey shadows a Pi built-in.` in `warning` color, placed
    in the same Status section as the existing rows.
- Tests:
  - `tests/ui/widgets.test.ts` — update the availability-status
    assertions to expect the `⚠ ` prefix; add a test asserting
    `hotkeyShadowsBuiltin: true` produces the new Status row.
  - `tests/hotkey-conflicts.test.ts` (or wherever load-time
    annotation tests live) — assert the new flag is set when the
    parsed hotkey matches a Pi built-in, and cleared otherwise.
- No public-API change to the editor's validation surface; this
  change is purely about post-save visibility on the picker card.
- No interaction with `inline-hotkey-warnings` beyond the flag
  itself: that follow-up will USE this flag to decide whether to
  render an inline editor warning, but does not modify the flag
  computation.
