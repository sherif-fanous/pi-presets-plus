## ADDED Requirements

### Requirement: User-facing strings adhere to a single voice convention

Every user-facing string surfaced by the package — including but not limited to `ctx.ui.notify` calls, overlay titles and bodies (info-dialog, confirm), inline editor notices, footer hint rows, status and clear formatter output, store-layer warnings, router error messages, `--preset` flag messages, hotkey activation messages, session-restore messages, and `/presets reload` summaries — SHALL follow this voice convention:

1. **Labels** (dialog row labels, status/clear field labels, footer keybinding labels): Title-Case with a trailing colon. Examples: `Preset:`, `Scope:`, `Baseline model:`, `Status:`.
2. **Prose** (notification bodies, dialog bodies, multi-sentence inline notices, lead sentences in clear summaries): sentence-case English with terminal periods. Each sentence is a complete thought ending in `.`. Examples: `Restored your previous settings.`, `Hotkey changes take effect after a reload. Reload now?`.
3. **Pi command references** stay literal in code-style font when displayed in monospace contexts: `/presets`, `/presets clear`, `/reload`, `/model`. In prose they appear without backticks but unchanged in spelling and case.
4. **Product name "Pi"** is capitalized when used as a noun in prose (`Reload Pi?`, `Pi exposes no API for unregistering shortcuts.`); lowercased only when referring to the `pi` CLI binary or `pi-ai` / `pi-tui` package names.
5. **Action labels** in button rows and footer hints: Title-Case (`Save`, `Cancel`, `Test (apply temporarily)`, `Status`, `Reload`).
6. Single-line labels SHALL NOT carry trailing periods. Multi-sentence prose blocks SHALL.
7. Two-voice mixing (e.g. a Title-Case label followed by lowercase prose) is allowed within the same string only when the prose follows a colon: `Status: Restored your previous settings.`. Otherwise sentences begin uppercase.

The convention SHALL be documented in `AGENTS.md` under a "User-facing strings" subsection of the existing "Code conventions" heading. Reviewers SHALL enforce the convention on new contributions.

Repeated label fragments and dialog titles that appear across multiple surfaces SHALL be defined in one shared module so a future tweak edits one location. The shared module SHALL include at minimum:

