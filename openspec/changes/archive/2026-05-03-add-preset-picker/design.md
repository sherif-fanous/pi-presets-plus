## Context

This change introduces the first real UI in `pi-presets-plus`: a custom TUI picker for browsing and activating presets. By the end of this change, `/presets` is a usable, scannable interface and picker selection becomes the activation path.

The picker is intentionally read-only-plus-activate. CRUD operations (new, edit, duplicate, delete, reorder) require a second-level form UI that is the entire scope of change 5. Splitting them keeps the surface manageable and lets us prove the pi-tui composition pattern in a low-risk read-only context first.

The picker also includes the literal-substring-first filter that addresses the kind of issue in upstream pi #3433. We ship this fix inside our own picker because (a) the picker is ours to design, and (b) we want this UX regardless of upstream's filter ranking.

## Goals / Non-Goals

**Goals**

- A readable picker: every preset visible with model, thinking, scope, availability, active state, shadowing, tools, and prompt preview.
- Full bordered dialog rendering with top, bottom, left, and right borders.
- Filter that respects literal substring as the primary signal, with subsequence-fuzzy as a secondary fallback.
- Reusable widget primitives for the editor and capture dialogs in change 5.
- No regression in the activation behavior — the picker calls into change 3's `apply` unchanged.

**Non-Goals**

- Create / edit / duplicate / delete / reorder. All change 5.
- Drift indicators (the `*` asterisk on active items). Change 6.
- Hotkey display in cards (the `⌃1` style hint). Change 7.
- Plain-text listing / scripting output. This change intentionally exposes only the picker. A future accessibility or CLI-oriented change can add a dedicated plain-text command if needed.
- Inline full prompt rendering. Cards show only a prompt preview.
- Keyboard navigation other than up/down/page-up/page-down and Enter/Esc/`/`/scope cycle.

## Decisions

### Command surface

Only the bare command opens the picker:

```text
/presets  → opens picker
```

`/presets list` is not a supported synonym in this change. It duplicates the bare picker entry point and creates avoidable ambiguity around whether "list" means a TUI list or plain text output.

No `--text` flag is added in this change. The old text formatter may remain as internal code only if still useful to existing tests or future work, but it is not part of this change's user-facing command surface.

Exact-name activation via `/presets <preset-name>` is removed from the command surface. Activation happens through picker selection (`Enter`) so the command namespace stays small and unambiguous.

### Card layout

Each preset is rendered as a readable multi-line key/value card, not as a compressed two-line row.

Example:

```text
│ ▌ ● plan                                                            │
│   Scope:       Project                                              │
│   Model:       anthropic / claude-opus-4.5                          │
│   Thinking:    High                                                 │
│   Tools:       read, grep, find, ls                                 │
│   Prompt:      PLAN MODE: inspect first, then summarize…             │
│                                                                      │
│   implement                                                         │
│   Scope:       User                                                 │
│   Model:       anthropic / claude-sonnet-4-5                        │
│   Thinking:    High                                                 │
│   Tools:       read, bash, edit, write                              │
│                                                                      │
│   quickfix                                                          │
│   Scope:       Project                                              │
│   Model:       openai / gpt-5.2-codex                               │
│   Thinking:    Low                                                  │
│   Tools:       read, bash, edit                                     │
│   Status:      Unavailable — missing API key                         │
│                                                                      │
│   plan                                                              │
│   Scope:       User                                                 │
│   Model:       anthropic / claude-haiku-4.5                         │
│   Thinking:    Off                                                  │
│   Tools:       read                                                 │
│   Shadowing:   Overridden by project preset                          │
```

Line semantics:

- Title line: selected accent marker `▌` when selected, active dot `●` when this preset is currently active, then the preset name.
- `Scope:` is rendered as `User` or `Project` with no abbreviations.
- `Model:` is rendered as `provider / model` with spaces around `/` for readability.
- `Thinking:` renders a title-cased thinking level (`Off`, `Low`, `Medium`, `High`, etc.).
- `Tools:` renders `inherit` when tools are omitted or empty; otherwise it renders comma-separated tool names. If the list is too wide for the dialog, it truncates to fit the line rather than switching to cryptic abbreviations.
- `Prompt:` is omitted when no instructions are present; otherwise it renders a single-line preview truncated with `…`.
- `Status:` is omitted when available; otherwise it renders `Unavailable — missing API key` or `Unavailable — model not found`.
- `Shadowing:` is omitted when not shadowed; otherwise it renders `Overridden by project preset`.

### Full bordered dialog

The picker renders inside a full bordered dialog with left and right borders on every line:

```text
┌─ Presets Plus ──────────────────────────────────────── Scope: All ─┐
│ Filter: opus                                                        │
├──────────────────────────────────────────────────────────────────────┤
│ ... cards ...                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ ⏎ Activate · / Filter · ↑/↓ Move · PgUp/PgDn · ←/→ Scope · Esc Close│
└──────────────────────────────────────────────────────────────────────┘
```

Every rendered line must fit within the width supplied by the TUI component. The frame component owns padding, truncation, and right-border alignment so child renderers do not need to manually add partial borders.

### Filter focus behavior

