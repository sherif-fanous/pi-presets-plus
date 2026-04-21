## Context

This change creates the package shell for `pi-presets-plus`. The repository directory already exists at `~/src/sherif-fanous/pi-presets-plus`; this change populates it. The full breakdown across seven changes is documented in `openspec/breakdown.md`. The intent here is to get the package mechanics working in isolation: `pi install` succeeds, the `/presets` command registers, peer dependencies are correctly declared, lint/type-check tooling is wired up. No preset behavior exists yet.

The package follows the directory style described in `docs/extensions.md` (a directory containing `package.json`, `src/`, and a default-export factory function) and the package conventions in `docs/packages.md`. It will be loaded by pi via the package's `pi.extensions` manifest entry, which jiti compiles on the fly.

This change captures the _shape_ of each scaffold file, not its byte-for-byte contents. Concrete file contents (exact JSON formatting, license body, dev-dependency version pins, etc.) are an implementation detail and may be adjusted to keep the toolchain green; the requirements in `specs/presets-package/spec.md` describe the constraints those files must satisfy.

## Goals / Non-Goals

**Goals**

- Produce a repository state that installs cleanly with `pi install <path-to-this-repo>` (and later `pi install npm:pi-presets-plus`).
- Register `/presets` so subsequent changes can fill it in without churn.
- Declare peer dependencies correctly so installing the package does not bundle pi's own modules.
- Provide a TypeScript configuration suitable for editor support and type-check; pi's runtime uses jiti, so no explicit build step is required.
- Provide a lint/format toolchain (Biome + ESLint + Prettier with an import-sorting plugin) suitable for the codebase's style baseline.
- Leave a small, clearly-named entry point (`src/index.ts`) and type module (`src/types.ts`) for later changes to extend.

**Non-Goals**

- Any preset storage, activation, or UI logic. Those are introduced in changes 2–7.
- Publishing to npm. The package stays unpublished until all seven changes land.
- CI configuration. Can be added later; not required for the package to work.
- A populated README. A short skeleton README is enough; the full README is filled in as features land (final pass in change 7).
- Locking byte-exact contents of any scaffold file. The spec constrains what the files must do, not the precise text used to do it.

## Decisions

### Repository layout (root of `pi-presets-plus/`)

```text
.
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── LICENSE
├── CHANGELOG.md
├── .gitignore
├── README.md             # short skeleton; full README arrives in change 7
├── openspec/             # already present
└── src/
    ├── index.ts          # default-export ExtensionAPI factory
    └── types.ts          # placeholder; later changes add Preset, etc.
```

The repository directory is the package directory — there is no nested `pi-presets-plus/` subfolder. `openspec/` already exists and is unaffected.

### `package.json`

The manifest identifies the package as a pi extension package and wires up the toolchain:

