## ADDED Requirements

### Requirement: `/presets show-prompt` subcommand

The `/presets` command SHALL accept a `show-prompt` subcommand that emits the active preset's prompt — or any named preset's prompt — to the user.

The subcommand SHALL be registered in the same subcommand registry that contains `reload`, `clear`, and `status`, alongside an autocomplete label of the form `show-prompt: show the active preset's prompt (or [name])`. Argument-position autocomplete SHALL offer known preset names from `loadAll()` when the cursor is past the `show-prompt` token; an empty prefix SHALL offer every loaded preset, and a non-empty prefix SHALL filter to names that start with the prefix (case-sensitive, matching the existing autocomplete style elsewhere in the router).

The runtime behavior of the subcommand SHALL follow the matrix below. Lookup by name SHALL use the same scope-precedence rules as `findPreset` (project shadows user). Short status outcomes SHALL be surfaced through `ctx.ui.notify`; prompt-body outcomes SHALL be surfaced through the package's multi-line `openInfoDialog` reader surface.

- `/presets show-prompt` with no preset active SHALL emit an `info`-severity message of exactly `No preset is active.`.
- `/presets show-prompt` with an active preset whose `instructions` field is empty (absent, `""`, or whitespace-only) SHALL emit an `info`-severity message of exactly `Active preset "<name>" has no prompt.`, where `<name>` is the active preset's name.
- `/presets show-prompt` with an active preset whose `instructions` field is non-empty SHALL render that prompt body in a dismissible multi-line dialog. The body SHALL be the literal `instructions` value (no trimming, no transformation). When the surrounding pi build exposes a markdown-render hook compatible with that dialog surface and `@mariozechner/pi-tui` exposes a `Markdown` component, the body SHALL be rendered as markdown; otherwise the body SHALL be rendered as plain text.
- `/presets show-prompt <name>` with `<name>` not matching any loaded preset SHALL emit an `error`-severity message of exactly `No preset named "<name>".`.
- `/presets show-prompt <name>` with `<name>` matching a loaded preset whose `instructions` field is empty SHALL emit an `info`-severity message of exactly `Preset "<name>" has no prompt.`.
- `/presets show-prompt <name>` with `<name>` matching a loaded preset whose `instructions` field is non-empty SHALL render that preset's prompt body (subject to the same markdown / plain-text rule above), regardless of whether that preset is currently active.

The subcommand SHALL NOT activate, modify, or otherwise mutate any preset, active state, or hotkey registration. It is a strict reader.

The package SHALL expose a pure formatter (`formatShowPromptBody(result, theme): { body: string; severity: "info" | "warning" | "error" }`) backed by a pure classifier (`findPresetForShowPrompt(name, active, loaded)`) that returns a discriminated result. Both helpers SHALL be exported separately from the runner so that tests can exercise the behavior matrix without stubbing UI calls.

#### Scenario: `show-prompt` with no preset active

- **WHEN** `/presets show-prompt` is invoked with no arguments and no preset is currently active
- **THEN** the user SHALL receive an `info`-severity notification with body `No preset is active.`

#### Scenario: `show-prompt` with active preset that has no prompt

- **WHEN** `/presets show-prompt` is invoked with no arguments
- **AND** a preset named `plan` is active with `instructions` empty (absent, `""`, or whitespace-only)
- **THEN** the user SHALL receive an `info`-severity notification with body `Active preset "plan" has no prompt.`

#### Scenario: `show-prompt` with active preset that has a prompt

- **WHEN** `/presets show-prompt` is invoked with no arguments
- **AND** a preset named `plan` is active with `instructions = "# Planning Mode\n..."`
- **THEN** the user SHALL receive a multi-line dialog rendering exactly the `instructions` value (as markdown when supported, otherwise as plain text)

#### Scenario: `show-prompt <name>` with unknown name

- **WHEN** `/presets show-prompt missing` is invoked
- **AND** no preset named `missing` exists in either scope
- **THEN** the user SHALL receive an `error`-severity notification with body `No preset named "missing".`

#### Scenario: `show-prompt <name>` with known name that has no prompt

- **WHEN** `/presets show-prompt plan` is invoked
- **AND** a preset named `plan` exists with `instructions` empty
- **THEN** the user SHALL receive an `info`-severity notification with body `Preset "plan" has no prompt.`

#### Scenario: `show-prompt <name>` renders even when the named preset is not active

- **WHEN** `/presets show-prompt llm-review` is invoked
- **AND** a preset named `llm-review` exists with a non-empty `instructions` value
- **AND** a different preset is currently active
- **THEN** the user SHALL receive a multi-line dialog rendering the `llm-review` preset's prompt
- **AND** the active preset SHALL remain unchanged

#### Scenario: `show-prompt <name>` resolves project shadowing user

- **WHEN** `/presets show-prompt plan` is invoked
- **AND** the user scope contains a preset named `plan` with `instructions = "global"`
- **AND** the project scope contains a preset named `plan` with `instructions = "project"`
- **THEN** the rendered prompt body SHALL be `project`

#### Scenario: `show-prompt` autocomplete offers loaded names

- **WHEN** the user types `/presets show-prompt ` (with trailing space) and requests autocomplete
- **THEN** the completion list SHALL contain the name of every preset returned by `loadAll`
- **AND** the completion entries' `value` fields SHALL equal the preset names verbatim

#### Scenario: `show-prompt` autocomplete filters by prefix

- **WHEN** the user types `/presets show-prompt p` and requests autocomplete
- **AND** loaded presets include `plan`, `peer-review`, `llm-review`, and `commit`
- **THEN** the completion list SHALL contain `plan` and `peer-review`
- **AND** the completion list SHALL NOT contain `llm-review` or `commit`
