# presets-package Specification

## Purpose

The `presets-package` capability defines the shape of the `pi-presets-plus` npm package itself: its repository layout, manifest (identity, peer deps, dev-dep toolchain, scripts), TypeScript / ESLint / Prettier configuration, license, changelog, README, ignore rules, and the extension entry point that registers the `/presets` command. Subsequent changes in the project plan extend this capability rather than introducing new packages; this specification therefore captures the constraints every later change must continue to satisfy on top of the package shell.

## Requirements

### Requirement: Repository-root package layout

The repository root SHALL contain the following files after this change: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `LICENSE`, `CHANGELOG.md`, `.gitignore`, `README.md`, `src/index.ts`, `src/types.ts`. There SHALL NOT be a nested `pi-presets-plus/` subdirectory; the repository root _is_ the package root.

#### Scenario: Required files present

- **WHEN** the repository is inspected after the change
- **THEN** every file listed above SHALL be present at the repository root (or, for `src/`, inside the `src/` directory)

#### Scenario: No nested package subdirectory

- **WHEN** the repository is inspected
- **THEN** there SHALL NOT be a directory named `pi-presets-plus/` inside the repository root

### Requirement: Package manifest identifies a pi extension package

The `package.json` at the repository root SHALL identify the package as a pi extension package with `name: "pi-presets-plus"`, `version: "0.1.0"`, `license: "MIT"`, `type: "module"`, and a non-empty author. It SHALL declare a `pi.extensions` array that lists the source entry point used by the package (i.e. `./src/index.ts`). It SHALL include `keywords` containing at minimum `pi-package` plus enough discoverability keywords to convey that the package targets pi and provides presets where each preset bundles a model, thinking level, tools, and system prompt (the `*-presets` shorthand — e.g. `model-presets`, `thinking-presets`, `tools-presets`, `system-prompt-presets` — is the natural keyword shape and is permitted; it does not imply four separate kinds of presets). It SHALL declare a `files` allowlist that limits `npm pack` output to runtime artifacts: `src`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `package.json` (no `tsconfig.json`, `eslint.config.mjs`, `node_modules`, or dev configs).

#### Scenario: Manifest declares package identity

- **WHEN** `package.json` is inspected
- **THEN** it SHALL declare `name: "pi-presets-plus"`, `version: "0.1.0"`, `license: "MIT"`, `type: "module"`, and a non-empty author

#### Scenario: Manifest declares the extension entry

- **WHEN** the package is loaded by pi
- **THEN** pi SHALL find the source entry file under `pi.extensions` and load it as the package's extension

#### Scenario: Package keyword present

- **WHEN** the package is inspected for the `pi-package` keyword
- **THEN** the keyword SHALL be present in `package.json`'s `keywords` array

#### Scenario: Files allowlist limits the published surface

- **WHEN** `package.json` is inspected
- **THEN** `files` SHALL contain `src`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `package.json`
- **AND** `files` SHALL NOT contain `tsconfig.json`, `eslint.config.mjs`, `node_modules`, or dev/test directories

### Requirement: Pi runtime modules are declared as peer dependencies

The `package.json` SHALL declare `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, and `@sinclair/typebox` as `peerDependencies` (per `docs/packages.md`) so that installing this package does not bundle pi's own runtime modules.

#### Scenario: Peer dependencies declared

- **WHEN** `package.json` is inspected
- **THEN** `peerDependencies` SHALL contain `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, and `@sinclair/typebox`

#### Scenario: Peer dependencies are not bundled

