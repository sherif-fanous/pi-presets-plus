# Agents

## Tasks

[mise](https://mise.jdx.dev/) is the task runner and provisions Node. See
`mise.toml` for the full list. `mise run check` is the pre-commit gate;
`mise run format` and `mise run lint-fix` fix most of what it reports.

## Code conventions

The conventions below are the ones the linter cannot enforce.

### Architecture

- Throw only for I/O failures and programmer errors. Anything a user can
  trigger, such as validation, a name collision, or a missing entry, is an
  expected failure that comes back as a `reason` string, however sensible
  an exception would look at the call site.
- Roll the warnings a call returns into one notification at the UI
  boundary. Never notify per warning, and never notify from a layer below
  the boundary.
- Keep no module-level caches of on-disk state. Re-reading on every call
  is deliberate, not an oversight, because it is what makes `ctx.reload()`
  pick up an edit. Do not add a cache to shorten a hot path.
- Keep one source of truth for parallel structures. When autocomplete and
  runtime dispatch must agree on a list, define one `as const` registry
  and consume it from both sites, as `SUBCOMMANDS` does in
  `src/commands/presets/router.ts`. Nothing fails at compile time when the
  two drift apart.
- Expose test seams as optional last parameters that default to the real
  implementation, as in `getGlobalPresetsPath(agentDir = getAgentDir())`
  and `atomicWrite(target, contents, fs = defaultFs)`. Never reach for a
  DI container or an injection layer to make something testable.

### Comments

Every source file opens with a module JSDoc: one or two sentences saying
what the module does. Every exported function, type, and constant carries
a short JSDoc saying what it does. Do not list what a module is not
responsible for, and do not name sibling modules to disclaim them.

Skip `@param`, `@returns`, and `@throws` tags that restate the signature.
Add a second sentence to a doc block only when the caller needs it: an
invariant to uphold, a non-obvious return contract, a host quirk.

Inline comments are rare. Write one only where the code cannot show the
reason on its own, such as an ordering constraint or a workaround for host
behavior. Delete anything that narrates the next line.

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
apply what they report. Without them, at minimum: no em or en dashes, no
AI stock vocabulary, no bold-label lists, active voice, sentence case.

Two audiences. `README.md` and `CHANGELOG.md` are for someone using the
extension: no internal names, event names, or mechanism, because a user
cannot act on `ctx.ui.notify`. `CONTRIBUTING.md` is for someone changing
the code, so technical terms belong there. The prose rules above apply to
both.

Prose in notifications, dialog bodies, inline editor notices, warnings,
and lead sentences uses complete sentences with terminal periods.
Single-line labels do not carry one. Key/value labels in dialogs, status
and clear rows, picker cards, and footer hints use Title Case with a
trailing colon, as in `Preset:`, `Scope:`, `Baseline model:`, and
`Thinking level:`. Editor form rows use the same Title Case text without
the colon, because their layout is not a key/value row. Button and footer
action labels use Title Case, as in `Save`, `Cancel`,
`Test (apply temporarily)`, `Activate`, `Filter`, `Status`, and `Quit`.

`Pi` is the product, `pi` the binary, and Pi command names stay literal:
`/presets`, `/presets clear`, `/reload`, `/model`.
