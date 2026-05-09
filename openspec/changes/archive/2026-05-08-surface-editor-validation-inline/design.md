## Context

The editor's current validation flow:

```
validateForSave():
  1. validateRequired():
       - Name empty                    → "Name is required."
       - Provider OR Model empty       → "Provider and model are required."
                                         (combined, ambiguous home)
  2. Hotkey present + invalid          → parseHotkey reason
                                         (only runs if Hotkey is set)
  3. Hotkey is Pi built-in             → confirmation dialog (flow state)
  4. Hotkey conflicts another preset   → confirmation dialog (flow state)
  5. Name collision in scope           → "A preset named X already exists in <scope>."
```

All errors are written to a single `this.error: string | undefined`
field. `renderMessages()` pushes `this.error` into the dialog's
bottom message strip in the `error` colour.

This shape forces three suboptimal user experiences:

```text
1. Position
   Bottom-strip placement disconnects the error from the field it
   names. "Name is required." appears 8+ rows below the Name row.

2. One-at-a-time
   `validateRequired()` returns the first failure. A user with three
   empty required fields gets one error, fills it, gets the next, fills
   it, gets the third. Three Save attempts to discover three problems.

3. Combined messages don't fit inline
   "Provider and model are required." names two rows. If we attach it
   inline to either, we lie about the other.
```

The `runWithHiddenOverlay` + confirmation-dialog flow for built-in
and conflict warnings is structurally different — the user makes a
yes/no choice and the editor either proceeds or surfaces a "Save
cancelled." message. That message isn't a _field_ error; it's a
_flow_ error reflecting the user's last decision. It belongs in the
bottom strip even after we move field errors inline.

## Goals / Non-Goals

**Goals:**

- Field-tied errors render inline beneath their offending row, at
  the same indentation other inline hints use.
- Save/Test surfaces ALL field-level failures in one render pass,
  not just the first.
- The previously-combined "Provider and model are required."
  splits into two row-tied messages so the inline placement is
  unambiguous.
- Field errors clear when the user takes an action that could
  resolve the error, including cross-field coupling (changing
  Provider clears the Model error).
- Flow-state errors (Save cancelled, etc.) continue to render in
  the bottom message strip, alongside the existing hotkey-reload
  notice.
- The editor's renderable row layout grows by at most one dim
  line per row when errors are present; no row gains a permanent
  vertical-space cost.

**Non-Goals:**

- No live validation as the user types (that would require running
  every check on every keystroke). Validation runs on Save/Test.
- No multi-error rendering for a single row. Each row owns at most
  one error message at a time.
- No new error categories beyond what exists today. The same
  failures fire; the only behavior change is presentation and
  multiplicity.
- No changes to the confirmation-dialog flow for Pi built-in
  hotkeys or hotkey conflicts. Those continue to call
  `runWithHiddenOverlay(() => openConfirm(...))` and surface "Save
  cancelled." on decline.
- No upstream pi-tui changes.

## Decisions

### Decision: split error state into `fieldErrors` and `flowError`

```ts
private fieldErrors: Map<EditorRowId, string> = new Map();
private flowError: string | undefined;
```

`fieldErrors` is the source of truth for inline rendering. Each
key is an `EditorRowId` (`"name" | "scope" | "provider" | "model"
| "thinking" | "tools" | "instructions" | "hotkey" | "buttons"`),
each value is the error message for that row.

`flowError` keeps the bottom-strip path for messages that aren't
tied to a single field — currently only "Save cancelled." after a
confirmation dialog decline.

The existing `this.error: string | undefined` field is removed.

### Decision: collect all failures in one validation pass

Refactor `validateRequired` and `validateForSave` to return a richer
result type:

```ts
type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors: ReadonlyMap<EditorRowId, string>;
      flowError?: string;
    };
```

`validateRequired` becomes:

```ts
private validateRequired(): ValidationResult {
  const errors = new Map<EditorRowId, string>();

  if (this.state.name.trim().length === 0) {
    errors.set("name", "Name is required.");
  }

  if (this.state.provider.length === 0) {
    errors.set("provider", "Provider is required.");
  }

  if (this.state.model.length === 0) {
    errors.set("model", "Model is required.");
  }

  return errors.size === 0
    ? { ok: true }
    : { ok: false, fieldErrors: errors };
}
```

Note the explicit split of the combined Provider/Model error into
two independent checks, each contributing its own row-tied error.

