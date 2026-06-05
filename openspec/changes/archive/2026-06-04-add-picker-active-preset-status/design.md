## Context

The preset picker (`src/ui/picker.ts`) renders a bordered dialog whose
chrome is assembled in a fixed order: top border (carrying the
`Presets Plus` title and `Scope:` label), filter input row, a rule, the
scrollable list body, a rule, the footer hint row, and the bottom
border. The active preset is signaled only inside the list, via a green
dot and accent highlight on the matching card (`packList`, using
`samePresetIdentity(active, preset)`).

Because that signal lives inside the list, it disappears whenever the
active preset is scrolled, filtered, or scoped out of the visible
region. On open, the picker can therefore paint with no active signal
anywhere, implying no preset is active — contradicting the Pi footer,
which always names the active preset. The active preset's identity comes
from `this.session.current()`, which `packList` already reads.

This change adds an always-visible identity signal without touching
picker state, cursor/selection behavior, scope/filter logic, or storage.

## Goals / Non-Goals

**Goals:**

- Guarantee the picker never implies "no preset active" when one is.
- Make the active-preset signal invariant under focus mode, scope
  filter, filter query, scroll, and reorder.
- Keep the change confined to the render layer.

**Non-Goals:**

- No cursor/selection changes (no cursor-on-active, no scroll-to-active).
- No pinning the active preset to the top of the list.
- No drift/`(modified)` surfacing in the row — drift stays the card's job.
- No changes to `picker-state.ts`, ranking/scope logic, or storage.

## Decisions

**Dedicated line, not the bordered header.** The active preset name is
user-controlled and unbounded; the top border is fixed-width chrome that
already arbitrates between the title and the `Scope:` label via
`padToWidth(..., "─")`. Wedging a third, variable-length zone onto the
border makes the name the first casualty of width pressure — the
opposite of the intent. A dedicated row gives the name the full interior
width and a graceful middle-ellipsis fallback.
*Alternative considered:* fold `Active:` into the top border — rejected
because long names (e.g. `ifanous-anthropic-claude-opus-4-8`) truncate
before the title/scope and defeat the feature.

**Permanent row (renders `Active: none` when nothing is active).** A
conditional row that vanishes when nothing is active reintroduces the
original ambiguity (absence of the row reads as "nothing active," same
as a narrow terminal or a render glitch) and causes layout shift when
activating/clearing. A permanent row keeps layout stable and makes the
empty state explicit.
*Alternative considered:* show the row only when a preset is active —
rejected for the ambiguity and layout-jump reasons above.

**Name plus scope, no drift echo.** The row's intent is to notify which
preset is active, so it shows the preset name with a `dim` scope suffix
(`(User)` / `(Project)`). The scope suffix is required because names are
only validated as non-empty and may collide across scopes; without it the
always-visible row would be less identifying than the in-list dot, which
matches on name + scope. Drift, however, already has a single source of
truth (the in-list card and its drift reasons), so the row does NOT echo
`(modified)`.
*Alternative considered:* name only — rejected because same-named
presets across scopes render identically. *Alternative considered:*
append `(modified)` on drift — rejected to keep one source of truth for
drift.

**Dim `none` sentinel.** When no preset is active the row reads
`Active: none` with `none` in `dim`. Because a preset may legally be
named `none`, the `dim` styling (plus the absence of a scope suffix)
keeps the no-active sentinel visually distinct from an active preset that
happens to be named `none`.

**Complements, does not replace, the in-list dot.** The dot is the
in-list locator (which row is active) and the row is the always-visible
identity (what is active). They answer different questions and degrade
together: when the dot can't be shown (off-screen/filtered/scoped out),
the row still carries the truth.

**Placement in the render assembly.** The row renders on its own line
between the top border and the filter input row, so it sits at the top
of the chrome and is never part of the scrollable body. The chrome
line-budget tally (the comment enumerating chrome lines near the top of
`picker.ts`) must be incremented to account for the new line.

## Risks / Trade-offs

- [Costs one row of vertical chrome] → Accepted; the line-budget tally is
  updated so the list body sizing stays correct. The honesty guarantee is
  worth one row.
- [Long names could still overflow a full line] → Mitigated by
  middle-ellipsis so the meaningful prefix and suffix survive.
- [Row could drift out of sync with the in-list dot] → Both derive from
  the same `this.session.current()` value, so they cannot disagree about
  which preset is active.