- Field labels used by status, clear, the editor, and picker cards (`Model`, `Thinking level`, `Tools`, `Preset`, `Scope`, `Status`).
- Per-surface composed forms used by status (`Baseline model`, `Preset model`, `Current model`, etc.).
- Dialog titles surfaced by overlays from the four concurrent changes that this change finalizes the voice of:
  - `Preset Status` (picker `s` action's info-dialog from `route-picker-info-output-through-overlay`).
  - `Preset cleared: <name>` (picker `c` action's info-dialog and prompt-invoked clear's notify title — same string sourced once).
  - `Activation failed` (picker error info-dialog from `surface-picker-activation-errors-in-overlay`).
  - `Reload Pi?` (post-Save and post-Delete confirm overlay from `prompt-reload-on-hotkey-mutation`).
  - `Move preset?`, `Hotkey shadows pi`, `Hotkey conflict` (existing editor confirm overlays).
- Footer action labels used by the picker (`Activate`, `Filter`, `Status`, `Quit`).

The shared module's name and exact location are an implementation choice; the requirement is that no two surfaces hold their own copy of the same string.

#### Scenario: Editor row labels follow the convention

- **WHEN** the editor renders any form row (Name, Scope, Provider, Model, Thinking, Tools, Prompt, Hotkey, Actions)
- **THEN** the row label SHALL be Title-Case followed by a trailing space (the colon variant lives only in dialogs that show key/value pairs)
- **AND** the label SHALL NOT carry a trailing period

#### Scenario: Status formatter labels follow the convention

- **WHEN** `formatStatus` renders any field row in its output
- **THEN** the field label SHALL be Title-Case with a trailing colon: `Preset:`, `Scope:`, `Baseline model:`, `Preset model:`, `Current model:`, `Baseline thinking level:`, `Preset thinking level:`, `Current thinking level:`, `Baseline tools:`, `Preset tools:`, `Current tools:`

#### Scenario: Clear summary lead and labels follow the convention

- **WHEN** `renderClearSummary` renders its title and lead sentence
- **THEN** the title SHALL read `Preset cleared: <name>` (Title-Case label, plain name)
- **AND** the lead SHALL be sentence-case English with a terminal period (e.g. `Restored your previous settings.`)
- **AND** each per-field row's label SHALL be Title-Case with a trailing colon (`Model:`, `Thinking level:`, `Tools:`)

#### Scenario: Activation-failure reason follows the convention

- **WHEN** `apply()` (or its `failureReason` helper) produces a refusal string
- **THEN** the string SHALL begin with a Title-Case sentence and end with a terminal period
- **AND** the string SHALL spell `Pi` (when used as a noun) with a capital P

#### Scenario: Inline editor notices follow the convention

- **WHEN** the editor renders an inline notice (hotkey-changed, validation error, snap-to-off, save-cancelled)
- **THEN** the notice SHALL be sentence-case English with a terminal period
- **AND** any embedded command names SHALL retain their literal spelling (e.g. `/reload`)

#### Scenario: Footer keybinding hints follow the convention

- **WHEN** the picker (or any overlay) renders its footer hint row
- **THEN** action labels SHALL be Title-Case (`Activate`, `Filter`, `Status`, `Quit`)

#### Scenario: Notify-surfaced messages from non-overlay paths follow the convention

- **WHEN** the package emits a `ctx.ui.notify` call from `hotkeys.ts`, `flag.ts`, `index.ts` (session restore), `commands/presets/router.ts`, `commands/presets/notify.ts`, `commands/presets/reload.ts`, or `commands/presets/status.ts`
- **THEN** the message SHALL be sentence-case English with a terminal period
- **AND** any embedded preset names, model identifiers, or command names SHALL retain their literal spelling
- **AND** any embedded label-style prefixes SHALL be Title-Case with a trailing colon

#### Scenario: Store-layer warnings follow the convention

- **WHEN** `store/load.ts`, `store/validate.ts`, or `store/merge.ts` produces a warning string surfaced via `surfaceWarnings`
- **THEN** the warning SHALL be sentence-case English with a terminal period

#### Scenario: Overlay titles introduced by concurrent changes follow the convention

- **WHEN** the package opens any of the overlays introduced by `route-picker-info-output-through-overlay` (Preset Status, Preset cleared), `surface-picker-activation-errors-in-overlay` (Activation failed), or `prompt-reload-on-hotkey-mutation` (Reload Pi?)
- **THEN** the overlay title SHALL be sourced from the shared labels module
- **AND** the title SHALL follow the Title-Case convention
- **AND** the body text SHALL be sentence-case English with terminal periods

#### Scenario: failureReason helper output follows the convention

- **WHEN** the `failureReason` helper produces a string for any of its four kinds (`no-key`, `no-model`, `unknown-model`, `key-revoked`)
- **THEN** the string SHALL be sentence-case with a terminal period and SHALL spell `Pi` with a capital P when used as a noun
- **AND** the same string SHALL be the body of the picker error info-dialog and the body of the `ctx.ui.notify` call surfaced by the hotkey, flag, session-restore, and router callers

#### Scenario: AGENTS.md captures the convention

- **WHEN** a contributor reads `AGENTS.md`
- **THEN** the file SHALL contain a "User-facing strings" subsection under "Code conventions" listing the rules above

#### Scenario: Repeated labels share one source of truth

- **WHEN** the same label fragment (e.g. `Model`, `Thinking level`, `Tools`) appears in two or more surfaces (status, clear, editor, picker card)
- **THEN** the label SHALL be defined exactly once in a shared module and consumed by each surface
