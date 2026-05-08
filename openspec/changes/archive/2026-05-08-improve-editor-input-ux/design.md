## Context

`src/ui/editor.ts` is a single-file dialog that composes three kinds of
row renderers:

- **pi-tui `Input`** widgets for Name and Hotkey (single-line text
  input with built-in editing keys).
- **Custom radio / select rows** for Scope, Provider, Model, Thinking,
  Tools.
- **Custom multi-line text area** for Prompt (instructions).

pi-tui's `Input.render()` always emits an inverse-video cursor
character, regardless of `this.focused`:

```js
// node_modules/.../pi-tui/dist/components/input.js — render() (paraphrased)
const marker = this.focused ? CURSOR_MARKER : ""; // hw marker, focus-gated
const cursorChar = `\x1b[7m${atCursor}\x1b[27m`; // ALWAYS emitted
return [prompt + beforeCursor + marker + cursorChar + afterCursor];
```

It also hardcodes a `> ` prompt prefix at line start. Together these
two facts produce both the "permanent block cursor" symptom (1) and
the "`>` vs sentence placeholder" inconsistency (3). The Prompt row is
custom and shows a sentence-cased placeholder when empty, so the
inconsistency is one-sided.

The shortcut gap (2) is structural: `handleInput()` already intercepts
`Esc`, `Tab`, `Shift+Tab`, `Up`, and `Down` at the top of the function
before delegating to the focused row's handler. Adding `Ctrl+S` and
`Ctrl+T` at the same level is a clean parallel.

## Goals / Non-Goals

**Goals:**

- Name and Hotkey rows show no cursor character when not focused. The
  only persistent focus indicator on those rows is the existing
  left-margin `▌` accent marker.
- Empty Name and Hotkey rows (when unfocused) carry the same
  placeholder the Prompt row already uses, normalized to a pure
  visual glyph: `"—"` (a single em-dash in `dim` color). The
  placeholder deliberately avoids the word "empty" and any
  reference to a specific keystroke, since the editor accepts both
  Tab and arrow keys for navigation.
- `Ctrl+S` saves and `Ctrl+T` tests from any focus state, including
  while typing into a text field. `Esc` continues to cancel.
- The footer hint surfaces the new shortcuts so they are
  discoverable without reading the spec or scrolling to the buttons.
- The Save / Cancel / Test button row remains in the dialog
  unchanged; shortcuts are an additional path, not a replacement.

**Non-Goals:**

- No upstream change to pi-tui's `Input` widget. We work around the
  always-on cursor by not rendering the widget when the row is
  unfocused; if pi-tui later gates the cursor on focus, this code
  remains correct.
- No removal of the `> ` prompt prefix from `Input` itself. When the
  row is focused, `Input`'s native rendering (with `> ` and cursor)
  is what the user sees — that is the editing affordance.
- No new shortcut for moving focus directly to a specific row (e.g.
  jumping to Prompt). Tab and arrow keys remain the only focus
  movers.
- No global preference, theme, or settings flag for these
  shortcuts. They are unconditional editor behavior.
- No change to the Prompt row's existing rendering (it already gets
  this right).

## Decisions

### Decision: dual-mode rendering for Name and Hotkey rows

Render Name and Hotkey via `renderValueRow` (the same helper used by
Provider, Model, etc.) when the row is unfocused; render via
`Input.render()` when the row is focused.

```ts
// renderRows() — sketch
private renderNameRow(width: number): string {
  if (this.currentRow() === "name") {
    return renderValueRow(
      this.theme,
      "Name",
      this.nameInput.render(Math.max(1, width - 16))[0] ?? "",
      true,
    );
  }

  const value =
    this.state.name.length > 0
      ? this.state.name
      : this.theme.fg("dim", "—");

  return renderValueRow(this.theme, "Name", value, false);
}
```

The `nameInput` and `hotkeyInput` `Input` instances stay alive across
focus toggles; they continue to receive `setInputValueCursorAtEnd`
seeding at construction time and continue to be the source of truth
for typed-but-not-yet-saved values while focused. The change is
purely about whether we _call render()_ on them on a given frame.

**Alternative considered: drop pi-tui `Input` entirely and write our
own single-line input.** Rejected as scope creep — `Input`'s editing
semantics (cursor movement, paste, IME, horizontal scrolling) are
non-trivial and pi-tui already ships them.

**Alternative considered: post-process the `Input.render()` output
to strip the inverse-video cursor when unfocused.** Rejected as
fragile (we'd be parsing ANSI escape sequences out of a string we
just asked another package to assemble) and indistinguishable in
behavior from the simpler "don't call render" approach.

### Decision: shortcut interception at the top of `handleInput()`

```ts
handleInput(input: string): void {
  if (this.actionInFlight) return;

  if (matchesKey(input, Key.escape))                  { this.finish(undefined); return; }
  if (matchesKey(input, Key.ctrl("s")))               { this.activateButton("save"); return; }
  if (this.options.onTest && matchesKey(input, Key.ctrl("t"))) {
    this.activateButton("test");
    return;
  }

  if (matchesKey(input, Key.tab) || matchesKey(input, Key.down))         { this.moveFocus(+1); return; }
  if (matchesKey(input, Key.shift(Key.tab)) || matchesKey(input, Key.up)) { this.moveFocus(-1); return; }

  // ... delegate to focused row
}
```

The shortcuts run the _same code paths_ as the on-screen buttons so
that validation, name-collision handling, scope-change confirmation,
and the activation-flow plumbing for Test are exercised consistently
regardless of how the user invoked the action.

`Ctrl+T` is gated on `this.options.onTest` being defined — i.e. the
same condition that controls whether the Test button is rendered —
so the shortcut and the button stay in lockstep.

**Alternative considered: `Alt+S` / `Alt+T` instead of `Ctrl+S` /
`Ctrl+T`.** `Ctrl+` is more discoverable (familiar from common
desktop patterns) and is not consumed by pi-tui's `Input` (a quick
audit of `Input.handleInput` shows no Ctrl+S/Ctrl+T binding). `Alt+`
is harder to type on macOS (where Option is often remapped) and has
worse cross-terminal compatibility for non-letter characters.

