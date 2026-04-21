## 1. Repository-root configuration files

- [x] 1.1 Create `package.json` at the repository root that satisfies the `Package manifest identifies a pi extension package`, `Pi runtime modules are declared as peer dependencies`, `Dev-dependency toolchain is self-sufficient`, and `Package scripts expose lint, format, type-check, and helpers` requirements (correct identity fields, `pi.extensions`, `keywords` including `pi-package`, `files` allowlist, peer deps, dev-deps that cover the toolchain plus every package the configs import, and the five required script names)
- [x] 1.2 Create `LICENSE` at the repository root containing the standard MIT license body with the line `Copyright (c) 2026 Sherif Fanous`
- [x] 1.3 Create `CHANGELOG.md` at the repository root with the `# Changelog` heading and a one-line note that the file follows Common Changelog (no per-version sections, no `Unreleased` section)
- [x] 1.4 Create `eslint.config.mjs` at the repository root that satisfies the `ESLint configuration is type-aware` requirement (flat-config; extends `eslint:recommended` and `typescript-eslint`'s type-checked recommended preset; declares `parserOptions.projectService: true` and `tsconfigRootDir: import.meta.dirname`; disables `no-control-regex`)
- [x] 1.5 Create `tsconfig.json` at the repository root that satisfies the `TypeScript configuration enforces strict, jiti-friendly settings` requirement (every listed compiler option set as specified; `include: ["src"]`)

## 2. Repository-root files (other)

- [x] 2.1 Create `.gitignore` with at least `node_modules/` and `.DS_Store` (additional patterns permitted)
- [x] 2.2 Create `README.md` with the package name and a one-line description that makes clear the package provides presets bundling a model, thinking level, tools, and system prompt

## 3. Source skeleton

- [x] 3.1 Create `src/types.ts` with `export {};`
- [x] 3.2 Create `src/index.ts` as a default-export factory (`(pi: ExtensionAPI) => void | Promise<void>`) that imports `ExtensionAPI` as a type-only import (required by `verbatimModuleSyntax`), registers exactly one command named `presets` whose `description` makes clear each preset bundles a model, thinking level, tools, and system prompt, and shows a single info-level notification — written so it is lint-clean under the type-checked ESLint preset (no `async` keyword without an `await`)

## 4. Install dev tooling

- [x] 4.1 Run `npm install`; verify `node_modules/` is created and dev deps install cleanly with no `MODULE_NOT_FOUND` errors

## 5. Tooling verification

- [x] 5.1 Run `npm run type-check`; verify it exits with code 0 and no errors
- [x] 5.2 Run `npm run lint`; verify it exits with code 0 and no errors (Biome and ESLint both clean against the empty package)
- [x] 5.3 Run `npm run format-check`; verify it exits with code 0 and no errors (every literal Prettier path resolves to a real file)

## 6. Local install verification

- [x] 6.1 Run `pi install <absolute-path-to-this-repository>` against the local pi installation; confirm install completes
- [x] 6.2 Start a new pi session; confirm `/presets` appears in the command list
- [x] 6.3 Run `/presets`; confirm the notification fires and no other side effects occur
- [x] 6.4 Run `npm pack` at the repository root; inspect the tarball and confirm peer-dep modules are NOT included and the manifest, README, LICENSE, CHANGELOG, and `src/` are present