- **WHEN** the package is packed via `npm pack`
- **THEN** the resulting tarball SHALL NOT include any `node_modules` directory
- **AND** SHALL NOT include any files belonging to `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, or `@sinclair/typebox`

### Requirement: Dev-dependency toolchain is self-sufficient

The `package.json` SHALL declare `devDependencies` sufficient to run every script defined in `scripts` against the empty package without any `MODULE_NOT_FOUND` errors. Concretely, the `devDependencies` SHALL include the toolchain root packages (`@biomejs/biome`, `prettier` plus an import-sorting plugin such as `@ianvs/prettier-plugin-sort-imports`, `eslint`, `typescript`, `sort-package-json`) and SHALL also include every package that the lint/format configuration files import directly so that running the configured tooling against an empty `src/` succeeds.

#### Scenario: Toolchain root packages declared

- **WHEN** `package.json` is inspected
- **THEN** `devDependencies` SHALL include `@biomejs/biome`, `prettier`, an import-sorting Prettier plugin, `eslint`, `typescript`, and `sort-package-json`

#### Scenario: Lint/format config imports are resolvable

- **WHEN** `npm install` followed by `npm run lint` and `npm run format-check` is run on a clean checkout
- **THEN** neither command SHALL fail with `ERR_MODULE_NOT_FOUND` or `Cannot find package` for any package imported by `eslint.config.mjs` or by Prettier configuration

### Requirement: Package scripts expose lint, format, type-check, and helpers

The `package.json` `scripts` object SHALL define exactly the following script names (subsequent changes' tasks rely on them, including the hyphen in `type-check`):

- `format` — runs Prettier in write mode
- `format-check` — runs Prettier in check mode
- `lint` — runs Biome on `src/.` followed by ESLint on `src/.`
- `sort-package-json` — runs `sort-package-json` against `package.json`
- `type-check` — runs `tsc --noEmit`

The Prettier paths used by `format` / `format-check` SHALL include the package manifest, the `src/` directory, the TypeScript configuration, and the ESLint configuration file. Every literal path passed to Prettier SHALL exist on disk (Prettier 3.x errors on missing literal paths rather than silently skipping them).

#### Scenario: Script names match exactly

- **WHEN** `package.json` is inspected
- **THEN** `scripts` SHALL contain keys `format`, `format-check`, `lint`, `sort-package-json`, and `type-check`

#### Scenario: Type-check script available

- **WHEN** `npm run type-check` is run in the repository root
- **THEN** `tsc --noEmit` SHALL execute against the source using the explicitly-listed `typescript` devDependency
- **AND** SHALL exit with code 0 against the empty package

#### Scenario: Lint script available

- **WHEN** `npm run lint` is run in the repository root
- **THEN** Biome SHALL execute on `src/.` followed by ESLint on `src/.`
- **AND** both tools SHALL exit with code 0 against the empty package

#### Scenario: Format-check script available

- **WHEN** `npm run format-check` is run in the repository root
- **THEN** Prettier SHALL execute in check mode against the configured paths (including `package.json`, `src/.`, the TypeScript configuration, and the ESLint configuration file)
- **AND** every literal path passed to Prettier SHALL exist on disk
- **AND** Prettier SHALL exit with code 0 against the empty package

### Requirement: ESLint configuration is type-aware

The `eslint.config.mjs` at the repository root SHALL use ESLint flat-config and SHALL extend `typescript-eslint`'s **type-checked** recommended preset (not the non-type-aware `recommended` preset) so that type-aware rules — including `no-floating-promises` — are enforced. It SHALL declare `languageOptions.parserOptions.projectService: true` together with `tsconfigRootDir: import.meta.dirname` so type-aware rules can resolve the project's `tsconfig.json` automatically from any cwd. The configuration SHALL also extend `eslint:recommended` and SHALL disable the `no-control-regex` rule.

#### Scenario: ESLint config matches the type-aware shape

- **WHEN** `eslint.config.mjs` is inspected
- **THEN** it SHALL extend `typescript-eslint`'s type-checked recommended preset (not the non-type-aware variant)
- **AND** it SHALL declare `parserOptions.projectService: true`
- **AND** it SHALL declare `parserOptions.tsconfigRootDir: import.meta.dirname`
- **AND** it SHALL extend `eslint:recommended`
- **AND** it SHALL set `"no-control-regex": "off"`

#### Scenario: Lint catches floating promises

- **WHEN** subsequent code introduces an un-awaited Promise-returning call
- **THEN** `npm run lint` SHALL fail (because `no-floating-promises` is enabled by the type-checked preset)

#### Scenario: Lint succeeds on the empty package

- **WHEN** `npm run lint` is run on the empty package
- **THEN** ESLint SHALL execute and exit with code 0

### Requirement: TypeScript configuration enforces strict, jiti-friendly settings

The `tsconfig.json` at the repository root SHALL configure TypeScript with the following compiler options enabled (or set to the listed values), and SHALL scope compilation to `src`:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true`
- `isolatedModules: true`
- `esModuleInterop: true`
- `forceConsistentCasingInFileNames: true`
- `module: "Node16"` and `moduleResolution: "Node16"`
- `noEmit: true`
- `lib: ["ES2022"]` and `target: "ES2022"`
- `skipLibCheck: true`
- `include: ["src"]`

#### Scenario: tsconfig has the required options

- **WHEN** `tsconfig.json` is inspected
- **THEN** every compiler option listed above SHALL be set to the listed value
- **AND** `include` SHALL be `["src"]`

#### Scenario: Type-check succeeds on the empty package

- **WHEN** `tsc --noEmit` is run inside the repository root
- **THEN** the type-check SHALL succeed with no errors

### Requirement: LICENSE is the MIT license

