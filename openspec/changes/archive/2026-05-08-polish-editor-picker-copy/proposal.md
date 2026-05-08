## Why

A handful of small copy and styling issues in the preset editor and
the preset picker have accumulated over multiple changes. Each is too
small to merit its own proposal but together they degrade the polish
of the two main UI surfaces:

- The editor's `session` tools-mode hint reads awkwardly
  (`"Session: whatever tools are active right now pass through unchanged."`).
- The Prompt row's inline keyboard hint uses title-cased nouns
  (`"Enter Newline · Tab Exit"`) that violate the project's
  sentence-case-with-terminal-periods prose convention.
- The footer hint spells `Tab` as a word while every other movement
  key uses an arrow symbol (`↑/↓`, `←/→`), and the navigation +
  shortcut tokens were split across two physical lines for narrow
  terminals when in practice the combined line fits comfortably.
- The dimmed-levels hint conflates two distinct cases: a model that
  does not support thinking at all (entire row constrained to `off`)
  reads identically to a model that supports most levels but nulls
  one or two (`xhigh`, etc.). The hint should distinguish them.
- The picker card renders Scope and Model values in `muted` color
  alongside their `muted` labels, killing the label-vs-value
  contrast every other field on the card already has.
- The picker card's availability status uses a terse
  `"Unavailable — <reason>"` format that overloads the redundant
  `Unavailable —` prefix (the `Status:` label and the `⚠` glyph
  already convey unavailability) and uses developer-facing wording
  for what is otherwise user-facing copy.

This change cleans up all six in one pass.

## What Changes

- The editor's `session` tools-mode hint SHALL read
  `"Session: inherits the active tool set."`.
- The editor's Prompt row inline keyboard hint SHALL read
  `"Enter inserts a newline. Tab exits."`.
- The editor's footer hint SHALL render on a single dim line,
  combining navigation tokens and shortcut tokens, with `Tab`
  replaced by the symbol `⇥`. The line SHALL contain `⇥/↑/↓ Move`,
  `←/→ Change`, `Space Toggle`, `Enter Action`, `^S Save`,
  `Esc Cancel`, and (when the editor was opened with a test
  callback) `^T Test`. The two-line layout introduced by
  `improve-editor-input-ux` SHALL be replaced.
- The editor's dimmed-levels hint SHALL branch on whether the
  current model supports thinking at all. When the model has
  `reasoning: false` (or is undefined), the hint SHALL read
  `"This model does not support thinking."`. When the model has
  `reasoning: true` but at least one level is dimmed (the
  `thinkingLevelMap` nulls one or more levels, or `xhigh` is not
  explicitly mapped), the hint SHALL read
  `"Dimmed levels are unavailable for this model."`.
- The picker card SHALL render the Scope and Model **values** in
  the default text color (no `muted` color call), keeping the
  labels in `muted` so each field has the same label-vs-value
  contrast already used by Thinking, Tools, Status, and Drift.
- The picker card's availability status SHALL replace
  `"Unavailable — missing API key."` with
  `"This preset's provider has no API key configured."` and SHALL
  replace `"Unavailable — model not found."` with
  `"This preset's model is no longer available."`. The redundant
  `Unavailable — ` prefix is dropped; the surrounding `Status:`
  label and `⚠` glyph remain unchanged.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `preset-editor`: refines the wording, footer layout, and dimmed-
  levels hint to match the project's prose conventions.
- `preset-picker`: refines the picker card's value-color
  treatment and the availability-status copy.

## Impact

- `src/ui/editor.ts`:
  - `renderToolsRows()` — tools-mode session hint string change.
  - `renderInstructionsRows()` — Prompt row inline hint string
    change.
  - `renderFooterHints()` (currently returns a `string[]` of two
    lines) collapses to a single line via a new
    `renderFooterHint()` that returns a `string`. The dialog's
    main render replaces the `...renderFooterHints().map(...)`
    spread with a single `frameLine` call.
  - `renderThinkingRowsForState()` — branch on `model?.reasoning`
    when emitting the inline hint.
- `src/ui/widgets.ts`:
  - `renderField` calls for Scope and Model: drop the
    `theme.fg("muted", ...)` wrapper around the value.
  - `formatAvailabilityStatus()` — return new copy strings.
- Tests:
  - `tests/ui/editor-input-ux.test.ts` — update footer assertions
    (single line), Prompt-row hint assertion, tools session-mode
    hint assertion (if covered).
  - `tests/ui/editor-helpers.test.ts` — update the
    `renderThinkingRowsForState` no-notice test to match the new
    branched copy when the model is non-reasoning.
  - Any picker-card / availability tests that assert on the
    `"Unavailable — …"` strings.
- No schema changes, no storage changes, no public-API changes.
