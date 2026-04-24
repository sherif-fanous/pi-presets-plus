# preset-storage Specification

## Purpose

The `preset-storage` capability defines how `pi-presets-plus` persists preset definitions on disk: two coexisting versioned JSON files (global/user scope under `<agent-dir>/presets-plus/presets.json` and project scope under `<cwd>/.pi/presets-plus/presets.json`), validation that separates file-level errors (treat file as empty + warn) from per-preset errors (skip preset + warn), availability classification against pi's model registry, atomic writes that never leave the destination partially written, merge-with-shadowing semantics where project presets override same-named global presets, a reload-on-`session_start`-and-`ctx.reload` lifecycle with no surviving caches, and the initial `/presets list` / `/presets reload` / bare-invocation command surface. Subsequent changes in the project plan (activation, picker, editor, drift detection, shortcuts) consume this capability without re-specifying its contracts.

## Requirements

### Requirement: Versioned JSON storage with global and project scopes

The package SHALL persist presets in two coexisting JSON files: `<agent-dir>/presets-plus/presets.json` (global/user scope, where `<agent-dir>` is the path returned by `getAgentDir()`) and `<cwd>/.pi/presets-plus/presets.json` (project scope). Each file SHALL conform to the shape `{ "version": 1, "presets": Preset[] }`.

#### Scenario: Both files absent

- **WHEN** the package loads and neither file exists
- **THEN** the in-memory preset list SHALL be empty and no error SHALL be raised

#### Scenario: Only global file present

- **WHEN** only the global file exists
- **THEN** all valid presets in the global file SHALL be loaded and tagged with `scope: "user"`

#### Scenario: Only project file present

- **WHEN** only the project file exists
- **THEN** all valid presets in the project file SHALL be loaded and tagged with `scope: "project"`

#### Scenario: Both files present, no name collisions

- **WHEN** both files contain presets with disjoint names
- **THEN** all presets from both files SHALL be loaded with their respective scopes

#### Scenario: Unsupported version

- **WHEN** a file declares a `version` other than `1`
- **THEN** the file SHALL be treated as empty, a warning SHALL be emitted via `ctx.ui.notify`, and the file SHALL NOT be deleted or rewritten

#### Scenario: Malformed JSON

- **WHEN** a file contains invalid JSON
- **THEN** the file SHALL be treated as empty, a warning SHALL be emitted, and the file SHALL NOT be modified

### Requirement: Project presets shadow global presets by name

When a project preset and a global preset share the same `name`, the project preset SHALL take precedence at activation time, and the global preset SHALL remain visible in listings tagged as `shadowed: true`.

#### Scenario: Same name in both scopes

- **WHEN** the global file contains a preset named `plan` and the project file contains a preset also named `plan`
- **THEN** the project version SHALL be the one consulted by activation in later changes
- **AND** listings (e.g. `/presets list`) SHALL include the global `plan` with a `shadowed: true` indicator

### Requirement: Preset shape validation at load time

Each preset SHALL contain at minimum a non-empty string `name`, a string `provider`, and a string `model`. It MAY additionally contain `thinkingLevel` (one of `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"`), `tools` (string array), `instructions` (string), `hotkey` (string), and `order` (number). Invalid presets SHALL be skipped with a warning; the rest of the file SHALL still load.

#### Scenario: Minimal valid preset

- **WHEN** a preset declares only `name`, `provider`, and `model`
- **THEN** the preset SHALL load successfully

#### Scenario: Missing required field

- **WHEN** a preset omits `name`, `provider`, or `model`
- **THEN** the preset SHALL be skipped during load and a warning SHALL be emitted naming the offending entry
- **AND** other valid presets in the same file SHALL still load

#### Scenario: Duplicate names within one file

- **WHEN** a single file contains two presets with the same `name`
- **THEN** the first occurrence SHALL be kept and subsequent duplicates SHALL be skipped with a warning

#### Scenario: Invalid thinking level

- **WHEN** a preset declares a `thinkingLevel` not in the allowed set
- **THEN** the preset SHALL be skipped with a warning

### Requirement: Availability computed at load time

For each loaded preset the package SHALL determine whether the referenced model exists in `ctx.modelRegistry` and whether the corresponding provider has a configured API key. The result SHALL be stored on the in-memory preset as `unavailable: "no-model" | "no-key" | undefined`.

#### Scenario: Model not in registry

