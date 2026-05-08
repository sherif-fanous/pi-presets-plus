## Context

The two UI surfaces in this package (`preset-editor` and
`preset-picker`) have evolved through nine archived OpenSpec changes.
Several string and styling decisions made early in that sequence have
since fallen behind the project's current conventions
(`AGENTS.md`'s "User-facing strings" section), and one decision in the
most recent change (the two-line editor footer) was a conservative
default that turns out not to be necessary.

This change is purely cosmetic in scope. It does not change behavior,
schema, or public APIs. The point is to reduce the number of small
"this string reads oddly" / "why is this dim?" papercuts the editor
and picker have accumulated.

## Goals / Non-Goals

**Goals:**

- Bring all six target strings/styles into alignment with current
  project conventions (sentence-case prose with terminal periods,
  arrow-symbol movement keys, label-vs-value color contrast on the
  picker card).
- Make the dimmed-levels hint distinguish the two cases it applies
  to (no-thinking-at-all vs partial level support) so the wording
  is true regardless of which model is selected.
- Keep all changes additive in their effect on layout: no row is
  added or removed, no row gains a new render branch beyond what is
  already conditional. The dialog's vertical real estate stays
  identical.

**Non-Goals:**

- No new surfaces, no new keyboard shortcuts, no new validation.
  Each is its own follow-up change (`add-editor-row-help-overlay`,
  `surface-editor-validation-inline`).
- No re-arrangement of the editor's row order.
- No changes to error or notification copy outside the two
  picker-card availability messages.
- No upstream pi-tui changes.

## Decisions

### Decision: collapse the footer to a single line

`improve-editor-input-ux` introduced a two-line footer to safely
restore the navigation tokens (Tab/↑↓ Move, ←/→ Change, Space Toggle,
Enter Action) alongside the new shortcut tokens (^S Save, ^T Test,
Esc Cancel). With `Tab` replaced by `⇥`, the combined single-line
form fits comfortably inside any terminal ≥ 90 columns, and pi-tui's
frame handles wrap gracefully on narrower widths. The two-line
layout cost a vertical row of dialog space for no real benefit.

```
Today  (two lines):                      88 chars + 33 chars
   Tab/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action
   ^S Save · ^T Test · Esc Cancel

Single line, with ⇥ for Tab:             88 chars
   ⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · ^S Save · ^T Test · Esc Cancel
```

When the test callback is unwired, the line drops `· ^T Test` (78
chars total).

The new `renderFooterHint()` returns a single `string`. The two-line
form is removed entirely.

### Decision: branch the dimmed-levels hint on model.reasoning

`renderThinkingRowsForState(theme, state, model, focused)` already
has `model` in scope. Inside the `valid.length < THINKING_LEVELS.length`
guard, branch on whether the model supports thinking at all:

```ts
if (valid.length < THINKING_LEVELS.length) {
  const message =
    model?.reasoning === false
      ? "This model does not support thinking."
      : "Dimmed levels are unavailable for this model.";

  lines.push(theme.fg("dim", `    ${message}`));
}
```

This re-uses the same dim color, same indentation, same line
position — only the copy switches. The two cases are mutually
exclusive and exhaustive inside the dimmed branch:

- A non-reasoning model has only `"off"` valid → 5 levels are
  dimmed → the branch fires → message reads
  `"This model does not support thinking."`.
- A reasoning model with at least one level explicitly nulled in
  `thinkingLevelMap` (or with `xhigh` not explicitly mapped) has
  fewer than 6 valid levels → the branch fires → message reads
  `"Dimmed levels are unavailable for this model."`.
- An undefined `model` (no model selected yet) returns the full
  set of levels from `validThinkingLevels` → `valid.length ===
THINKING_LEVELS.length` → the dimmed branch does NOT fire →
  no hint is rendered. This is correct: with no model selected,
  every level visually appears available, and there is nothing to
  warn about.

### Decision: drop muted from Scope and Model picker values, leave labels muted

Audit of `widgets.ts` field rendering:

```
Field        Label     Value
─────────────────────────────────
Scope        muted     muted        ← change to default
Model        muted     muted        ← change to default
Thinking     muted     thinking-X
Tools        muted     default
Prompt       muted     default
Status       muted     warning
Drift        muted     warning
Shadowing    muted     dim
```

Scope and Model are the only fields with no label-vs-value contrast.
Dropping the `theme.fg("muted", ...)` wrapper around their values
restores the contrast already established by the other six fields.
Labels stay muted so the field-name column reads as muted metadata
across the entire card.

This is a one-line edit per field — replace
`this.theme.fg("muted", formatScopeValue(loadedPreset))` with
`formatScopeValue(loadedPreset)` directly, similarly for Model.

### Decision: rewrite availability-status copy in full sentences

Before:

```
"Unavailable — missing API key."
"Unavailable — model not found."
```

After:

```
"This preset's provider has no API key configured."
"This preset's model is no longer available."
```

Reasons for the rewrite:

- The picker card already shows `Status:` as the label and `⚠` as
  the glyph; the redundant `Unavailable —` prefix in the body is
  noise.
- "missing API key" and "model not found" are developer-y fragments;
  the rewritten lines are user-facing complete sentences naming the
  affected entity ("this preset's provider", "this preset's model")
  and the consequence ("no API key configured", "no longer
  available").
- The "no longer" wording in the model line implicitly tells the
  user "this used to work; something changed", helping them
  diagnose without saying "registry" (developer jargon).

`formatAvailabilityStatus()` in `widgets.ts` is the single source
of truth for these strings, so the rewrite is two `case` arms.

### Decision: keep the `inherits` form of the session hint

Both `inherit` and `inherits` work grammatically. `inherits` (third-
person singular) reads as a complete sentence ("Session inherits …")
even without the colon. `inherit` reads as a definitional gloss or
imperative ("[meaning] inherit ..."). The codebase's existing
`Session: <list>` pattern puts a noun phrase after the colon; both
verb forms break that pattern equally, so neither is "more
consistent".

`inherits` is the marginally tighter reading and is the chosen form.

## Risks / Trade-offs

- **[Risk]** A terminal narrower than ~90 columns will visually wrap
  the single-line footer. → Accepted: pi-tui's frame handles wrap;
  the user sees the same content, just folded over two physical
  rows. The vast majority of terminals are wider.
- **[Risk]** Tests currently asserting on the two-line footer or on
  the old availability strings will fail. → Mitigation: update the
  affected tests as part of this change. The new wording is part of
  the contract.
- **[Risk]** The branched dimmed-levels copy makes one more decision
  inside `renderThinkingRowsForState`, which is now exported and
  pure. → Mitigation: the branch is on a single boolean
  (`model?.reasoning === false`), trivially testable in isolation.
- **[Trade-off]** The "no model selected" case is invisible in the
  dimmed-levels hint by construction — `validThinkingLevels(undefined)`
  returns all 6 levels, so the dimmed branch never fires when no
  model is selected. This is a happy accident: there is genuinely
  nothing to warn about until the user picks a provider/model.
  Documented so future contributors do not "fix" the missing branch.