The `LICENSE` file at the repository root SHALL contain the standard MIT license text with the copyright line `Copyright (c) 2026 Sherif Fanous`. The exact body wording is unconstrained as long as the license is recognizable as MIT.

#### Scenario: LICENSE is MIT with the correct copyright

- **WHEN** `LICENSE` is inspected
- **THEN** the file SHALL be a recognizable MIT license
- **AND** it SHALL include the line `Copyright (c) 2026 Sherif Fanous`

### Requirement: CHANGELOG.md initialized for Common Changelog

The `CHANGELOG.md` at the repository root SHALL be initialized for [Common Changelog](https://common-changelog.org/) with a top-level `# Changelog` heading and a one-line statement that the file follows Common Changelog (linking the spec). No `## Unreleased` section SHALL be present. Subsequent changes in the series SHALL NOT add per-version entries; the first version-tagged entry is added when `v0.1.0` is published in change 7.

#### Scenario: CHANGELOG has Common Changelog header and no entries

- **WHEN** `CHANGELOG.md` is inspected
- **THEN** the file SHALL begin with a `# Changelog` heading
- **AND** SHALL include a line indicating the file follows Common Changelog (linking the spec)
- **AND** SHALL NOT contain any `##` or deeper-level sections

### Requirement: README.md skeleton

The `README.md` at the repository root SHALL contain at minimum: the package name and a one-line description of its purpose. The description SHALL make clear that the package provides presets and that each preset bundles a model, thinking level, tools, and system prompt (i.e. one preset is a combo of all four configurable aspects — not four separate kinds of presets).

#### Scenario: README has the required content

- **WHEN** `README.md` is inspected
- **THEN** it SHALL include the package name and a one-line description that conveys the package provides presets bundling a model, thinking level, tools, and system prompt

### Requirement: .gitignore covers expected artifacts

The `.gitignore` at the repository root SHALL ignore at minimum `node_modules/` and `.DS_Store`. Additional ignore patterns (editor/workspace files, scratch patterns, etc.) MAY be present.

#### Scenario: gitignore patterns present

- **WHEN** `.gitignore` is inspected
- **THEN** it SHALL contain entries for `node_modules/` and `.DS_Store`

### Requirement: Extension entry point registers the /presets stub command

The package's extension entry point (`src/index.ts`) SHALL be a default-exported factory of pi's `ExtensionFactory` shape — i.e. `(pi: ExtensionAPI) => void | Promise<void>` — and the `ExtensionAPI` import SHALL be a type-only import (`import type ...`), as required by `verbatimModuleSyntax: true`. When invoked by pi, the factory SHALL register exactly one command named `presets` and SHALL NOT register any other commands, hotkeys, flags, message renderers, or event handlers in this change. The registered command's `description` string SHALL make clear that each preset bundles a model, thinking level, tools, and system prompt (i.e. one preset is a combo of all four configurable aspects, not four separate kinds of presets). The handler SHALL be lint-clean under the type-checked ESLint preset (no `async` keyword without an `await`); it MAY return `Promise<void>` explicitly.

#### Scenario: Entry point shape

- **WHEN** `src/index.ts` is inspected
- **THEN** it SHALL have a default export that is a function taking `pi: ExtensionAPI`
- **AND** the `ExtensionAPI` import SHALL be a type-only import
- **AND** no other registrations beyond a single `registerCommand("presets", ...)` SHALL be present

#### Scenario: Command registration

- **WHEN** pi loads the package
- **THEN** `/presets` SHALL appear in the command list
- **AND** the registered command's `description` SHALL convey that each preset bundles a model, thinking level, tools, and system prompt

#### Scenario: Invocation

- **WHEN** the user runs `/presets` (with or without arguments)
- **THEN** an info-level notification SHALL be displayed via `ctx.ui.notify` describing that the package is installed and that storage/activation/UI arrive in subsequent changes
- **AND** no other side effects SHALL occur (no model change, no file I/O, no UI opened, no further extension events)

### Requirement: Empty types module

The package SHALL include `src/types.ts` containing only an empty re-export (`export {};`) so that subsequent changes can add type definitions without restructuring imports.

#### Scenario: types.ts exists

- **WHEN** the package is built or type-checked
- **THEN** `src/types.ts` SHALL be present and SHALL parse without errors

### Requirement: Local install round-trip

The package SHALL install successfully via `pi install <absolute-path-to-repository-root>` against a working pi installation, and the `/presets` command SHALL register on the next pi startup.

#### Scenario: Install and invoke

- **WHEN** the user runs `pi install <repository-root>` and then starts a new pi session
- **THEN** the `/presets` command SHALL be available
- **AND** invoking it SHALL emit the informational notification described above

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