- **WHEN** a preset's `provider/model` does not resolve via `ctx.modelRegistry.find`
- **THEN** the preset SHALL be marked `unavailable: "no-model"`
- **AND** the preset SHALL still appear in listings (not deleted)

#### Scenario: Provider has no API key

- **WHEN** the model resolves but the provider has no API key configured
- **THEN** the preset SHALL be marked `unavailable: "no-key"`

#### Scenario: Available preset

- **WHEN** the model resolves and an API key is present
- **THEN** the preset SHALL have no `unavailable` field set

### Requirement: Atomic write on save

When the package writes a preset file (creating or modifying), it SHALL write to a uniquely-named temporary file in the same directory, fsync, then rename atomically over the destination, so that the destination file is never observed in a partially written state. The package SHALL create parent directories as needed.

#### Scenario: Save creates parent directories

- **WHEN** the package saves to a scope whose parent directory does not yet exist
- **THEN** the parent directory SHALL be created with `recursive: true` before the write

#### Scenario: Save succeeds

- **WHEN** the package saves a modified preset list
- **THEN** the destination file SHALL contain the complete new content and no `.tmp` artifact SHALL remain on success

#### Scenario: Save interrupted

- **WHEN** the process is killed mid-save
- **THEN** the destination file SHALL retain its previous contents intact (the partially-written tmp file MAY remain on disk)

### Requirement: Storage CRUD primitives

The package SHALL expose programmatic operations on the storage layer: load all presets across both scopes, save an entire scope, add a preset to a scope, update an existing preset within a scope (allowing rename), remove a preset from a scope, and reorder presets within a scope. Each mutating operation SHALL persist immediately via atomic write to the affected scope file only.

#### Scenario: Add to project scope

- **WHEN** `addPreset(p, "project", ctx)` is called with a valid preset
- **THEN** the preset SHALL be appended to the project file's `presets` array and the file SHALL be written atomically
- **AND** the global file SHALL not be touched

#### Scenario: Rename via update

- **WHEN** `updatePreset("old", "user", { name: "new", ... }, ctx)` is called
- **THEN** the preset entry SHALL retain its position in the file and only its `name` (and any other changed fields) SHALL change

#### Scenario: Reorder within scope

- **WHEN** `reorderWithinScope("user", ["b", "a", "c"], ctx)` is called and the user file currently has `[a, b, c]`
- **THEN** the user file SHALL be rewritten with the presets in the requested order

#### Scenario: Remove

- **WHEN** `removePreset("plan", "project", ctx)` is called
- **THEN** the preset SHALL be removed from the project file and the file SHALL be written atomically

### Requirement: Reload on session_start and on /reload

The in-memory preset list SHALL be rebuilt from disk during the `session_start` event and during `ctx.reload()`. No long-lived caches SHALL persist preset state across these events.

#### Scenario: External edit then reload

- **WHEN** the user edits the JSON file directly and runs `/reload`
- **THEN** the new contents SHALL be reflected on the next call to `loadAll`

### Requirement: /presets list subcommand

The `/presets` command SHALL accept a `list` subcommand that prints a textual summary of every loaded preset (across both scopes), one preset per block, including: name, scope, `provider/model`, thinking level, tool count or "inherit", hotkey if set, an availability indicator if `unavailable`, and a shadowed indicator if `shadowed`.

#### Scenario: List with no presets

- **WHEN** the user runs `/presets list` and no presets are loaded
- **THEN** an info message SHALL state that no presets are configured and SHALL note the file paths the user could create

#### Scenario: List with presets

- **WHEN** the user runs `/presets list` with at least one loaded preset
- **THEN** each loaded preset SHALL appear in the output with the fields listed above

### Requirement: /presets reload subcommand

The `/presets` command SHALL accept a `reload` subcommand that re-reads both scope files from disk and reports the resulting count of loaded presets and any warnings.

#### Scenario: Reload after external edit

- **WHEN** the user edits the JSON file directly and runs `/presets reload`
- **THEN** the new contents SHALL be loaded and a notification SHALL state how many presets are now loaded

### Requirement: /presets bare invocation explains the absence of UI

When `/presets` is invoked with no arguments, the package SHALL emit an informational notification stating that no UI is available yet and pointing the user at `/presets list` and `/presets reload`.

#### Scenario: Bare invocation

- **WHEN** the user runs `/presets` with no arguments
- **THEN** an info notification SHALL be displayed describing the available subcommands and noting that the picker UI arrives in a later change
