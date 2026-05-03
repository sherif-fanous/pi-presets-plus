## Why

This is the fourth of seven changes building `pi-presets-plus` (see `openspec/breakdown.md`). Storage and activation work end-to-end via keyboard commands after change 3, but the user experience is still "edit JSON, run a command, activate by exact name." This change introduces the first real TUI surface: a custom picker built on `ctx.ui.custom` that opens from the bare `/presets` command, lets the user browse loaded presets, filter them, inspect their key fields, and activate one with `Enter`.

The picker also introduces the literal-substring-first filter that fixes the kind of issue raised in upstream pi #3433 — inside our own picker, regardless of what upstream does.

Edit/create/delete actions are _not_ part of this change — those arrive in change 5 with the editor UI. The picker in this change is read-only-plus-activate.

## What Changes

- Make the bare `/presets` invocation open an interactive picker UI.
- Remove the `/presets list` command surface from this change. It is redundant with the bare picker entry point and should not be exposed as a synonym.
- Do not add a `--text` / plain-text escape hatch in this change. The picker is the sole new user-facing list/browse surface.
- Add a custom multi-line list widget that renders one preset per readable key/value card: name, scope, `provider / model`, thinking level, tool list (including actual active tool names for inherited presets), optional prompt preview, explicit availability status (`Unavailable — missing API key`, `Unavailable — model not found`), explicit shadowing status (`Overridden by project preset`), and an active-state dot when the preset is the currently active one.
- Render the picker inside a full bordered dialog with top, bottom, left, and right borders.
- Add a filter input row at the top of the picker. Filtering is focused with `/` and uses literal-substring-first ranking: presets whose `name` or `provider/model` contains the query as a case-insensitive literal substring appear above presets matched only by subsequence-fuzzy match, with subsequence matches preserved in their original ranking after the literal block.
- Add a scope filter toggle in the header (All | User only | Project only) cycled with `←/→` arrow keys.
- Footer hint row showing keybindings: `⏎ activate · / filter · ↑/↓ move · PgUp/PgDn · ←/→ scope · esc`.
- Add `src/ui/filter.ts` with the literal-first ranking function, exported pure for unit testing.
- Add `src/ui/widgets.ts` housing the multi-line key/value preset card, scope/status formatting helpers, prompt preview, and active-state dot — designed so the editor and capture dialogs in change 5 can re-use them.
- The picker activates via `Enter` (closes picker, runs the existing apply flow from change 3) and exits via `Esc` (no state change). It supports cyclic up/down navigation at list boundaries. It does NOT support new/edit/duplicate/delete/reorder yet; pressing those keys produces a hint ("editor coming in next change").
- Remove exact-name activation via `/presets <preset-name>` from the command surface; users activate from the picker instead.

## Capabilities

### New Capabilities

- `preset-picker`: TUI picker UI built on `ctx.ui.custom` — full bordered dialog, multi-line key/value cards, scope filter toggle, literal-first filter, activate-on-Enter behavior, keybinding footer.

### Modified Capabilities

(None in delta-spec form. The bare `/presets` command's surface evolves to open the picker; the new behavior is captured under `preset-picker` requirements.)

## Impact

- **No new file paths or runtime side effects beyond what activation already does.** The picker is a render-and-input loop on top of `loadAll` and the existing apply flow.
- **New runtime dependency on `@mariozechner/pi-tui`** — already declared as a peer dep from change 1, but actually used now for the first time. The change exercises `ctx.ui.custom`, custom component rendering, raw input handling, and theme functions.
- **The literal-first filter** is local to our picker. It does not patch pi's built-in `/model` filter; users still see pi's behavior there. We document this in the README so users understand the scope of our fix.
- **Performance**: `loadAll` runs each time the picker opens. For realistic preset counts (dozens) this is trivial; we don't add caching.
