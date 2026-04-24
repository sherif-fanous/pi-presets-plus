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

| Task                         | Description                              |
| :--------------------------- | :--------------------------------------- |
| `mise run format-check`      | Check formatting without writing changes |
| `mise run format`            | Auto-format source files with Prettier   |
| `mise run install-deps`      | Install npm dependencies                 |
| `mise run lint`              | Lint source files with ESLint            |
| `mise run sort-package-json` | Sort `package.json` keys                 |
| `mise run test`              | Execute tests                            |
| `mise run type-check`        | Run TypeScript type checking             |
| `mise run uninstall-deps`    | Uninstall npm dependencies               |
| `mise run update-deps`       | Update npm dependencies                  |

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
