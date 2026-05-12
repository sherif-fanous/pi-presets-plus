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

The `package.json` SHALL declare `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, and `@sinclair/typebox` as `peerDependencies` (per `docs/packages.md`) so that installing this package does not bundle pi's own runtime modules.

#### Scenario: Peer dependencies declared

- **WHEN** `package.json` is inspected
- **THEN** `peerDependencies` SHALL contain `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, and `@sinclair/typebox`

#### Scenario: Peer dependencies are not bundled

- **WHEN** the package is packed via `npm pack`
- **THEN** the resulting tarball SHALL NOT include any `node_modules` directory
- **AND** SHALL NOT include any files belonging to `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, or `@sinclair/typebox`

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

### Requirement: Active preset attachment is owned by a single class

The package SHALL own the active-preset attachment in exactly one
module: `src/activation/session.ts`, exporting a class
`ActivePresetSession`. The `presetsPlus(pi)` default export SHALL
construct one instance per invocation and thread it through every
lifecycle handler and command runner that needs to read or mutate
the attachment.

The class SHALL own:

1. The in-memory active-preset cell (the value previously held in
   the deleted `src/activation/active-state.ts`).
2. The self-triggered-`pi.setModel` re-entry counter (the value
   previously held at the top of `src/activation/apply.ts`),
   exposed as `withSelfTriggeredModelSet(fn)` and
   `isSelfTriggered()`.
3. The persistent session-entry writes for the
   `presets-plus:active` channel (`pi.appendEntry(
"presets-plus:active", { name, scope } | { name: null })`).
   The shape of the persisted payload SHALL remain
   `{ name: string; scope: PresetScope } | { name: null }` — the
   class encapsulates the channel name and the null-clear marker
   so no other module references either.
4. The status-badge refresh: the class is the single writer of
   `ctx.ui.setStatus("presets-plus", …)` in the codebase.
5. The dirty / clean transitions previously in
   `src/activation/dirty.ts`.
6. Session-restore reconstruction from a session branch: a method
   `restoreFromBranch(branch, presets)` SHALL return
   `{ state: ActivePresetState | undefined; warnings: string[] }`
   so the UI boundary in `src/index.ts` can roll the warnings
   into a single `surfaceWarnings(ctx, warnings)` call.

The session class SHALL NOT contain the apply or clear decision
logic; those stay in `src/activation/apply.ts` and
`src/activation/clear.ts` respectively, and they SHALL invoke
`session.start({ preset, baseline, lastApplied, owned })` and
`session.clear(ctx, pi)` rather than calling `pi.appendEntry`,
`ctx.ui.setStatus`, or mutating the cell directly.

The deleted modules `src/activation/active-state.ts` and
`src/activation/dirty.ts` SHALL NOT exist after this change.

#### Scenario: Session class is the only writer of the active-preset cell

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/activation/session.ts` SHALL hold
  module-scoped mutable state representing the active preset
- **AND** no file outside `src/activation/session.ts` SHALL call
  `pi.appendEntry("presets-plus:active", …)`
- **AND** no file outside `src/activation/session.ts` SHALL call
  `ctx.ui.setStatus("presets-plus", …)`

#### Scenario: Apply and clear go through the session class

- **WHEN** `apply(preset, ctx, pi, session)` succeeds
- **THEN** it SHALL call `session.start(...)` exactly once
- **AND** it SHALL NOT call `pi.appendEntry` directly
- **AND** it SHALL NOT call `ctx.ui.setStatus` directly

- **WHEN** `clear(ctx, pi, session)` clears an active preset
- **THEN** it SHALL call `session.clear(ctx, pi)` exactly once
- **AND** it SHALL NOT call `pi.appendEntry` directly
- **AND** it SHALL NOT call `ctx.ui.setStatus` directly

