## Why

`pi-presets-plus` will be built incrementally across seven OpenSpec changes (see `openspec/breakdown.md`). The first change establishes the package shell at the repository root: a publishable npm package that pi can install, that registers a `/presets` command, and that proves the package mechanics (peer deps, manifest, command registration) before any preset-management logic is built on top.

The repository directory (`pi-presets-plus/`) already exists — work happens _in_ it, not by creating it.

## What Changes

- Add the package skeleton files at the repository root: `package.json`, `tsconfig.json`, `LICENSE`, `CHANGELOG.md`, `eslint.config.mjs`, `.gitignore`, `README.md`, `src/index.ts`, `src/types.ts`.
- The `package.json` SHALL identify the package as a pi extension package (correct `name`, version `0.1.0`, MIT license, `type: "module"`, the `pi-package` keyword alongside other discoverability keywords, a `pi.extensions` manifest entry pointing at the source entry point, and a curated `files` allowlist for `npm pack`). It SHALL declare pi's runtime modules (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox`) as `peerDependencies` so they are not bundled. It SHALL declare a dev-dependency toolchain that is sufficient to run lint (Biome + ESLint), format (Prettier with the import-sorting plugin), type-check (`tsc --noEmit`), and `package.json` sorting; the toolchain SHALL include every package that the lint/format configs import directly, so the scripts run cleanly out of the box. It SHALL expose `format`, `format-check`, `lint`, `sort-package-json`, and `type-check` scripts.
- The `tsconfig.json` SHALL configure strict TypeScript suitable for a jiti-loaded extension: strict mode, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `esModuleInterop`, `forceConsistentCasingInFileNames`, `module`/`moduleResolution: "Node16"`, `noEmit`, `skipLibCheck`, ES2022 target/lib, scoped to `src`. No `dist/` is produced.
- The `eslint.config.mjs` SHALL use ESLint flat-config and SHALL extend `typescript-eslint`'s **type-checked** recommended preset (not the non-type-aware variant), so `no-floating-promises` and similar type-aware rules are enforced. It SHALL configure `parserOptions.projectService` with `tsconfigRootDir: import.meta.dirname` so type-aware rules can resolve the project's `tsconfig.json` from any cwd. It SHALL also extend `eslint:recommended` and SHALL disable `no-control-regex` (TUI work in later changes uses ANSI escape sequences).
- `LICENSE` SHALL be the MIT license, copyright `2026 Sherif Fanous`.
- `CHANGELOG.md` SHALL be initialized for [Common Changelog](https://common-changelog.org/) and SHALL have no per-version entries yet (no "Unreleased" section either). The first version-tagged entry lands when `v0.1.0` is published in change 7.
- `README.md` SHALL be a one-paragraph skeleton: package name plus a one-line description that makes clear the package provides presets, where each preset bundles a model, thinking level, tools, and system prompt.
- `.gitignore` SHALL ignore at minimum `node_modules/` and `.DS_Store`.
- `src/index.ts` SHALL be the extension entry point: a default-export factory that imports `ExtensionAPI` as a type-only import (required by `verbatimModuleSyntax`) and registers a single `/presets` command. The command's description SHALL make clear that each preset bundles a model, thinking level, tools, and system prompt (i.e. one preset is a combo of all four), not four separate kinds of presets. The handler SHALL display one informational notification and return. No additional events, hotkeys, flags, or UIs are wired in this change.
- `src/types.ts` SHALL be a placeholder exporting an empty namespace, so subsequent changes have a stable file to extend.
- Verify the package installs locally with `pi install <path-to-this-repo>`, that `/presets` registers in a fresh pi session, and that invoking it fires the notification with no other side effects.
- Verify `npm run lint` (Biome + ESLint), `npm run format-check` (Prettier), and `npm run type-check` (`tsc --noEmit`) all exit 0 against the empty package.
- Verify `npm pack` produces a tarball that includes `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `src/`, and excludes the peer-dep modules and dev configs.

## Capabilities

### New Capabilities

- `presets-package`: The package shell — root-level files (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `LICENSE`, `CHANGELOG.md`, `README.md`, `.gitignore`), `src/` with entry point and types placeholder, peer-dep declarations, lint/format/type-check scripts (Biome + ESLint + Prettier + tsc), and a registered `/presets` stub command. Subsequent changes extend this capability rather than introducing new packages.

### Modified Capabilities

(None — this is the first change in the series.)

## Impact

- **New repository-root files**: `package.json`, `tsconfig.json`, `LICENSE`, `CHANGELOG.md`, `eslint.config.mjs`, `.gitignore`, `README.md`, `src/index.ts`, `src/types.ts`.
- **No filesystem changes outside the repository.** No config files are read or written by this change.
- **No pi behavior changes**: the only runtime effect of installing this version is the new `/presets` command, which does nothing but emit a notification.
- **No published version yet**: per the project plan, the first npm publish happens only after all seven changes land. The `version` field starts at `0.1.0` but no `npm publish` runs in this change.
