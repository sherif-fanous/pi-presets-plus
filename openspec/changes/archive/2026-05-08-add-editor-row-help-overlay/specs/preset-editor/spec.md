## ADDED Requirements

### Requirement: Editor accepts F1 to open contextual help

The editor SHALL accept the `F1` key as a global shortcut at any focus state, including while the user is typing into a single-line text input or the multi-line text area. The shortcut SHALL be intercepted at the top of the editor's input handler, before delegating to the focused row's handler, so no row consumes the keystroke.

When `F1` is pressed, the editor SHALL open an `info-dialog` overlay (built via `openInfoDialog`) showing per-row help content scoped to the currently-focused row. The editor SHALL hide its own overlay while the help overlay is up (using the existing `runWithHiddenOverlay` pattern that the confirmation dialogs already use) and SHALL restore its overlay when the help dialog is dismissed.

The help overlay SHALL be dismissible via either `Enter` or `Esc` (the `info-dialog` widget's existing contract).

#### Scenario: F1 opens help for the focused row

- **GIVEN** the editor is open with focus on the Hotkey row
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open an `info-dialog` overlay whose title corresponds to the Hotkey row
- **AND** the overlay's body SHALL contain the authored help text for the Hotkey row

#### Scenario: F1 opens help for whichever row is focused

- **GIVEN** the editor is open with focus on the Tools row
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open the help overlay scoped to the Tools row (not Hotkey, Name, or any other row)

#### Scenario: F1 works while typing in a text field

- **GIVEN** the editor is open with focus on the Prompt text area and the user has typed several characters
- **WHEN** the user presses `F1`
- **THEN** the editor SHALL open the Prompt help overlay
- **AND** the Prompt text area SHALL NOT receive the `F1` keystroke
- **AND** the typed content SHALL remain unchanged

#### Scenario: Esc dismisses the help overlay

- **GIVEN** the help overlay is open
- **WHEN** the user presses `Esc`
- **THEN** the help overlay SHALL close
- **AND** focus SHALL return to the editor with the same row focused as before help was opened

#### Scenario: Help overlay dismissal restores the editor

- **GIVEN** the help overlay is open
- **WHEN** the user dismisses it
- **THEN** the editor SHALL render again as the topmost overlay
- **AND** the editor's form state SHALL be unchanged from before help was opened

### Requirement: Editor authors per-row help content as a typed registry

The editor SHALL define a module-level constant typed `Record<EditorRowId, EditorRowHelpEntry>` (where `EditorRowHelpEntry` exposes a `title` string, a `body` array of paragraph strings, and an optional `editAddendum` array of paragraph strings shown only when the editor was opened for an existing preset). The constant SHALL be the single source of truth for help content. Adding a new value to `EditorRowId` SHALL require adding the corresponding help entry, enforced by TypeScript's exhaustiveness check.

Each help entry SHALL provide sentence-cased prose (matching the project's prose conventions) covering at minimum the row's purpose, the rules or constraints relevant to its values, and any non-obvious behavior the user should know. Help text SHALL favor friendly user-facing language over implementation-detail terminology (e.g. "Pi" rather than `pi-coding-agent`, "this project" rather than absolute filesystem paths).

When the editor was opened for an existing preset (`this.initialPreset !== undefined`), `openHelpForFocusedRow` SHALL concatenate `body` and `editAddendum` (in that order) before passing the joined paragraphs to the info-dialog overlay. When the editor was opened for a new preset, `editAddendum` paragraphs SHALL NOT appear in the rendered help body.

#### Scenario: Help content covers every form row

- **WHEN** the editor's source is read
- **THEN** the help registry SHALL contain an entry for each value of `EditorRowId`, including `name`, `scope`, `provider`, `model`, `thinking`, `tools`, `instructions`, `hotkey`, and `buttons`
- **AND** TypeScript SHALL fail to compile if any entry is missing

#### Scenario: Prompt help describes the system-prompt append behavior

- **WHEN** the help overlay is opened on the Prompt row
- **THEN** the rendered body SHALL explain that the user's text is added to Pi's system prompt rather than replacing it

#### Scenario: Tools help explains session vs preset modes in user-facing terms

- **WHEN** the help overlay is opened on the Tools row
- **THEN** the rendered body SHALL describe both `session` and `preset` modes
- **AND** the body SHALL describe the modes in user-facing terms (e.g. what each mode means at apply time) without surfacing storage-format details such as the omitted `tools` field

#### Scenario: Edit-mode addendum appears for an existing preset

- **GIVEN** the editor was opened for an existing preset
- **WHEN** the help overlay is opened on a row whose entry has an `editAddendum` (e.g. Name or Scope)
- **THEN** the rendered body SHALL include both the `body` paragraphs and the `editAddendum` paragraphs

#### Scenario: Edit-mode addendum hidden for a new preset

- **GIVEN** the editor was opened for a new preset (`initialPreset` is `undefined`)
- **WHEN** the help overlay is opened on a row whose entry has an `editAddendum`
- **THEN** the rendered body SHALL contain only the `body` paragraphs
- **AND** the rendered body SHALL NOT contain the `editAddendum` paragraphs

### Requirement: Footer hint surfaces the F1 Help shortcut

The editor's footer hint line SHALL include the token `F1 Help`. The token SHALL be present unconditionally — it does not gate on the test callback, on focus state, or on any row condition.

The token SHALL be placed in the footer hint line between the navigation/action tokens and the save/cancel shortcut tokens, serving as a visual divider between the two groups.

#### Scenario: Footer hint includes F1 Help

- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL contain the token `F1 Help`

#### Scenario: F1 Help token survives the test-callback gate

- **GIVEN** the editor was opened without a test callback (so the `^T Test` token is omitted)
- **WHEN** the editor is rendered
- **THEN** the footer hint line SHALL still contain `F1 Help`

## MODIFIED Requirements

### Requirement: Instructions text area

The editor's instructions row SHALL include a multi-line text area supporting basic editing (typing, backspace, left/right cursor movement). Pressing Enter while focused on the text area SHALL insert a newline character into the buffer; the user SHALL leave the text area via the row-cycling keys (Tab / arrow keys consumed by the form's focus manager). The package SHALL NOT spawn an external editor in this change.

The editor SHALL NOT render an inline hint beneath the Prompt row describing Enter and Tab semantics. The keystroke information is intentionally omitted from the dialog body and from the F1 help overlay's Prompt entry: the footer hint already names the global keys, and the user reaches the keystroke-specific instructions through pi documentation when needed. STATUS-driven inline hints (e.g. those introduced for Tools and Thinking rows) are unaffected by this rule because their content depends on dynamic state that a static help overlay cannot reflect.

#### Scenario: Inline edit

- **WHEN** the user types into the text area
- **THEN** the saved preset's `instructions` field SHALL contain the typed content

#### Scenario: Newline insertion

- **WHEN** the user presses Enter while focused on the instructions text area
- **THEN** a `\n` SHALL be inserted at the cursor position
- **AND** the saved preset's `instructions` field SHALL contain the newline

#### Scenario: No inline hint beneath Prompt

- **WHEN** the editor is rendered
- **THEN** the rendered output SHALL NOT contain the substring `"Enter inserts a newline. Tab exits."` beneath the Prompt row
