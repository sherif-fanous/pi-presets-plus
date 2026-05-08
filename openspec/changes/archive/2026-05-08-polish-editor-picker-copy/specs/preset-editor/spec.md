## MODIFIED Requirements

### Requirement: Tools row supports session and preset modes

The editor's tools row SHALL offer two modes: `session` (the saved preset has no `tools` field — session tools pass through unchanged at apply time) and `preset` (the saved preset has an explicit `tools` array). When `preset` is chosen, a multi-toggle list of all tools from `pi.getAllTools()` SHALL be shown, pre-checked from the preset's current `tools` value or from `pi.getActiveTools()` if the preset has no tools yet. The pre-check SHALL be computed when the editor opens, not when the user first enters `preset` mode, so the initial selection reflects a consistent snapshot of the live session regardless of later activity.

When the row's mode is `session`, the editor SHALL render an inline dim hint beneath the row reading `"Session: inherits the active tool set."`. When the row's mode is `preset`, the editor SHALL render the multi-toggle list directly (no inline explanatory hint is required because the toggle list is self-explanatory).

#### Scenario: Session mode

- **WHEN** the user saves the preset with the tools row set to `session`
- **THEN** the persisted preset SHALL omit the `tools` field

#### Scenario: Session mode hint wording

- **WHEN** the tools row's mode is `session`
- **THEN** the editor SHALL render an inline dim hint beneath the row reading exactly `"Session: inherits the active tool set."`

#### Scenario: Preset mode

- **WHEN** the user toggles `preset` and selects three tools
- **THEN** the persisted preset SHALL contain `tools: [<the three names>]`
- **AND** the editor SHALL NOT render the session-mode inline hint

#### Scenario: Pre-check seeded at open time for a preset without tools

- **WHEN** the editor is opened for a preset with no `tools` field while `pi.getActiveTools()` returns a non-empty list
- **THEN** the multi-toggle SHALL be pre-checked with those active tool names
- **AND** the tools row SHALL remain in `session` mode so the persisted preset still omits `tools` until the user explicitly toggles to `preset` mode

### Requirement: Instructions text area

The editor's instructions row SHALL include a multi-line text area supporting basic editing (typing, backspace, left/right cursor movement). Pressing Enter while focused on the text area SHALL insert a newline character into the buffer; the user SHALL leave the text area via the row-cycling keys (Tab / arrow keys consumed by the form's focus manager). The package SHALL NOT spawn an external editor in this change.

The editor SHALL render an inline dim hint beneath the Prompt row reading exactly `"Enter inserts a newline. Tab exits."`. The hint communicates the row's non-default Enter behavior in sentence-cased prose with terminal periods.

#### Scenario: Inline edit

- **WHEN** the user types into the text area
- **THEN** the saved preset's `instructions` field SHALL contain the typed content

#### Scenario: Newline insertion

- **WHEN** the user presses Enter while focused on the instructions text area
- **THEN** a `\n` SHALL be inserted at the cursor position
- **AND** the saved preset's `instructions` field SHALL contain the newline

#### Scenario: Inline hint wording

- **WHEN** the editor is rendered
- **THEN** the inline hint beneath the Prompt row SHALL read exactly `"Enter inserts a newline. Tab exits."`

### Requirement: Footer hint surfaces the editor shortcuts

The editor's footer SHALL include a single dim hint line listing both the navigation keys and the global keyboard shortcuts. The hint line SHALL contain at minimum the tokens `⇥/↑/↓ Move`, `←/→ Change`, `Space Toggle`, `Enter Action`, `^S Save`, and `Esc Cancel`. When the editor was opened with a test callback, the line SHALL also contain `^T Test`. When no test callback is wired, the line SHALL NOT contain `^T Test` (matching the rule that the Test button is not rendered in that case).

The token for the Tab key SHALL be the symbol `⇥` (U+21E5 RIGHTWARDS ARROW TO BAR), matching the arrow-symbol convention already used by the up/down and left/right movement tokens.

The footer SHALL render the hint as a single line. Terminals narrower than the rendered line MAY visually wrap it; pi-tui's frame handling preserves the content in that case.

The on-screen Save / Cancel / Test buttons remain reachable via Tab-cycling regardless of the footer hint; the shortcuts and the buttons are independent paths to the same actions.

#### Scenario: Footer renders navigation hints

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain the tokens `⇥/↑/↓ Move`, `←/→ Change`, `Space Toggle`, and `Enter Action`

#### Scenario: Footer renders shortcut hints with Save and Cancel

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain `^S Save` and `Esc Cancel`

#### Scenario: Footer renders Test shortcut when wired

- **GIVEN** the editor was opened with a test callback
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain `^T Test`

#### Scenario: Footer omits Test shortcut when unwired

- **GIVEN** the editor was opened without a test callback
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL NOT contain `^T Test`

