## Context

`surface-editor-validation-inline` introduced inline field-tied
errors via a `Map<EditorRowId, string>` rendered in `error` color
beneath the offending row. The same change kept the existing
`openConfirm`-based dialogs for hotkey conflicts (another preset
already claims this hotkey) and Pi-builtin shadows (this hotkey
matches a documented Pi built-in), so the editor today shows two
different presentations for two different kinds of "field
problem":

```text
Field problem                     Today's presentation
─────────────────────────────────────────────────────────────────
Name is required                  inline error (red, beneath row,
                                  blocks Save)
Provider is required              inline error (red, blocks Save)
Hotkey is malformed               inline error (red, blocks Save)
Name collides with another        inline error (red, blocks Save)
  preset

Hotkey shadows Pi built-in        modal confirm dialog
                                  (Save anyway? Yes/No)
Hotkey conflicts with another     modal confirm dialog
  preset                          (Save anyway? Yes/No)
```

The two confirm-dialog cases are functionally non-blocking warnings
— Pi's hotkey-conflict resolver silently skips conflicting bindings
on later-loaded presets, and the Pi-builtin shadow case is now
visible in the picker card after save (via the
`hotkeyShadowsBuiltin` flag added by
`unify-picker-status-and-shadow-flag`). Modal acknowledgment isn't
required for the system to behave correctly; it's a presentation
choice.

The user's design call: drop the modals entirely and surface both
conditions as inline warnings. Theme colors carry the attention-
grabbing weight; the saved status persists in the picker card for
discovery later. This change implements that.

## Goals / Non-Goals

**Goals:**

- Replace both modal confirms (Pi-builtin and other-preset
  conflict) with inline warnings beneath the Hotkey row.
- Keep "warning" semantically distinct from "error": warnings
  inform but do not block Save; errors continue to block.
- Use the theme's `warning` color (yellow) for warnings, `error`
  color (red) for errors. Both render in the same beneath-row
  position with the same indentation.
- Preserve existing field-clearing rules: typing into Hotkey
  clears the Hotkey diagnostic regardless of severity.
- Remove unused machinery the change strands: the
  `HOTKEY_SHADOWS_TITLE` / `HOTKEY_CONFLICT_TITLE` constants and
  the `"Save cancelled."` flow-error message (no decline path
  remains).

**Non-Goals:**

- No change to `LoadedPreset`'s shape, the picker card's
  rendering, or the load-time annotation pipeline. Those are
  the prerequisite `unify-picker-status-and-shadow-flag`'s scope.
- No new severity beyond `error` and `warning`. No "info"-level
  diagnostics in this change.
- No cross-field warning coupling. Warnings, like errors, are
  cleared by direct edits to the row; the existing scope→name
  and provider→model coupling stays for errors only.
- No change to the Save / Cancel / Test action contract beyond
  the warning-vs-error blocking distinction.
- No upstream pi-tui changes.

## Decisions

### Decision: generalize the diagnostic map to carry severity

```ts
type FieldDiagnostic = {
  severity: "error" | "warning";
  message: string;
};

private fieldDiagnostics: Map<EditorRowId, FieldDiagnostic> = new Map();
```

`fieldErrors` (the previous name) becomes `fieldDiagnostics`. The
shape is the same except each value gains a `severity`. Render
path branches on severity to choose color:

```ts
private renderFieldDiagnostic(row: EditorRowId): string | undefined {
  const diagnostic = this.fieldDiagnostics.get(row);
  if (!diagnostic) return undefined;

  const color = diagnostic.severity === "warning" ? "warning" : "error";

  return this.theme.fg(color, `    ${diagnostic.message}`);
}
```

`clearFieldErrorsFor` is renamed `clearFieldDiagnosticsFor` (or
similar) and clears regardless of severity — typing into Hotkey
removes whatever diagnostic was on Hotkey.

**Alternative considered: separate `fieldErrors` and
`fieldWarnings` maps.** Rejected — duplicates state, complicates
render and clearing logic, doesn't add anything over a single map
keyed by row with a severity-tagged value.

### Decision: warnings don't block Save

`ValidationResult` becomes:

```ts
type ValidationResult =
  | { ok: true; fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic> }
  | {
      ok: false;
      fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>;
      flowError?: string;
    };
```

Both variants now carry `fieldDiagnostics`. The validator decides
`ok` based on whether any **error**-severity diagnostic was
collected:

```ts
const hasError = [...fieldDiagnostics.values()].some(
  (d) => d.severity === "error",
);

return hasError
  ? { ok: false, fieldDiagnostics }
  : { ok: true, fieldDiagnostics };
```

`save()` proceeds only when `result.ok` is `true`. Warnings in the
`ok: true` map are still applied to `this.fieldDiagnostics` so
they render in the editor's next paint cycle — but the editor only
paints again if save fails (since a successful save closes the
editor). In practice: warnings are visible during the edit session,
the user presses Save, the warnings stay in the picker card via
the `hotkeyConflict` / `hotkeyShadowsBuiltin` flags after save
completes.