- `name: "pi-presets-plus"`, `version: "0.1.0"`, `license: "MIT"`, `type: "module"` (pi loads ESM).
- `keywords` SHALL include `pi-package` (for pi-side discoverability) plus enough package-flavor keywords to make the project findable on npm. The keyword list SHOULD reference `pi`, `pi-coding-agent`, `presets`, and the four configurable aspects each preset bundles (model, thinking level, tools, system prompt). The `*-presets` shorthand (e.g. `model-presets`, `thinking-presets`, `tools-presets`, `system-prompt-presets`) is the natural shape for these npm-search keywords; it does not imply that the package exposes four separate kinds of presets — a preset bundles all four aspects.
- `pi.extensions` SHALL list the source entry point (`./src/index.ts`).
- `peerDependencies` SHALL declare pi's runtime modules (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox`) with permissive ranges so they are not bundled, per `docs/packages.md`.
- `devDependencies` SHALL include the toolchain packages plus every package that the lint/format configs import directly. Concretely this means at minimum `@biomejs/biome`, `prettier` + the import-sorting plugin, `typescript` (so the `type-check` script doesn't depend on a transitive copy), `eslint` plus the packages the flat config actually imports (e.g. `@eslint/js`, `typescript-eslint`, `@typescript-eslint/parser` if referenced), and `sort-package-json`. Specific version pins are an implementation detail.
- `files` SHALL be a curated allowlist for `npm pack` containing `src`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `package.json` — i.e. it SHALL exclude `tsconfig.json`, `eslint.config.mjs`, `node_modules`, dev configs, and tests.
- `scripts` SHALL expose exactly these script names (subsequent changes' tasks rely on them, including the hyphen in `type-check`):

  | Script              | Behavior                                                       |
  | :------------------ | :------------------------------------------------------------- |
  | `format`            | Prettier in write mode over the configured paths               |
  | `format-check`      | Prettier in check mode over the same paths; exit 0 means clean |
  | `lint`              | Biome on `src/.` then ESLint on `src/.`; both must exit 0      |
  | `sort-package-json` | One-shot `sort-package-json` (e.g. via `npx`)                  |
  | `type-check`        | `tsc --noEmit`                                                 |

  The Prettier paths SHALL include `package.json`, `src/`, `tsconfig.json`, and `eslint.config.mjs`. They SHALL match real files on disk; Prettier 3.x errors on missing literal paths rather than silently skipping them.

Notes:

- The `lint` script runs Biome first, then ESLint. The two tools deliberately overlap on some style rules; in practice they catch slightly different bugs. ESLint is configured with type-aware rules (see the `eslint.config.mjs` section), which catches a class of bugs Biome cannot reach (e.g. floating promises). If conflicts arise in future changes, the recommended resolution is to defer to ESLint for type-aware rules and Biome for the rest.
- `version` is `0.1.0` from day one; no npm publish occurs in this change, but the on-disk version reflects the target release.

### `tsconfig.json`

Strict TypeScript configured for jiti-loaded ESM source. Required compiler options:

| Option                             | Value      | Why                                                                                   |
| :--------------------------------- | :--------- | :------------------------------------------------------------------------------------ |
| `strict`                           | `true`     | Maximum type safety baseline.                                                         |
| `noUncheckedIndexedAccess`         | `true`     | Index access returns `T \| undefined`; forces explicit handling of preset lists.      |
| `noFallthroughCasesInSwitch`       | `true`     | Catches missing `break` / `return` in switch statements.                              |
| `verbatimModuleSyntax`             | `true`     | All type-only imports must be `import type ...`. Enforced in subsequent changes.      |
| `isolatedModules`                  | `true`     | Disallows constructs that can't be transpiled file-by-file. Aligned with jiti.        |
| `esModuleInterop`                  | `true`     | Standard CJS/ESM interop.                                                             |
| `forceConsistentCasingInFileNames` | `true`     | Cross-platform safety.                                                                |
| `module` / `moduleResolution`      | `"Node16"` | Requires explicit `.js` suffixes on relative imports. Enforced in subsequent changes. |
| `noEmit`                           | `true`     | Pi's jiti runtime compiles on demand; no `dist/`.                                     |
| `lib` / `target`                   | `ES2022`   | Modern enough for the language features we'll use.                                    |
| `skipLibCheck`                     | `true`     | Don't type-check `node_modules` declaration files.                                    |
| `include`                          | `["src"]`  | Restrict to the package source.                                                       |

### `eslint.config.mjs`

ESLint flat-config (ESLint 9+). The configuration SHALL layer:

1. `eslint:recommended` (the official baseline).
2. `typescript-eslint`'s **type-checked** recommended preset (`recommendedTypeChecked`), not the lighter non-type-aware `recommended`.
3. A `languageOptions.parserOptions` block declaring `projectService: true` and `tsconfigRootDir: import.meta.dirname` so type-aware rules can resolve the project's `tsconfig.json` without an explicit `project` array, from any cwd.
4. A `rules` block disabling `no-control-regex` (TUI work in later changes uses ANSI escape sequences).

Why type-aware lint rather than the lighter `tseslint.configs.recommended`: this package will accumulate many `await pi.something(...)` and `await ctx.ui.custom(...)` call sites across subsequent changes. The most dangerous bug class for that style of code is forgetting `await` on a Promise-returning call; `tsc --noEmit` does not flag it, but `no-floating-promises` (a type-aware rule enabled by `recommendedTypeChecked`) does. The cost is a small slowdown on `npm run lint` (one extra TypeScript program load per run) for a meaningful safety win.

Whatever modules the config imports (`@eslint/js`, `typescript-eslint`, `eslint/config`, etc.) MUST be present as direct devDependencies in `package.json`; otherwise ESLint 10's flat-config loader fails with `ERR_MODULE_NOT_FOUND`.

### `LICENSE`

Standard MIT license text, copyright `2026 Sherif Fanous`. Any well-formed MIT body satisfies this — there is no project-specific wording.

### `CHANGELOG.md`

Initialized for [Common Changelog](https://common-changelog.org/) with the project name and a single line pointing at the format. No "Unreleased" section (Common Changelog discourages it). No per-version entries are added in this change or in changes 2–6; the first version-tagged entry lands when `v0.1.0` is published in change 7.

### `.gitignore`

Minimal ignore set: at minimum `node_modules/` and `.DS_Store`. Additional entries (editor/workspace files, scratch patterns, etc.) MAY be added without spec impact.

### `README.md` skeleton

Short paragraph that names the package and gives a one-line description that makes clear the package provides presets, where each preset bundles a model, thinking level, tools, and system prompt — for example: *"A [Pi](https://github.com/badlogic/pi) coding agent extension for presets that bundle a model, thinking level, tools, and system prompt, with a TUI on top."*. The full README arrives in change 7.

### `src/index.ts` skeleton

Default-export factory of type `ExtensionFactory` (i.e. `(pi: ExtensionAPI) => void | Promise<void>`). The body SHALL register exactly one command named `presets` whose handler shows an informational notification via `ctx.ui.notify(...)` and returns. No other registrations.

The registered command's `description` string SHALL describe a preset as a bundle of all four configurable aspects (model, thinking level, tools, system prompt), so users do not mistakenly read it as four separate kinds of presets. The current implementation uses: *"Manage and switch presets that bundle a model, thinking level, tools, and system prompt (scaffold; full features coming)."*.

Two constraints from the surrounding tooling:

- Under `verbatimModuleSyntax`, the `ExtensionAPI` import MUST be `import type` because it's only used in a type position.
- ESLint's `@typescript-eslint/require-await` (enabled by `recommendedTypeChecked`) flags `async` functions with no `await`. The handler therefore MUST be expressed as a non-`async` function that returns `Promise<void>` explicitly (e.g. `return Promise.resolve()`), unless it has real `await` work to do — which it doesn't in this change.

The factory is deliberately tiny. The reason this change exists separately is to verify that pi picks up the manifest, that peer-dep resolution works, that the command registers, and that the notification surfaces in the TUI. Anything more would muddle the verification surface.

### `src/types.ts`

Empty re-export (`export {};`). Keeps the file importable without producing anything; later changes add `Preset`, `PresetsFile`, `ActivePresetState`, `PriorSnapshot`, `ThinkingLevel`, etc. without restructuring imports.