#### Scenario: Footer renders on a single line

- **GIVEN** the editor was opened with a test callback in a terminal at least 90 columns wide
- **WHEN** the editor is rendered
- **THEN** the footer SHALL emit one framed line containing all seven tokens
- **AND** the footer SHALL NOT split the navigation tokens and the shortcut tokens onto separate framed lines

### Requirement: Thinking-level radio respects model capability

The editor's thinking-level radio SHALL render greyed and unselectable for any level not in `validThinkingLevels(currentlySelectedModel)`. `validThinkingLevels` mirrors pi-ai's `getSupportedThinkingLevels`: if the model has `reasoning: false` (or falsy), only `"off"` SHALL be valid; otherwise, for each level other than `"xhigh"` the level is valid unless `thinkingLevelMap?.[level]` is exactly `null`, and `"xhigh"` is valid only when `thinkingLevelMap?.["xhigh"]` is defined and not `null`.

When the user changes the model field such that the currently-selected thinking level becomes invalid, the radio SHALL snap the selection to `"off"`. The auto-snap SHALL be triggered only by user-driven model or provider changes; opening the editor SHALL NOT mutate the form's selected thinking level. The editor SHALL NOT render any inline notice or message accompanying the snap; the visible state of the radio (selected `"off"`, every other dot dimmed and unselectable) and the inline dimmed-levels hint together convey both the resulting state and the reason.

When at least one level is dimmed for the currently-selected model (i.e. `validThinkingLevels(model).length < 6`), the editor SHALL render a single dim hint line beneath the Thinking row. The hint SHALL branch on the model's reasoning capability:

- When the model has `reasoning: false`, the hint SHALL read exactly `"This model does not support thinking."`. This case occurs precisely when the only valid level is `"off"`.
- Otherwise (the model has `reasoning: true` and at least one level is dimmed because `thinkingLevelMap` nulls it or because `xhigh` is not explicitly mapped), the hint SHALL read exactly `"Dimmed levels are unavailable for this model."`.

When no model is selected (`model` is undefined), the dimmed-levels hint SHALL NOT render: `validThinkingLevels(undefined)` returns the full set of levels, and there is genuinely nothing to warn about.

The validity check SHALL access `thinkingLevelMap` defensively so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain selectable; `"xhigh"` is not).

#### Scenario: Reasoning model with no thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** the five levels `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"` SHALL be selectable
- **AND** `"xhigh"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Reasoning model with partial thinkingLevelMap selected

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** all six thinking levels SHALL be selectable (missing non-xhigh keys fall through to provider defaults, and xhigh is explicitly mapped)
- **AND** no inline dimmed-levels hint SHALL be rendered

#### Scenario: Reasoning model nulls a level in thinkingLevelMap

- **WHEN** the editor's selected model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** the `"low"` radio entry SHALL be visually disabled and SHALL NOT be selectable
- **AND** `"xhigh"` SHALL also be visually disabled (not explicitly mapped)
- **AND** the remaining four levels SHALL be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"Dimmed levels are unavailable for this model."`

#### Scenario: Non-reasoning model selected

- **WHEN** the editor's selected model has `reasoning: false`
- **THEN** thinking-level options other than `"off"` SHALL be visually disabled and SHALL NOT be selectable
- **AND** the inline hint beneath the Thinking row SHALL read exactly `"This model does not support thinking."`

#### Scenario: Changing model invalidates current selection

- **WHEN** the user changes the model field such that the previously-selected thinking level is no longer valid for the new model (because the new model has `reasoning: false`, because the new model's `thinkingLevelMap` maps that level to `null`, or because the level is `"xhigh"` and the new model does not explicitly map it)
- **THEN** the thinking selection SHALL snap to `"off"`
- **AND** no inline notice or message SHALL be rendered as a result of the snap

#### Scenario: Opening editor for a clamp-warning preset does not mutate selection

- **WHEN** the editor is opened for an existing preset whose declared `thinkingLevel` is non-`"off"` and whose resolved model would clamp the level (`reasoning: false`, `thinkingLevelMap` maps the level to `null`, or the level is `"xhigh"` and the model does not explicitly map it)
- **THEN** the form's selected thinking level SHALL remain at the declared value
- **AND** if the user presses Save without further edits the persisted preset's `thinkingLevel` SHALL equal the original declared value

#### Scenario: No notice rendered after a snap

- **GIVEN** the user changed model from a reasoning model with `thinkingLevel: "high"` to a non-reasoning model, causing a snap to `"off"`
- **WHEN** the editor renders the dialog
- **THEN** the rendered output SHALL NOT contain any text of the form `"<model> does not support extended thinking"` or any other inline notice produced by the snap
- **AND** the rendered output SHALL contain the new branched dimmed-levels hint, reading `"This model does not support thinking."`
- **AND** the Thinking row's radio SHALL show `● off` with every other level visually dimmed