Wait — there's a subtle point here. If a warning is set during
Save's validation pass, the editor closes immediately on success,
so the user never sees the warning rendered. That's acceptable for
a single-shot Save flow because:

- The user already saw the warning _before_ pressing Save (the
  validation runs proactively as the user edits the Hotkey row →
  see next decision).
- The warning persists in the picker post-save via the flags.

The decision below makes the proactive piece explicit.

### Decision: warnings populate proactively, not only on Save

The user shouldn't have to press Save to discover that their
hotkey conflicts. The editor's existing `handleHotkeyInput` (or
equivalent) SHALL re-run hotkey-only validation after every
Hotkey edit and update the warning diagnostic immediately:

```ts
private recomputeHotkeyDiagnostic(): void {
  this.fieldDiagnostics.delete("hotkey");

  const hotkey = this.state.hotkey.trim();
  if (hotkey.length === 0) return;

  const parsed = parseHotkey(hotkey);
  if (!parsed.ok) {
    this.fieldDiagnostics.set("hotkey", {
      severity: "error",
      message: parsed.reason,
    });
    return;
  }

  if (isPiBuiltin(parsed.parsed)) {
    this.fieldDiagnostics.set("hotkey", {
      severity: "warning",
      message: `⚠ ${parsed.parsed.normalized} shadows a Pi built-in; saving will replace Pi's behavior for this key.`,
    });
    return;
  }

  const conflict = findConflictingPreset(
    parsed.parsed,
    this.allPresets,
    this.initialPreset?.name,
  );
  if (conflict) {
    this.fieldDiagnostics.set("hotkey", {
      severity: "warning",
      message: `⚠ ${parsed.parsed.normalized} is already used by preset "${conflict.name}"; this preset's binding will be skipped.`,
    });
    return;
  }
}
```

Called from the Hotkey row's input handler after every keystroke
(or on focus-leave; either works, called per-keystroke for
simplicity since it's cheap). The Save pipeline still runs the
same checks as a backstop, so a user who somehow saves without
ever editing Hotkey still sees the warning before the editor
closes if there's an error.

Both warnings can fire at the same time (Pi-builtin AND conflicts
another preset). The current code only sets one — the first
matching condition wins. Acceptable for v1; a future change could
combine the two messages.

### Decision: drop the "Save cancelled." flow message

Without confirm dialogs in the validate pipeline, no decline path
exists. The `flowError` field on the editor stays — it's still
useful for I/O-failure messages from `persist()` — but
`"Save cancelled."` is removed as a string, and the corresponding
test is deleted.

### Decision: warning prose

Two warning lines, each prefixed with `⚠ ` and ending with a
period, sentence-cased:

```text
"⚠ <normalized> shadows a Pi built-in; saving will replace Pi's
 behavior for this key."

"⚠ <normalized> is already used by preset \"<name>\"; this preset's
 binding will be skipped."
```

The `<normalized>` slot is the parsed-and-normalized hotkey form
(e.g. `Ctrl+Shift+1`). The second message names the conflicting
preset so the user can identify which existing binding they're
running into.

The semicolons split each warning into "what" + "consequence" so
the user can read either half independently. The "saving will
replace" / "this preset's binding will be skipped" phrasing
matches Pi's actual behavior (which we know from `hotkey-conflicts.ts`
and Pi's keybinding model).

## Risks / Trade-offs

- **[Risk]** Without a modal, a user who isn't paying attention
  could save a Pi-builtin-shadowing preset without consciously
  acknowledging it. → Mitigation: the `warning` color is
  attention-grabbing, the `⚠` glyph signals warnings, the picker
  card preserves the status post-save (via the prerequisite
  `unify-picker-status-and-shadow-flag`), and the user's binding
  is reversible — they can edit the preset to a different hotkey
  later.
- **[Risk]** The proactive recompute on every Hotkey keystroke
  could be expensive if `findConflictingPreset` is slow. →
  Mitigation: it's an O(n) walk over loaded presets; n is small
  (typical preset counts in single digits or low tens). If
  profiling shows a problem, debounce; not a v1 concern.
- **[Risk]** The combined Pi-builtin + conflict case currently
  shows only one warning (whichever check fired first). → Accepted
  for v1. Both conditions are still surfaced by the picker card
  via two separate flags after save. A future change can combine
  the two messages inline if user feedback requests it.
- **[Trade-off]** Dropping `"Save cancelled."` is a small spec
  change for a corner case. The tradeoff: no decline path
  produces it anymore, and pretending it could appear is
  confusing. The flow-error surface stays available for honest
  flow errors (I/O failures, persist conflicts, etc.).
- **[Trade-off]** Generalizing `fieldErrors` → `fieldDiagnostics`
  is a rename that touches every call site of the diagnostic map
  in `editor.ts`. Mechanical but wide. The new severity field
  pays for itself the moment a third severity (info, hint) is
  ever needed.
