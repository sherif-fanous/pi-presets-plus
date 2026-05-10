# Preset Picker Specification

## Purpose

Define the interactive `/presets` picker UI for browsing loaded presets,
filtering them, inspecting readable preset cards, and activating a preset
without exposing exact-name command activation or textual list synonyms.

## Requirements

### Requirement: Picker UI lists every loaded preset

The package SHALL provide a custom TUI picker (built on `ctx.ui.custom`) that lists every loaded preset across both scopes. Each list entry SHALL render as a multi-line key/value card showing: a status dot when the preset is currently active, the preset name, scope as `User` or `Project`, `provider / model`, thinking level, tool summary or `inherit`, optional prompt preview, explicit availability status when `unavailable`, an explicit Pi-builtin-shadow status when the preset's hotkey shadows a Pi built-in, and explicit shadowing status when shadowed.

Card field labels SHALL render in the `muted` color. Card field **values** SHALL NOT use the `muted` color: every value renders in either the theme's default text color (Scope, Model, Tools, Prompt) or a semantically meaningful color (Thinking — by level; Status — `warning`; Drift — `warning`; Shadowing — `dim`). This ensures every field has visible label-vs-value contrast.

When a preset is `unavailable`, the picker card SHALL render its `Status:` field with a `⚠` glyph and a sentence-cased explanatory message in `warning` color. The message SHALL match the cause:

