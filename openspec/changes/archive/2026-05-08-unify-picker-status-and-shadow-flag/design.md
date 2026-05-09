## Context

The picker card's `Status:` row is rendered in `widgets.ts`'s
`PresetCardComponent.render()`. Each row is fed by an independent
flag or computation on the `LoadedPreset`:

```text
Source                                  Status row
──────────────────────────────────────────────────────────────────
clampWarning: true              →  "⚠ Thinking will be clamped."
hotkeyConflict: true            →  "⚠ Hotkey conflict."
unavailable: "no-key"           →  "This preset's provider has no
                                    API key configured."
unavailable: "no-model"         →  "This preset's model is no
                                    longer available."
driftReasons (when active)      →  "⚠ Dirty — <reasons> differ"
```

Three status rows already use the `⚠ ` prefix; two don't. The two
that don't were rewritten by `polish-editor-picker-copy` and the
glyph dropped accidentally — the long-form copy was the focus, not
the visual treatment.

Separately, the `LoadedPreset` carries no flag indicating that its
hotkey shadows a Pi built-in. That kind of shadowing is detected
in two places:

- **At edit-time**, `validateForSave()` calls `isPiBuiltin(parsed)`
  and opens a confirmation dialog. After the user confirms, no
  flag is persisted.
- **At runtime / load time**, no detection currently runs.

The hotkey-conflict pipeline (`hotkey-conflicts.ts`) already
computes a similar flag (`hotkeyConflict`) at load time by walking
every loaded preset's parsed hotkey. The same pipeline is the
natural home for `hotkeyShadowsBuiltin`.

## Goals / Non-Goals

**Goals:**

- Restore the `⚠ ` glyph on the two availability-status messages
  so every Status row in the picker card uses the same visual
  treatment.
- Add a new `hotkeyShadowsBuiltin?: true` flag on `LoadedPreset`
  that the picker card can render as a Status row, so the
  shadowing situation is visible after save (not only during the
  edit confirm).
- Compute the flag at load time, not at edit time, so it tracks
  the saved state across sessions and can never go stale via a
  forgotten "edit but didn't save" flow.
- Render the flag through the existing Status-row machinery: same
  label, same `warning` color, same `⚠ ` glyph convention.

**Non-Goals:**

- No change to the editor's existing Pi-builtin-shadow confirm
  dialog. That's the subject of the follow-up
  `inline-hotkey-warnings` change.
- No change to the wording of the existing availability messages
  beyond the glyph prefix.
- No "harmonize lengths" pass on Status messages — the user has
  explicitly approved the current copy.
- No new validation in the editor; this change is purely
  load-time + render.
- No upstream pi-tui changes.
- No re-architecting of `hotkey-conflicts.ts` beyond adding the
  parallel flag computation.

## Decisions

### Decision: glyph prefix is mechanical

Two cases of `formatAvailabilityStatus` rewrite their return values:

```ts
case "no-key":
  return "⚠ This preset's provider has no API key configured.";
case "no-model":
  return "⚠ This preset's model is no longer available.";
```

The picker card's existing render path already wraps the result in
`warning` color via `theme.fg("warning", availabilityStatus)`, so
the `⚠` lands in the warning color naturally — no new theme
plumbing.

### Decision: flag computation lives next to `hotkeyConflict`

`hotkey-conflicts.ts`'s `annotateAndAnalyzeHotkeys` already iterates
every loaded preset's parsed hotkey. Adding the Pi-builtin check is
a one-line addition inside the existing loop:

```ts
for (const preset of presets) {
  preset.hotkeyConflict = undefined;
  preset.hotkeyShadowsBuiltin = undefined; // ← new

  const { hotkey } = preset;
  if (!hotkey) continue;

  const parsed = parseHotkey(hotkey);
  if (!parsed.ok) {
    /* invalid */ continue;
  }

  if (isPiBuiltin(parsed.parsed)) {
    // ← new
    preset.hotkeyShadowsBuiltin = true;
  }

  // ...existing conflict-claim logic...
}
```

`isPiBuiltin` is already imported in the editor's hotkey-input
module; re-importing it here is fine.

The clear-then-recompute pattern matches `hotkeyConflict`'s
existing behavior so stale annotations from a prior load can never
persist (e.g. a preset whose hotkey was changed in another
session).

**Alternative considered: compute the flag in the editor's
`validateForSave` and persist it on the saved file.** Rejected:
the file format is the source of truth for _user intent_; load-
time annotations carry derived state. Persisting the flag would
make the file format mirror Pi's built-in list, which can change
between Pi versions, creating staleness. Computing at load time
keeps the file lean and the derivation honest.

### Decision: render uses the existing Status-row machinery

`widgets.ts` already has a small ladder of `if (...) lines.push(
this.renderField(STATUS_LABEL, this.theme.fg("warning", "⚠ ..."))
);` for each warning condition. Adding a new condition for
`hotkeyShadowsBuiltin` is a fourth `if` block in that ladder,
placed alongside the existing `hotkeyConflict` block (since they
describe the same row's situation):

```ts
if (this.loadedPreset.hotkeyShadowsBuiltin === true) {
  lines.push(
    this.renderField(
      `${STATUS_LABEL}:`,
      this.theme.fg("warning", "⚠ Hotkey shadows a Pi built-in."),
    ),
  );
}
```

If a preset both `hotkeyConflict` AND `hotkeyShadowsBuiltin` (e.g.
the user set a hotkey that both conflicts with another preset AND
matches a Pi built-in), both Status rows render. That's correct —
both situations are independently true and worth surfacing.

### Decision: copy for the new Status row

Wording: `"⚠ Hotkey shadows a Pi built-in."`

Reasoning:

- Short fragment, matches the existing `⚠ Hotkey conflict.` and
  `⚠ Thinking will be clamped.` style.
- "Shadows" is consistent with the existing
  `HOTKEY_SHADOWS_TITLE` constant the editor's confirm dialog
  uses, so the editor and picker speak the same vocabulary about
  the same condition.
- Sentence-cased with a terminal period, matching the project's
  user-facing string conventions.

## Risks / Trade-offs

- **[Risk]** Pre-existing tests asserting on the no-glyph
  availability copy will fail. → Mitigation: update those tests in
  the same change. The new copy is the contract.
- **[Risk]** `hotkeyShadowsBuiltin` could disagree with the
  editor's confirm dialog if `isPiBuiltin`'s implementation drifts
  between the two call sites. → Mitigation: there's only one
  `isPiBuiltin` function, called from both places. Same logic, no
  drift surface.
- **[Risk]** A new field on `LoadedPreset` is a public API surface
  expansion. → Acceptable: the field is `?: true | undefined`,
  optional, clear-documented, parallel to the existing
  `hotkeyConflict`. Consumers that don't care simply ignore it.
- **[Trade-off]** Computing the flag at load time means a preset
  that previously shadowed a Pi built-in but no longer does (because
  Pi removed the built-in in a new version) will silently lose the
  flag at the next load. That's the right behavior — the flag
  reflects the _current_ truth — but worth noting.
- **[Trade-off]** A preset can stack multiple Status rows
  simultaneously (e.g. clamp + conflict + shadow + availability =
  4 rows). The picker card grows vertically. Acceptable: the rows
  are independent observations, and a preset that triggers all
  four genuinely deserves the visibility.
