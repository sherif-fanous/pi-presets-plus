# Agents

## mise

This project uses [mise](https://mise.jdx.dev/) as the task runner. mise
automatically provisions the correct Node.js version (declared in `mise.toml`
under `[tools]`) before every command, so the runtime is always consistent.

Run any task with:

```shell
mise run <task>
```

### Available tasks

| Task                         | Description                                                             |
| :--------------------------- | :---------------------------------------------------------------------- |
| `mise run check`             | Run format-check, type-check, lint, and test (the full pre-commit gate) |
| `mise run format`            | Auto-format source files with Prettier                                  |
| `mise run format-check`      | Check formatting without writing changes                                |
| `mise run install-deps`      | Install npm dependencies                                                |
| `mise run install-dev-deps`  | Install npm dev dependencies (`npm install --save-dev`)                 |
| `mise run lint`              | Lint source files with Biome and ESLint                                 |
| `mise run lint-fix`          | Auto-fix lint violations with Biome and ESLint                          |
| `mise run sort-package-json` | Sort `package.json` keys                                                |
| `mise run test`              | Execute tests once (CI mode, `vitest --run`)                            |
| `mise run test-watch`        | Execute tests in watch mode                                             |
| `mise run type-check`        | Run TypeScript type checking                                            |
| `mise run uninstall-deps`    | Uninstall npm dependencies                                              |
| `mise run update-deps`       | Update npm dependencies                                                 |

## Code conventions

Prettier, Biome, ESLint, and `tsc` enforce formatting, import order,
naming, file-section ordering, kebab-case filenames, function-declaration
style, and bans on `any` / `!` / `console.*` / one-letter identifiers.
Run `mise run check` to surface violations across all four tools — most
are auto-fixable via `mise run format` or `mise run lint-fix`.

The conventions below are the ones the linter cannot enforce. They are
project-wide unless noted.

### Architecture

- Return a discriminated `{ ok: true } | { ok: false; reason: string }`
  for expected failures (validation, name collisions, missing entries).
  Throw only for I/O failures and programmer errors.
- Pure / lower layers return `warnings: string[]` alongside their
  result. Only the UI boundary calls `ctx.ui.notify`, and it rolls the
  warnings array into a single notification rather than firing one per
  warning.
- Storage operations re-read from disk on every call. No module-level
  caches of on-disk state — this makes `ctx.reload()` work for free
  and avoids a class of staleness bugs.
- Persist via the `atomicWrite` helper
  (`mkdir -p` → tmp file → `fsync` → `rename`). Never write a
  user-visible file directly.
- One source of truth for parallel structures: when autocomplete and
  runtime dispatch must agree on a list, define one `as const`
  registry and consume it from both sites (see `SUBCOMMANDS` in
  `src/commands/presets/router.ts`).

### API shape

- Functions consuming `ExtensionContext` declare the minimum surface
  via `Pick<ExtensionContext, …>` so tests can pass tiny fakes.
- Test seams are exposed as optional last parameters with the real
  implementation as the default
  (`getGlobalPresetsPath(agentDir = getAgentDir())`,
  `atomicWrite(target, contents, fs = defaultFs)`). No DI container.
- UI subcommands split into an exported pure formatter (returns a
  `string`) and a thin `runX(ctx)` runner that routes the string
  through `ctx.ui.notify`. Tests assert on the formatter's return
  value and never stub `ctx.ui`.

### Documentation

- Every source file opens with a JSDoc block stating: (a) the file's
  role in one line, (b) what it owns vs. what it does NOT own,
  (c) the OpenSpec change it belongs to, (d) future-change extension
  points so reviewers know why current scope is intentionally narrow.
- Comments explain _why_, not _what_. Common patterns: rationale on
  trivial wrappers, behavior matrices in JSDoc for branchy functions,
  invariant statements, and visual-width / ANSI gotchas.
- Lifecycle handlers (`session_start`, command handlers) wrap calls in
  defense-in-depth `try/catch` with a comment explaining why the guard
  exists.

## Commit messages

Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/), i.e. `<type>(<optional-scope>): <subject>` on the first line, where `<type>` is one of:

| Type       | Use for                                                                          |
| :--------- | :------------------------------------------------------------------------------- |
| `build`    | Build system, package manifest, or dependency changes                            |
| `chore`    | Maintenance tasks that don't fit elsewhere (e.g. tooling config tweaks)          |
| `ci`       | CI configuration changes                                                         |
| `docs`     | Documentation-only changes (README, AGENTS.md, openspec proposals/designs, etc.) |
| `feat`     | A new user-visible feature                                                       |
| `fix`      | A bug fix                                                                        |
| `perf`     | Performance improvements                                                         |
| `refactor` | Code restructuring with no behavior change                                       |
| `revert`   | Reverting a previous commit                                                      |
| `style`    | Formatting / whitespace / lint-only fixes that don't change behavior             |
| `test`     | Adding or updating tests                                                         |

Guidelines:

- Subject is in the imperative mood ("add picker", not "added picker" or "adds picker"), lowercase, no trailing period, ideally ≤ 72 characters.
- Use a scope when it sharpens meaning, e.g. `feat(presets-picker): ...` or `fix(eslint): ...`. Skip the scope when the change is broad.
- Append `!` after the type/scope (e.g. `feat(presets-storage)!: ...`) for a breaking change, and explain it in the body or a `BREAKING CHANGE:` footer.
- Optional body (after a blank line) explains _why_; reference the OpenSpec change name when relevant (e.g. `Part of openspec change: add-preset-storage`).

Examples:

```text
chore: bump prettier to 3.8.3
docs(openspec): rewrite scaffold-presets-plus spec to be generic
feat(presets-package): scaffold pi-presets-plus extension shell
fix(eslint): add @eslint/js + typescript-eslint to devDependencies
```

### Body conventions for substantial commits

Commits that touch more than ~3 files SHOULD include a structured body. Use this skeleton:

1. **One-paragraph "why"** — what this commit makes possible / what part of the project plan it advances. Reference the OpenSpec change name when relevant.
2. **`What's in:` bullet list** — one bullet per _role_ (not one per file). Order bullets by purpose-cluster: manifest → build/lint configs → source → docs/legal → repo meta → openspec. Within the repo-meta cluster, list files in dependency order (a file gets introduced before any file that references it; e.g. `mise.toml` before `AGENTS.md`).
3. **`Verified:` bullet list** — one bullet per check that was actually run (lint, type-check, format-check, install round-trip, pack contents, etc.).
4. **Footer line** — `Closes openspec change: <name>.` for the commit that finishes a change, or `Part of openspec change: <name>.` for incremental commits.

Keep bullets ≤ 2 lines each; wrap the body at 72 columns.