- For `unavailable: "no-key"` (the resolved model's provider has no API key configured), the message SHALL read exactly `"This preset's provider has no API key configured."`.
- For `unavailable: "no-model"` (the resolved model is not present in the model registry), the message SHALL read exactly `"This preset's model is no longer available."`.

The redundant `"Unavailable —"` prefix SHALL NOT appear in the message body; the surrounding `Status:` label and `⚠` glyph already convey the unavailability framing.

When the preset is annotated `hotkeyShadowsBuiltin: true` (computed at load time when the preset's parsed hotkey matches a documented Pi built-in), the picker card SHALL render an additional `Status:` row reading exactly `"⚠ Hotkey shadows a Pi built-in."` in `warning` color. The row SHALL render alongside any other Status rows the preset already carries (clamp-warning, hotkey-conflict, availability) — multiple Status rows for a single preset are allowed and each independent condition contributes its own row.

Status rows SHALL render in the following canonical order when present: clamp warning, hotkey conflict, Pi-builtin-shadow warning, then availability. This keeps rows predictable across presets while grouping hotkey-related conditions before the broader availability condition.

#### Scenario: Open picker with several presets

- **WHEN** the user invokes `/presets`
- **THEN** every loaded preset SHALL appear with the fields above and no preset SHALL be hidden by default

#### Scenario: Active preset highlighted

- **WHEN** preset `plan` is currently active and the picker is opened
- **THEN** the entry for `plan` SHALL display a filled status dot distinct from inactive entries

#### Scenario: Unavailable preset rendered with no-key reason

- **WHEN** a preset is marked `unavailable: "no-key"`
- **THEN** its card SHALL render the `Status:` field as `⚠ This preset's provider has no API key configured.`

#### Scenario: Unknown-model preset rendered with no-model reason

- **WHEN** a preset is marked `unavailable: "no-model"`
- **THEN** its card SHALL render the `Status:` field as `⚠ This preset's model is no longer available.`

#### Scenario: Shadowed global preset shown with marker

- **WHEN** a global preset is shadowed by a same-named project preset
- **THEN** both entries SHALL appear in the picker (with `Scope: All`), and the global one SHALL show `Shadowing: Overridden by project preset`

#### Scenario: Scope and Model values render in default text color

- **WHEN** the picker renders a preset card
- **THEN** the value cell of the `Scope:` field SHALL NOT use the `muted` color
- **AND** the value cell of the `Model:` field SHALL NOT use the `muted` color
- **AND** both `Scope:` and `Model:` labels SHALL continue to render in `muted` color so each field has label-vs-value contrast

#### Scenario: Availability message body omits the legacy prefix

- **WHEN** a preset is marked `unavailable`
- **THEN** the rendered availability message SHALL NOT begin with the substring `"Unavailable —"` or `"Unavailable -"` in any form

#### Scenario: Picker renders the Pi-builtin-shadow status

- **WHEN** a preset is annotated `hotkeyShadowsBuiltin: true`
- **THEN** its card SHALL render a `Status:` row reading exactly `"⚠ Hotkey shadows a Pi built-in."`

#### Scenario: Multiple Status rows for one preset

- **GIVEN** a preset is annotated with `clampWarning: true`, `hotkeyConflict: true`, `hotkeyShadowsBuiltin: true`, and `unavailable: "no-key"` simultaneously
- **WHEN** the picker renders the card
- **THEN** the card SHALL show four distinct `Status:` rows, one for each condition, each in `warning` color and each beginning with `⚠ `

### Requirement: Picker renders inside a full bordered dialog

The picker SHALL render inside a full bordered dialog that includes top, bottom, left, and right borders. The dialog SHALL include a header row with the user-facing title `Presets Plus` and the current scope filter, a filter row, a scrollable card list, and a footer hint row.

#### Scenario: Full border visible

- **WHEN** the picker is open
- **THEN** the picker SHALL show left and right borders on every row in addition to top and bottom borders

#### Scenario: Lines fit dialog width

- **WHEN** card fields are longer than the dialog width
- **THEN** rendered lines SHALL be truncated or otherwise fit within the bordered dialog without overflowing past the right border

### Requirement: Filter input with literal-substring-first ranking

The picker SHALL include a free-text filter input (focused via `/`). Filtering SHALL produce two ordered groups concatenated in this order: first, presets whose `name` or `provider/model` contains the query as a case-insensitive literal substring; second, presets matched only by subsequence-fuzzy match. Within each group the input order SHALL be preserved.

#### Scenario: Literal match precedence (the #3433-style example)

- **WHEN** the user types `opus` and the loaded presets include some whose model contains the literal string `opus` and others matched only by subsequence on the letters `o`, `p`, `u`, `s` (e.g. via the substring `openrouter`)
- **THEN** all literal-`opus` presets SHALL appear above any subsequence-only matches

#### Scenario: No matches

- **WHEN** the filter has no matches in either group
- **THEN** the picker SHALL render a "no matches" notice and disable activation

#### Scenario: Empty filter

- **WHEN** the filter input is empty
- **THEN** all presets SHALL be shown in their natural order (per `loadAll`'s output)

#### Scenario: Filter focus has visual cursor

- **WHEN** the filter input is focused
- **THEN** the filter row SHALL show a clear visual focus indicator and cursor position

#### Scenario: Filter focus returns to list

- **WHEN** the filter input is focused and the user presses `Esc`
- **THEN** focus SHALL return to the list and the picker SHALL remain open

### Requirement: Scope filter toggle in the header

The picker SHALL show the current scope filter in the header (`Scope: All`, `Scope: User only`, or `Scope: Project only`) and SHALL allow cycling between the three states with `←` / `→`. The default scope is `All`.

#### Scenario: User-only filter

- **WHEN** the user cycles to `User only`
- **THEN** only presets with `scope: "user"` SHALL appear; project presets SHALL be hidden; shadowed globals SHALL appear normally because their project shadows are hidden

#### Scenario: Project-only filter

- **WHEN** the user cycles to `Project only`
- **THEN** only presets with `scope: "project"` SHALL appear

#### Scenario: All filter

- **WHEN** the scope filter is `All`
- **THEN** every loaded preset SHALL be visible, with shadowed globals tagged

### Requirement: Activate from picker

When the user presses `Enter` on a selected preset, the picker SHALL invoke the existing apply flow for that preset.

On `apply()` returning `{ ok: true }`, the picker SHALL close.

On `apply()` returning `{ ok: false, reason }`, the picker SHALL stay open and SHALL render the `reason` in a shared info-dialog overlay (tone = `"error"`, title = `"Activation failed"`). The picker SHALL hide itself behind the dialog while the dialog is open and SHALL restore focus to the same selected row when the user dismisses the dialog with `Enter` or `Esc`. The picker SHALL NOT close as a side effect of the failure.

The picker SHALL NOT call `ctx.ui.notify` to surface activation refusals — the info-dialog is the sole surface for picker-driven activation refusals.

Exact-name command activation (for example `/presets plan`) SHALL NOT be part of the command surface; picker selection is the activation path.

#### Scenario: Activate available preset

- **WHEN** the user selects an available preset and presses `Enter`
- **AND** `apply()` returns `{ ok: true }`
- **THEN** the picker SHALL close and the preset activation flow SHALL run

#### Scenario: Activate unavailable preset shows error dialog

- **WHEN** the user selects a preset marked `unavailable: "no-key"` and presses `Enter`
- **AND** `apply()` returns `{ ok: false, reason: <text>, kind: "no-key" }`
- **THEN** the picker SHALL remain open
- **AND** an info-dialog overlay SHALL appear with tone `error`, title `"Activation failed"`, and body equal to `reason`
- **AND** `ctx.ui.notify` SHALL NOT be called for the refusal
- **AND** dismissing the dialog with `Enter` or `Esc` SHALL return focus to the picker without closing it

#### Scenario: Activation failure for unknown model shows error dialog

- **WHEN** the user activates a preset whose `provider`/`model` does not resolve and `apply()` returns `{ ok: false, kind: "unknown-model" }`
- **THEN** the picker SHALL remain open and an error info-dialog SHALL render the reason

#### Scenario: Activation failure for revoked key shows error dialog

- **WHEN** activation reaches `setModel` which returns false (key revoked between load and apply) and `apply()` returns `{ ok: false, kind: "key-revoked" }`
- **THEN** the picker SHALL remain open and an error info-dialog SHALL render the reason

#### Scenario: Cancel without activating

- **WHEN** list focus is active and the user presses `Esc`
- **THEN** the picker SHALL close and no state change SHALL occur

### Requirement: Navigation wraps at list boundaries

The picker SHALL treat vertical navigation as cyclic. Pressing down from the last visible preset SHALL select the first visible preset, and pressing up from the first visible preset SHALL select the last visible preset.

#### Scenario: Down wraps to first preset

- **WHEN** the final visible preset is selected
- **AND** the user presses `↓`
- **THEN** the first visible preset SHALL become selected

#### Scenario: Up wraps to final preset

- **WHEN** the first visible preset is selected
- **AND** the user presses `↑`
- **THEN** the final visible preset SHALL become selected

### Requirement: Footer keybinding hints

The picker SHALL render a footer hint row using readable title-case action labels and showing at minimum: activate (`⏎`), filter (`/`), movement (`↑/↓`), page movement (`PgUp/PgDn`), scope cycle (`←/→`), status (`s`), and exit (`Esc`).

#### Scenario: Footer present

- **WHEN** the picker is open
- **THEN** a footer hint row SHALL be visible at the bottom of the picker showing the keybindings above

#### Scenario: Status hint listed

- **WHEN** the picker is open
- **THEN** the footer hint row SHALL include the `Status` entry bound to the `s` key

### Requirement: Picker exposes a Status action

The picker SHALL expose a `Status` action bound to the `s` key while the list is focused. Pressing `s` SHALL open an info-dialog overlay rendering the same payload that `/presets status` produces (including the empty "no preset is active" case). After the user dismisses the dialog with `Enter` or `Esc`, the picker SHALL remain open with list focus restored.

#### Scenario: Status from picker with active preset

- **WHEN** the user opens the picker, a preset is active, and the user presses `s`
- **THEN** an info-dialog overlay SHALL appear rendering the active-preset diagnostic produced by `formatStatus`
- **AND** the picker SHALL remain open behind the dialog
- **AND** dismissing the dialog SHALL return list focus to the picker

#### Scenario: Status from picker with no active preset

- **WHEN** the user opens the picker, no preset is active, and the user presses `s`
- **THEN** an info-dialog overlay SHALL appear with the same "no preset is active" body that `/presets status` emits today
- **AND** dismissing the dialog SHALL return list focus to the picker

### Requirement: Picker routes Clear and Status output through an info-dialog overlay

When the picker triggers `clear` (via the `c` action) or `status` (via the `s` action), the package SHALL render the resulting payload in a shared info-dialog overlay rather than via `ctx.ui.notify`. The dialog SHALL display a title, the rendered body verbatim, and a dismissal hint, and SHALL resolve on `Enter` or `Esc`. The dialog SHALL anchor center, max height ≤ the surrounding overlay viewport, and width ≤ 90 % of the viewport.

#### Scenario: Clear from picker shows summary in dialog

- **WHEN** the user presses `c` in the picker, confirms the prompt, and the clear flow runs
- **THEN** the rendered clear summary SHALL appear in an info-dialog overlay above the picker
- **AND** `ctx.ui.notify` SHALL NOT be called for the summary on the picker-driven path

#### Scenario: Clear cancelled does not open info-dialog

- **WHEN** the user presses `c` in the picker and dismisses the confirm prompt with No
- **THEN** no info-dialog overlay SHALL appear

#### Scenario: Status from picker shows diagnostic in dialog

- **WHEN** the user presses `s` in the picker
- **THEN** the diagnostic produced by `formatStatus` SHALL appear in an info-dialog overlay above the picker
- **AND** `ctx.ui.notify` SHALL NOT be called for the diagnostic on the picker-driven path

#### Scenario: Dialog dismissal returns focus

- **WHEN** the info-dialog is open and the user presses `Enter` or `Esc`
- **THEN** the dialog SHALL close
- **AND** focus SHALL return to the picker without closing the picker

### Requirement: Picker clear short-circuits when no preset is active

When the user presses `c` (clear) inside the picker and no preset is currently active, the package SHALL NOT open the "Clear active preset?" confirm dialog. Instead, the package SHALL open an info-dialog overlay (using the same shared overlay surface as the existing clear-summary and status dialogs) with the title "Clear Unavailable" and the body "No preset is active.", then return to the picker without invoking any clear flow.

When a preset is currently active, the existing confirm-then-clear-then-summary flow SHALL run unchanged.

The check for "is a preset active" SHALL consult the active-preset session (i.e., `session.current()` is `undefined`); the check SHALL NOT re-read the preset files or otherwise reach beyond the already-loaded session state.

#### Scenario: Press `c` with no preset active

- **GIVEN** the picker is open and no preset is currently active (`session.current()` is `undefined`)
- **WHEN** the user presses `c`
- **THEN** an info-dialog SHALL appear with the title "Clear Unavailable" and the body "No preset is active."
- **AND** the "Clear active preset?" confirm dialog SHALL NOT be opened
- **AND** the underlying clear engine SHALL NOT be invoked
- **AND** dismissing the info-dialog with `Enter` or `Esc` SHALL return focus to the picker without closing the picker

#### Scenario: Press `c` with a preset active

- **GIVEN** the picker is open and a preset is currently active (`session.current()` returns an attachment)
- **WHEN** the user presses `c`
- **THEN** the "Clear active preset?" confirm dialog SHALL open as today
- **AND** the existing confirm-then-clear-then-summary flow SHALL run unchanged

### Requirement: CRUD action keys are reserved with hints

When the user presses any of `n`, `e`, `d`, or `x` inside the picker, the package SHALL show an info hint stating that the editor arrives in the next change, and SHALL keep the picker open.

#### Scenario: Reserved key pressed

- **WHEN** the user presses `n`, `e`, `d`, or `x`
- **THEN** an info notification SHALL state "Editor coming in next change" (or equivalent) and the picker SHALL remain open

### Requirement: Picker reads fresh data on each open

Each time the picker opens, the package SHALL call `loadAll(ctx)` so that external edits between opens are reflected without requiring `/reload`.

#### Scenario: External edit between picker opens

- **WHEN** the user opens the picker, closes it, edits the JSON file, and reopens the picker
- **THEN** the new contents SHALL be reflected without an explicit reload step

### Requirement: /presets opens the picker

The `/presets` command (with no arguments) SHALL open the picker. `/presets list`, `/presets list --text`, and `/presets <preset-name>` exact-name activation SHALL NOT be part of this change's user-facing command surface.

#### Scenario: Bare /presets opens picker

- **WHEN** the user runs `/presets`
- **THEN** the picker SHALL open

#### Scenario: /presets list is not supported

- **WHEN** the user runs `/presets list`
- **THEN** the package SHALL NOT open the picker as a `list` synonym
- **AND** the package SHALL report that `list` is not a supported subcommand or otherwise leave the command unhandled according to the router's unknown-subcommand behavior

#### Scenario: /presets list --text is not supported

- **WHEN** the user runs `/presets list --text`
- **THEN** the package SHALL NOT print a textual preset list
- **AND** the package SHALL report that `list` is not a supported subcommand or otherwise leave the command unhandled according to the router's unknown-subcommand behavior

#### Scenario: Exact-name activation is not supported

- **WHEN** the user runs `/presets plan`
- **THEN** the package SHALL NOT activate the preset named `plan`
- **AND** the package SHALL report `plan` as an unknown or unsupported subcommand