`validateForSave` collects errors from `validateRequired`, then
adds hotkey-parse errors and name-collision errors to the same
map (under "hotkey" and "name" respectively). The confirmation
flows for Pi built-in / conflict still resolve synchronously via
`openConfirm`; on decline they short-circuit with a flowError of
`"Save cancelled."`.

### Decision: clearing rules

```text
User input on row    → Errors cleared
─────────────────────────────────────────────────
name input           name
hotkey input         hotkey
scope change         name (scope might resolve a name collision)
provider change      provider, model (model is now stale)
model change         model
thinking change      —  (no thinking validation today)
tools change         —  (no tools validation today)
instructions edit    —  (no instructions validation today)
```

These rules are encoded in a small helper:

```ts
private clearFieldErrorsFor(row: EditorRowId): void {
  this.fieldErrors.delete(row);

  // Cross-field coupling:
  if (row === "scope")    this.fieldErrors.delete("name");
  if (row === "provider") this.fieldErrors.delete("model");
}
```

Each row's input handler calls `clearFieldErrorsFor(row)` after
applying the input. The helper is also called once at the start
of every Save/Test attempt to ensure the validator's results
reflect only the current pass:

```ts
private async runSaveOrTest(...) {
  this.fieldErrors.clear();
  this.flowError = undefined;
  // ...validator populates fieldErrors and possibly flowError
}
```

### Decision: inline render placement

Each row's existing render path appends one extra line when an
error is set for that row. The rendered line uses the `error`
colour (already used in the bottom strip) at the same 4-space
indentation other inline hints use, so error lines visually
co-exist with status hints.

For rows that already have inline hints (Thinking, Tools), the
error appears _after_ the existing hint. For rows without hints
(Name, Hotkey), the error is the only inline line. The dialog's
vertical layout grows by at most N lines where N is the number of
field errors; for a typical "Save with empty new preset" failure
that's 3 lines (Name, Provider, Model errors).

### Decision: keep flowError in the bottom strip

The bottom message strip (`renderMessages`) currently renders the
hotkey-reload notice and the (about-to-be-removed) `this.error`.
With the change:

```text
renderMessages():
  push hotkey-reload notice if relevant
  push this.flowError in `error` colour if set
```

`flowError` is rendered with the same indentation and colour the
old `this.error` used. The visual difference: nothing renders here
on a typical Save-with-empty-fields failure; the strip only fires
on confirmation-dialog declines. That's a strictly cleaner default.

### Decision: split the combined Provider+Model error

Today's `"Provider and model are required."` becomes two messages:

```text
"Provider is required."   →  attached to provider row
"Model is required."      →  attached to model row
```

When both are empty, both render. When only one is empty (the user
picked a provider but not a model), only that one renders. This is
both more precise inline and better at conveying _which_ field
needs attention.

## Risks / Trade-offs

- **[Risk]** Pre-existing tests assume `this.error` rendering in
  the bottom strip. → Mitigation: update affected tests as part of
  this change. The new contract is part of the spec.
- **[Risk]** Rows that gain error rendering grow vertically when
  errors are present, which can push the action-button row below
  the visible area in narrow-height terminals. → Accepted: pi-tui's
  overlay handles vertical scrolling; the user can Tab-cycle to
  the buttons row regardless of visible area, and the keyboard
  shortcut `^S Save` works from any focus state.
- **[Risk]** A user who doesn't notice an inline error and re-saves
  may read the same error twice. → Accepted: this is an
  improvement over the bottom-strip approach where the error is
  even further from the user's attention. Errors clear on field
  edit, so the user gets immediate positive feedback when fixing
  one.
- **[Trade-off]** Cross-field clearing (Scope → clears Name error,
  Provider → clears Model error) is helpful but potentially
  surprising — a user who saw "Name already exists in user scope",
  changed Scope to project, and saw the error disappear might
  think the change was accepted before pressing Save again. The
  alternative (errors persist until next Save) is worse, because
  it shows obviously stale state. The new behaviour communicates
  "we'll re-check on Save"; the user has to press Save to
  confirm. Net positive.
- **[Trade-off]** The `Map<EditorRowId, string>` allows only one
  error per row. A row that could fail two checks
  simultaneously (e.g. Name empty AND name-collision — which
  doesn't happen because empty can't collide) would have to pick
  one. Today's checks don't produce such overlaps; if they ever
  do, future work can extend the value to `string[]`.