The filter is visible at the top but is not always focused.

- `/` focuses the filter input.
- While focused, the filter row shows an explicit visual cursor/focus indicator in addition to emitting `CURSOR_MARKER` so Pi can position the hardware cursor when supported.
- `Esc` while the filter is focused returns focus to the list.
- `Esc` while the list is focused closes the picker.

This preserves the familiar list-first interaction and avoids a Ctrl-heavy keymap.

### Filter ranking (#3433-style fix)

```ts
// src/ui/filter.ts
export function rankPresets(
  items: LoadedPreset[],
  query: string,
): LoadedPreset[] {
  if (!query) return items;
  const q = query.toLowerCase();

  const literal: LoadedPreset[] = [];
  const fuzzy: LoadedPreset[] = [];

  for (const item of items) {
    const haystack =
      `${item.name} ${item.provider}/${item.model}`.toLowerCase();
    if (haystack.includes(q)) {
      literal.push(item);
    } else if (subsequenceMatch(haystack, q)) {
      fuzzy.push(item);
    }
  }

  return [...literal, ...fuzzy];
}

function subsequenceMatch(haystack: string, query: string): boolean {
  let qi = 0;
  for (let hi = 0; hi < haystack.length && qi < query.length; hi++) {
    if (haystack[hi] === query[qi]) qi++;
  }
  return qi === query.length;
}
```

Within each group order is preserved from the input. The test suite reproduces the upstream #3433 example (`opus` query against multi-provider list) and asserts the literal-block-first behavior.

### Scope filter

Three states cycled by `←/→`: `All`, `User only`, `Project only`. Default is `All`. The current state is shown in the header (e.g. `Scope: All`). When set to `User only` or `Project only`, presets in the other scope are hidden from the list.

Shadow handling under scope filter:

- `All`: shadowed globals appear with `Shadowing: Overridden by project preset`.
- `User only`: shadowed globals appear normally because the project version is hidden.
- `Project only`: only project versions render.

### Layout composition

```text
Root Picker Component
├── FullFrame
│   ├── HeaderRow         (`Presets Plus` title + scope toggle)
│   ├── FilterInputRow    (label + input, focused via `/`)
│   ├── HorizontalRule
│   ├── ScrollableList    (custom, multi-line key/value cards)
│   ├── HorizontalRule
│   └── FooterHintRow     (text)
```

`ScrollableList` is custom because pi-tui's `SelectList` renders single-line items. We compose manual rendering of N cards based on a scroll offset, with up/down/page-up/page-down handling. Selection highlight is a left accent marker on the selected card.

### Action wiring (this change)

| Key               | Action                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `↑` `↓`           | Move selection up / down, wrapping at the first/last visible preset |
| `PgUp` `PgDn`     | Page navigation                                                     |
| `Enter`           | Activate selected preset (close picker, call change-3 `apply`)      |
| `Esc` from filter | Return focus to list                                                |
| `Esc` from list   | Close picker without action                                         |
| `/`               | Focus the filter input                                              |
| `←` `→`           | Cycle scope filter                                                  |
| `n` `e` `d` `x`   | Show a hint: "Editor coming in change 5"                            |
| Anything else     | Ignored                                                             |

Activation calls the existing `apply(preset, ctx)` from change 3. If apply refuses (preset unavailable), the picker stays open and the refusal notification surfaces.

When a preset inherits tools (its `tools` field is omitted or empty), the card shows the currently active tool names with an `(inherited)` suffix rather than showing only the word `inherit`. This makes inherited presets inspectable before activation while still preserving the underlying storage semantics.

### `loadAll` on every open

The picker calls `loadAll(ctx)` each time it opens, so external edits between opens are picked up without a `/reload`. We do NOT subscribe to file-watch events (out of scope). Performance is fine for realistic preset counts.

### Module layout

```text
src/ui/
├── filter.ts          # rankPresets + subsequenceMatch (pure, unit-tested)
├── widgets.ts         # key/value PresetCard + scope/status/summary helpers
├── picker.ts          # openPicker(ctx, opts) → Promise<{ activated?: LoadedPreset } | undefined>
└── status.ts          # (already exists from change 3)
```

`openPicker` returns a result object so callers in later changes can know whether the user activated something or canceled.

## Risks / Trade-offs

- **Custom multi-line list code.** pi-tui doesn't ship a multi-line list widget. We have to write scroll/highlight code by hand. Risk: subtle bugs around scroll offset and selection. Mitigation: keep the implementation small, test pure state helpers, and manually QA the terminal behavior.
- **Fewer presets visible at once.** Multi-line key/value cards are more readable but less dense than two-line cards. This is intentional: presets are configuration objects, and readability beats density here.
- **Filter ranking is local to our picker.** Users will see pi's built-in `/model` ranking unchanged. Mitigation: README clarifies scope. If we ever want to fix upstream we can submit a PR separately.
- **`loadAll` on every open** wastes work if the picker is opened repeatedly in quick succession. Mitigation: not a real issue at human cadence; the cost of a JSON parse for ~dozens of presets is negligible.
- **No real-time file watch** means external edits during a single picker session aren't reflected. Mitigation: documented; reopening picker covers it.