#### Scenario: Self-triggered model set guard lives on the session

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/activation/session.ts` SHALL define
  module-scoped state for the self-triggered-`pi.setModel` counter
- **AND** `src/activation/drift-handlers.ts` SHALL consult
  `session.isSelfTriggered()` rather than a free function

#### Scenario: Restore returns warnings instead of notifying

- **WHEN** `session.restoreFromBranch(branch, presets)` finds the
  referenced preset is not loaded, or is unavailable
- **THEN** it SHALL return `{ state: undefined, warnings: [...] }`
  with composed warning strings
- **AND** it SHALL NOT call `ctx.ui.notify` directly
- **AND** the caller in `src/index.ts` SHALL forward the warnings
  through the existing `surfaceWarnings` helper

### Requirement: Status-badge renderer is a pure exported formatter with no lookup callback

`src/ui/status.ts` SHALL export only:

1. The `STATUS_KEY` constant `"presets-plus"`.
2. A pure function `renderStatusBadge(active, theme): string` that
   takes only the `ActivePresetState | undefined` value (and a
   `Theme | undefined` for color application) and returns the
   rendered badge string.

The previously-exported `updateStatus(ctx, active, lookup)` runner
SHALL be removed. The lookup-callback parameter
`(name: string, scope: PresetScope) => LoadedPreset | undefined`
SHALL NOT appear in the renderer's signature. Modules that
previously satisfied it by fabricating a synthetic `LoadedPreset`
from a drift snapshot SHALL no longer do so.

#### Scenario: Renderer signature has no lookup callback

- **WHEN** `src/ui/status.ts` is inspected after the change
- **THEN** the public API SHALL consist of `STATUS_KEY` and
  `renderStatusBadge`
- **AND** no exported function SHALL accept a
  `(name, scope) => LoadedPreset | undefined` parameter

#### Scenario: Synthetic LoadedPreset workaround is gone

- **WHEN** the source tree is searched for the
  `dirty.ts`-style `LoadedPreset` synthesis used to satisfy the
  old lookup callback
- **THEN** no occurrence SHALL remain
- **AND** badge updates emitted from dirty / clean transitions
  SHALL render directly from `ActivePresetState`

### Requirement: Runtime hotkey bindings are owned by a single class

The package SHALL own the runtime hotkey bindings in exactly one
module: `src/hotkey-registry.ts`, exporting a class
`HotkeyRegistry`. The `presetsPlus(pi)` default export SHALL
construct one instance per invocation.

The class SHALL replace and consolidate the deleted modules
`src/hotkey-conflicts.ts`, `src/hotkeys.ts`, and
`src/hotkey-reload-baseline.ts`. Its public surface SHALL be:

1. `analyze(presets: LoadedPreset[]): HotkeyAnalysis` — parses,
   marks `LoadedPreset.hotkeyConflict` and
   `LoadedPreset.hotkeyShadowsBuiltin` as a side effect for
   downstream UI read sites, and returns the analysis. Called by
   `loadAll` on every storage read.
2. `bindForSession(presets, analysis, ctx, pi, loadCurrent): void`
   — registers `pi` shortcuts, emits session-start
   conflict/shadow/invalid notifications, and captures the
   runtime baseline internally. Called once at `session_start`.
3. `saveNeedsReload(initial, saved): boolean` — query for the
   editor's post-Save reload prompt.
4. `deleteNeedsReload(identity): boolean` — query for the
   picker's post-Delete reload prompt.
5. `recordReloadPromptDeclined(identity, hotkey?): void` —
   remembers a declined prompt so the same pending state is not
   re-prompted.

The class SHALL NOT expose a public method for setting the
runtime baseline; "what was just bound" is captured as part of
`bindForSession` and is not externally writable.

The class SHALL NOT carry module-scoped mutable state; every
mutable cell (the runtime baseline map, the
acknowledged-pending-prompts map) SHALL live as instance state.
The previously-exposed test-only
`clearRuntimeHotkeyBaseline()` reset hatch SHALL NOT exist after
this change — tests construct a fresh `HotkeyRegistry` instance
per case.

The deleted modules `src/hotkey-conflicts.ts`,
`src/hotkey-reload-baseline.ts`, and `src/hotkeys.ts` SHALL NOT
exist after this change.

#### Scenario: Registry is the only writer of runtime-binding state

- **WHEN** the source tree is inspected after the change
- **THEN** no file outside `src/hotkey-registry.ts` SHALL hold
  module-scoped mutable state for runtime hotkey bindings or
  acknowledged-pending prompts

#### Scenario: Loader uses the registry's analyze

- **WHEN** `loadAll(ctx)` runs
- **THEN** it SHALL invoke `hotkeys.analyze(presets)` exactly once
- **AND** the returned `HotkeyAnalysis` SHALL be threaded to
  callers exactly as today's `annotateAndAnalyzeHotkeys` was

#### Scenario: bindForSession captures the baseline internally

- **WHEN** `bindForSession(presets, analysis, ctx, pi, loadCurrent)`
  completes
- **THEN** the registry's runtime baseline SHALL reflect the
  hotkeys that were just registered
- **AND** there SHALL NOT be a separate public method to set the
  baseline

#### Scenario: Tests use per-case instances, not module reset

- **WHEN** a test exercises hotkey-registration or reload-prompt
  logic
- **THEN** it SHALL construct a fresh `HotkeyRegistry` instance
- **AND** it SHALL NOT call any module-scoped reset function

### Requirement: PresetIdentity is a shared domain primitive

The package SHALL own the `PresetIdentity` type and its
identity-equality / lookup helpers in `src/preset-identity.ts`,
exporting:

1. `interface PresetIdentity { readonly name: string; readonly scope: PresetScope }`.
2. `findPreset<T extends PresetIdentity>(presets, identity): T | undefined`.
3. `samePresetIdentity(a, b): boolean`.

The previously-defined `PresetIdentity` interface in
`src/hotkey-conflicts.ts` SHALL be deleted; the new
`hotkey-registry.ts` SHALL import the type from
`src/preset-identity.ts` and MAY re-export it for downstream
consumers that already import hotkey-related types from one place.

Every existing call site that performs the identity-equality
lookup `presets.find((p) => p.name === X && p.scope === Y)` over
a `LoadedPreset[]` or `Preset[]` SHALL be replaced with
`findPreset(presets, identity)`.

#### Scenario: Identity lookup is centralized

- **WHEN** the source tree is searched for the literal pattern
  `\.name === [A-Za-z_.]+\.name` paired with
  `\.scope === [A-Za-z_.]+\.scope` inside an `Array.find`
  callback
- **THEN** no occurrences SHALL remain in `src/`
- **AND** every former occurrence SHALL have been replaced with
  `findPreset(presets, identity)`

#### Scenario: PresetIdentity is no longer hotkey-shaped

- **WHEN** `src/preset-identity.ts` is inspected after the change
- **THEN** it SHALL export `PresetIdentity`, `findPreset`, and
  `samePresetIdentity`
- **AND** `src/hotkey-conflicts.ts` SHALL NOT exist

### Requirement: Clear-summary renderer is split from the clear engine

The package SHALL split the pure clear-summary rendering surface
out of `src/activation/clear.ts` into a new module
`src/ui/clear-summary.ts`. The pure rendering surface previously
living in `src/activation/clear.ts` SHALL move to that new module, exporting at minimum
`renderClearSummary`, `chooseClearLead`, and any helpers required
to render a `ClearPart[]` (`formatRowValue`, `formatModel`,
`formatTools`, `isKeptLike`, `isRestoreLike`, the `Styler` type,
`IDENTITY_STYLER`, `normalizeStyler`, and the `FIELD_LABELS`
table).

The engine module `src/activation/clear.ts` SHALL retain
`decideClear`, `executeClear`, `clear`, `clearReturning`, and the
`ClearDecision` / `ClearPart` / `ClearWrites` / `ClearSnapshot` /
`ClearAction` / `ClearField` types. After this change
`src/activation/clear.ts` SHALL NOT import any rendering helper
from `src/ui/clear-summary.ts` except inside the `clear` runner
that produces the user-visible notification.

The renderer module SHALL be importable by both the `clear`
runner and `src/ui/picker.ts` (which renders the same
`ClearPart[]` inline after `clearReturning` returns).

#### Scenario: Renderer module exists with the documented exports

- **WHEN** `src/ui/clear-summary.ts` is inspected after the change
- **THEN** it SHALL export `renderClearSummary` and
  `chooseClearLead` at minimum
- **AND** the engine file `src/activation/clear.ts` SHALL NOT
  define `renderClearSummary` or `chooseClearLead`

#### Scenario: Engine and renderer are separately testable

- **WHEN** the test files for clear are inspected after the change
- **THEN** decision logic tests (e.g.
  `tests/activation/clear-decide.test.ts`) SHALL import from
  `src/activation/clear.ts` only
- **AND** the new `tests/ui/clear-summary.test.ts` SHALL import
  from `src/ui/clear-summary.ts` only

### Requirement: Apply, clear, drift, and flag take session as an explicit parameter

Functions that mutate or read the active-preset attachment SHALL
declare `session: ActivePresetSession` as an explicit parameter
rather than reaching for a module-scoped accessor. Concretely:

- `apply(preset, ctx, pi, session)` in `src/activation/apply.ts`.
- `clear(ctx, pi, session)` and `clearReturning(ctx, pi, session)`
  in `src/activation/clear.ts`.
- `handleModelSelectDrift(event, ctx, pi, session)` and
  `syncDirtyFromCurrentState(ctx, pi, session)` in
  `src/activation/drift-handlers.ts`.
- `applyPresetFlag(pi, ctx, presets, session)` in `src/flag.ts`.
- The hotkey activation handler invoked by
  `HotkeyRegistry.bindForSession` SHALL receive the session through
  the registry's binding closure.

The single construction site for the session SHALL be the
`presetsPlus(pi)` default export in `src/index.ts`, which threads
the same instance to every consumer for the lifetime of the
extension.

#### Scenario: Functions declare their session dependency

- **WHEN** the signatures of `apply`, `clear`, `clearReturning`,
  `handleModelSelectDrift`, `syncDirtyFromCurrentState`, and
  `applyPresetFlag` are inspected after the change
- **THEN** each SHALL accept an `ActivePresetSession` parameter
- **AND** none SHALL import a free `getActive()` /
  `setActive()` / `clearActive()` from a module-scoped cell

#### Scenario: Session has one construction site

- **WHEN** the source tree is searched for `new ActivePresetSession(`
- **THEN** there SHALL be exactly one occurrence in `src/`,
  inside the `presetsPlus(pi)` default export of
  `src/index.ts`

### Requirement: No user-visible behavior change

This refactor SHALL preserve every user-visible behavior of the
extension. Concretely:

1. Every existing test golden in `tests/` for `/presets *` output,
   notifications, status-badge text, clear-summary text, and
   editor / picker rendering SHALL continue to match without
   string edits.
2. The on-disk preset file format (
   `{ version: 1, presets: Preset[] }`) and field set SHALL be
   unchanged.
3. The persistent session-entry shape on the
   `presets-plus:active` channel (
   `{ name: string; scope: PresetScope } | { name: null }`)
   SHALL be unchanged.
4. The pi extension API surface registered by the package
   (`/presets` command, `--preset` flag, message renderer for
   `ACTIVATED_MESSAGE_TYPE`, lifecycle handlers) SHALL be
   unchanged.
5. CLI flags, command names, command argument completions, and
   subcommand routing SHALL be unchanged.

#### Scenario: Existing tests pass without golden edits

- **WHEN** `mise run check` is run after the change
- **THEN** all tests SHALL pass
- **AND** no golden assertion in
  `tests/user-facing-strings.test.ts`,
  `tests/activation/apply-clear.test.ts`,
  `tests/commands/presets/status.test.ts`,
  `tests/commands/presets/router.test.ts`, or any picker / editor
  test SHALL require a string update as part of this change

#### Scenario: On-disk and session-entry shapes are unchanged

- **WHEN** a preset is applied or cleared after the change
- **THEN** the JSON written to either scope file SHALL match the
  pre-change format byte-for-byte for the same input
- **AND** the entry written to the `presets-plus:active` channel
  SHALL carry the same payload shape

### Requirement: `/presets show-prompt` subcommand

The `/presets` command SHALL accept a `show-prompt` subcommand that emits the active preset's prompt — or any named preset's prompt — to the user.

The subcommand SHALL be registered in the same subcommand registry that contains `reload`, `clear`, and `status`, alongside an autocomplete label of the form `show-prompt: show the active preset's prompt (or [name])`. Argument-position autocomplete SHALL offer known preset names from `loadAll()` when the cursor is past the `show-prompt` token; an empty prefix SHALL offer every loaded preset, and a non-empty prefix SHALL filter to names that start with the prefix (case-sensitive, matching the existing autocomplete style elsewhere in the router).

The runtime behavior of the subcommand SHALL follow the matrix below. Lookup by name SHALL use the same scope-precedence rules as `findPreset` (project shadows user). Short status outcomes SHALL be surfaced through `ctx.ui.notify`; prompt-body outcomes SHALL be surfaced through the package's multi-line `openInfoDialog` reader surface.

- `/presets show-prompt` with no preset active SHALL emit an `info`-severity message of exactly `No preset is active.`.
- `/presets show-prompt` with an active preset whose `instructions` field is empty (absent, `""`, or whitespace-only) SHALL emit an `info`-severity message of exactly `Active preset "<name>" has no prompt.`, where `<name>` is the active preset's name.
- `/presets show-prompt` with an active preset whose `instructions` field is non-empty SHALL render that prompt body in a dismissible multi-line dialog. The body SHALL be the literal `instructions` value (no trimming, no transformation). When the surrounding pi build exposes a markdown-render hook compatible with that dialog surface and `@earendil-works/pi-tui` exposes a `Markdown` component, the body SHALL be rendered as markdown; otherwise the body SHALL be rendered as plain text.
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
