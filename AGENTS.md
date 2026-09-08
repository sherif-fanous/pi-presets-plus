# Agents

## Tasks

[mise](https://mise.jdx.dev/) is the task runner and provisions Node. See
`mise.toml` for the full list. `mise run check` is the pre-commit gate;
`mise run format` and `mise run lint-fix` fix most of what it reports.

## Code conventions

The `fallow-*` tasks (and their `fallow` aggregator) are **advisory
audits, not gates**. Run them periodically — e.g. before a release or
when cleaning up a module — and use human judgement on the output.
They are intentionally excluded from `check` because their reports
routinely contain legitimate false positives (public API exports,
intentionally-parallel code) that would make the pre-commit gate
noisy and encourage reflexive "fix it to shut the tool up" refactors.

Prettier, Biome, ESLint, and `tsc` enforce formatting, import order,
naming, file-section ordering, kebab-case filenames, function-declaration
style, user-facing string vocabulary, and bans on `any` / `!` /
`console.*` / one-letter identifiers. Run `mise run check` to surface
violations across all four tools — most are auto-fixable via
`mise run format` or `mise run lint-fix`.

The conventions below are the ones the linter cannot enforce. They are
project-wide unless noted.

### User-facing strings

- Labels in dialogs, status/clear rows, picker cards, and footer hints use
  Title Case with a trailing colon when rendered as key/value labels, e.g.
  `Preset:`, `Scope:`, `Baseline model:`, `Thinking level:`. Editor
  form rows use the same Title-Case label text without a colon because
  their layout is not a key/value dialog row.
- Prose in notifications, dialog bodies, inline editor notices, warnings,
  and lead sentences uses sentence-case English and complete sentences with
  terminal periods. Single-line labels do not carry trailing periods;
  multi-sentence prose blocks do.
- Pi command names stay literal and unchanged in spelling/case:
  `/presets`, `/presets clear`, `/reload`, `/model`.
- Use `Pi` as a capitalized product noun in prose (`Reload Pi?`), and use
  lowercase only for the `pi` CLI binary or package names such as `pi-ai`.
- Button and footer action labels use Title Case, e.g. `Save`, `Cancel`,
  `Test (apply temporarily)`, `Activate`, `Filter`, `Status`, `Quit`.

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

### Comments

Every source file opens with a module JSDoc: one or two sentences saying
what the module does. Every exported function, type, and constant carries
a short JSDoc saying what it does. Do not list what a module is not
responsible for, and do not name sibling modules to disclaim them.

Skip `@param`, `@returns`, and `@throws` tags that restate the signature.
Add a second sentence to a doc block only when the caller needs it: an
invariant to uphold, a non-obvious return contract, a host quirk.

Inline comments are rare. Write one only where the code cannot show the
reason on its own, such as a protocol quirk, an ordering constraint, or a
workaround for host behavior. Delete anything that narrates the next line.

Comments describe the code as it stands today. Never write about what the
code used to do, why it changed, what a change was called, or where it
might be extended later. That history lives in Git and `CHANGELOG.md`.

Comment prose follows the same rules as user-facing text: sentence case,
complete sentences, no em or en dashes, no AI stock vocabulary.

## User-facing text

This is `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, notification and
warning text, overlay bodies, empty states, footer hints, and command
descriptions.

Run the `humanizer` and `unslop` skills over anything user-facing and
apply what they report. When unavailable, at minimum: no em or en dashes,
no AI stock vocabulary, no bold-label lists, active voice, sentence case.

Two audiences. `README.md` and `CHANGELOG.md` are for someone using the
extension: no internal names, event names, or mechanism, because a user
cannot act on `ctx.ui.notify`. `CONTRIBUTING.md` is for someone changing
the code, so technical terms belong there. The prose rules above apply to
both.

`Pi` is the product, `pi` the binary.
