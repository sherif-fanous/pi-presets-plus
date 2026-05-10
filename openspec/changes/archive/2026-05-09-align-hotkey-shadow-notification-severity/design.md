## Context

The `preset-shortcuts` spec was written when conflict-between-presets
and Pi-builtin-shadow were modelled as two semantically different
events:

- **Conflict** = "your two presets fight; one binding loses
  silently." Treated as a problem the user should fix.
- **Shadow** = "your preset takes priority over a Pi built-in by
  design." Treated as a successful registration with informational
  framing.

`ctx.ui.notify(..., "warning")` for conflicts and `ctx.ui.notify
(..., "info")` for shadows encoded that distinction. In Pi's
default theme `warning` renders yellow with a `Warning:` prefix;
`info` renders dim with no prefix.

QA against the v0.1.1 release surfaced the inconsistency from the
user's perspective: the two conditions look like one phenomenon
("hotkey collision; one side wins"), and the visual asymmetry reads
as accidental rather than designed.

## Goals / Non-Goals

**Goals:**

- Both collision-style notifications (preset-vs-preset conflict and
  preset-vs-builtin shadow) emerge with the same severity tier and
  the same visual treatment.
- Preserve the existing notification text. The change is a
  severity bump, not a copy edit.
- Keep the spec change minimal: one MODIFIED requirement on
  `preset-shortcuts` updating "info-level" → "warning-level".

**Non-Goals:**

- Re-litigating whether the shadow condition deserves a notification
  at all. It does — the user needs to know at session start.
- Changing the `LoadedPreset.hotkeyShadowsBuiltin` annotation, the
  picker's inline shadow indicator, or the editor's pre-save
  shadow warning. Those surfaces are unaffected.
- Changing the conflict notification severity (already warning).

## Decisions

### D1: Promote shadow notification to `warning` severity (chosen)

Both the shadow and conflict notifications fire at session start
under nearly identical preconditions (a hotkey collides with
something else; one binding is the winner). Treat them as one
class of event and use the higher severity tier so the user notices
both with equal weight.

**Alternatives considered:**

- _Keep severity at `info` but add a "Note:" / "Info:" prefix to
  the message text._ Rejected: the inconsistency the user reported
  is the _severity_ tier, not just the prefix. Bumping severity
  fixes both the prefix problem (Pi's theme adds `Warning:` for
  warning-level notifications) and the visual color/dim mismatch
  in one move. Adding a manual prefix to an info notification
  would partially close the gap and leave the color difference.
- _Keep severity at `info` and accept the asymmetry._ Rejected:
  the asymmetry is what triggered the change. The semantic
  argument ("shadow = informational") is defensible but loses to
  the user-experience argument ("shadow = a thing the user should
  notice"). The user reading the warning learns nothing useful
  from the lower tier.
- _Demote conflict to `info` so both share the lower tier._
  Rejected: a preset-vs-preset conflict actively drops a binding
  the user declared. Demoting that to `info` makes a real config
  problem easier to miss. The right direction is to elevate the
  shadow, not demote the conflict.

### D2: Notification copy stays unchanged

The current text — `Preset "<name>" hotkey "<chord>" shadows a Pi
built-in. The preset binding will take precedence.` — accurately
describes the condition and the resolution. No edit needed.

**Alternatives considered:**

- _Add a "Warning:" prefix manually to the message string._
  Rejected: Pi's notification theme already adds the severity
  prefix at render time. Adding a manual prefix in the source
  string would double-prefix the rendered notification.

### D3: Tests update narrowly

`tests/hotkey-registry.test.ts` is the one file that may assert on
the severity argument of the shadow notification's `notify` call.
Update the assertion in place; no new test needed because the
existing scenario already covers the shadow path.

**Alternatives considered:**

- _Add a fresh test asserting both shadow and conflict use
  `warning`._ Worth doing if the test file does not already cover
  conflict severity. Quick check in implementation; add a small
  "both collision conditions are warning-level" test if missing.

## Risks / Trade-offs

- **Risk:** Users who configured a preset that shadows a Pi built-in
  intentionally (e.g., overriding `ctrl+l` because they don't use
  the model picker that way) will now see a warning where they
  previously saw an informational note. → **Mitigation:** the text
  still ends with "The preset binding will take precedence,"
  which makes clear the configuration is honored. The tier change
  reads as "you should know this is happening," not "this is
  broken." Acceptable.

- **Trade-off:** The `info` tier loses one of its two existing
  consumers in `bindForSession` (the shadow path). The remaining
  `info` consumer in this module is — none, after this change.
  That's not a loss; the absence simply reflects that
  `bindForSession` only emits _collision_ notifications, and both
  collisions are now warning-level. The `info` tier is still used
  elsewhere in the package (`apply.ts` for the thinking-level
  clamp, `commands/presets/reload.ts` for the reload summary,
  `commands/presets/clear.ts` for the clear summary, and several
  others), so the tier itself remains relevant.