**Alternative considered: `Ctrl+Enter` for Save.** Some terminals
send `Ctrl+Enter` as a plain `\r`, making it indistinguishable from
the Prompt row's "insert newline" Enter. Rejected.

### Decision: footer hint format

The editor's existing footer hint already lists `Tab`-style
movement. Extend it with the new shortcuts in the same style:

```
Tab/↑↓ Move · ^S Save · ^T Test · Esc Cancel
```

When the caller has not wired a test callback, omit `· ^T Test`
(matching the existing rule that drops the Test button in the same
case).

### Decision: do not clear the placeholder for non-empty unfocused rows

If the value is non-empty and the row is unfocused, render the value
itself (not the placeholder). This is symmetric with the Prompt row
and avoids the placeholder ever flickering over a real value.

## Risks / Trade-offs

- **[Risk]** Some terminals or shells consume `Ctrl+S` for XOFF flow
  control, swallowing the keystroke before it reaches the
  application. → Mitigation: this is a known issue with `Ctrl+S`
  across CLI tools; the on-screen Save button remains as the
  always-available path. The footer hint surfaces the shortcut so
  users in capable terminals discover it; users in incapable
  terminals fall back to the button. We do not need to detect or
  warn — XOFF interception is invisible to the application.
- **[Risk]** A future pi-tui release that gates `Input`'s cursor on
  focus would render this dual-mode logic redundant. → Mitigation:
  the dual-mode approach is still correct (Input would simply not
  draw the cursor when called for an unfocused render); the
  sentence placeholder remains useful regardless. No regression.
- **[Risk]** A user who Tab-cycles into the Name row before any other
  navigation (i.e. on first open) sees `Input`'s native rendering
  with `> ` prefix while focused, which differs from the unfocused
  row's plain rendering. → This is intentional: the focused state
  _is_ the editing state, and `> ` plus the cursor are the editing
  affordances. The visual transition between focused and unfocused
  states is the focus cue, working in concert with the left-margin
  `▌` marker.
- **[Trade-off]** The shortcut path duplicates the work of the
  button-activation path. → Mitigation: route both through the same
  internal handler (`activateButton(action)`) so the duplication is
  in dispatch only, not in the action logic itself.
