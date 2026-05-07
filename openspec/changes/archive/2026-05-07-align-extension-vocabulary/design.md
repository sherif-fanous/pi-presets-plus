## Context

The extension speaks in two voices today. The custom preset
editor (`src/ui/editor.ts`) renders Title-Case row labels
(`Name`, `Scope`, `Provider`, `Model`, `Thinking`, `Tools`,
`Prompt`, `Hotkey`, `Actions`) and uses sentence-case prose with
terminal periods (`Hotkey changed: ctrl+1 → ctrl+2.`, `Save
cancelled.`). Every other surface — `/presets status`,
`/presets clear`, `/presets reload`, the `--preset` flag, hotkey
activation messages, session restore, store-layer warnings,
router error messages, apply-time notices — uses lowercase
labels (`preset:`, `scope:`) and lowercase fragments without
terminal punctuation.

The mismatch is jarring when a user moves between the editor
and any other surface, and it makes the extension feel
half-finished compared to pi itself.

This change does one editorial pass across the entire
extension so every user-visible string follows the editor's
voice. It also codifies the convention in `AGENTS.md` so
future code stays aligned.

It is sequenced **last** among the five concurrent changes. This
is a deliberate choice: by landing after
`route-picker-info-output-through-overlay`,
`surface-picker-activation-errors-in-overlay`,
`prompt-reload-on-hotkey-mutation`, and
`gate-thinking-levels-by-model-map`, this change scrubs every
user-facing string introduced by those four changes in one
editorial pass alongside the existing strings. The four
concurrent changes intentionally write their new strings in the
surrounding (old) voice during their own implementation — trying
to pre-emptively follow a convention that has not yet been
documented in `AGENTS.md` would create cross-change coordination
overhead. The cleanup happens here, with one set of eyes and one
shared labels module, so the result is uniform.

## Goals / Non-Goals

**Goals:**

- Adopt one consistent voice across every user-facing string in
  the extension: Title-Case labels with trailing colon (`Preset:`,
  `Baseline model:`, `Scope:`); sentence-case English with
  terminal periods (`Restored your previous settings.`).
- Use proper-noun casing for `Pi`, `/reload`, and `/presets`
  references in prose.
- Update every test that asserts on these strings in lockstep.
- Codify the convention as a one-paragraph subsection in
  `AGENTS.md` so future code stays aligned without requiring a
  reviewer to remember the rules.
- Centralize the small handful of repeated label fragments that
  show up in multiple places (e.g. `model:` / `thinking level:`
  / `tools:` row labels in status and clear) so a future tweak
  edits one place.

**Non-Goals:**

- Changing any logic, decision, or output surface. The change
  is editorial — the _which strings appear when_ is unchanged —
  but longer canonical labels such as `Thinking level` may widen
  columns so values still align.
- New strings or new surfaces. Strings introduced for new
  features by the four other concurrent changes are scrubbed
  in this change but not added by it.
- Changing what `ctx.ui.notify` or any overlay says
  _semantically_. Only the surface form (capitalization,
  punctuation, vocabulary) shifts.
- Localization / i18n. The extension is English-only today and
  this change does not introduce a translation layer.

## Decisions

### Decision: Single shared style guide encoded in AGENTS.md

`AGENTS.md` already documents architecture, API shape, and
documentation conventions. Add a "User-facing strings" subsection
under the "Code conventions" heading codifying:

- Labels in dialogs and rows: Title-Case with trailing colon
  (`Preset:`, `Scope:`, `Baseline model:`).
- Prose in notifications and dialog bodies: sentence-case with
  terminal periods. Each sentence is a complete thought.
- Names of Pi commands stay literal (`/presets`, `/reload`,
  `/model`).
- The product name "Pi" is capitalized when used as a noun in
  prose; lowercased when referring to the `pi` CLI binary or
  module names.
- Action verbs in button rows are Title-Case nouns or imperatives
  (`Save`, `Cancel`, `Test (apply temporarily)`).
- Avoid trailing dots in single-line labels; use them in
  multi-sentence prose.

### Decision: Centralize repeated label sets and dialog titles

The status and clear formatters both speak in field labels —
`model`, `thinking level`, `tools` — with slight wording
variations. After this change, both adopt the editor's `Model`,
`Thinking level`, `Tools` (capitalization aligned). To avoid
drift, extract the field-label set into a small shared
`src/ui/labels.ts` (or extend `src/ui/frame.ts`) so:

- `STATUS_LABELS` (status formatter)
- `FIELD_LABELS` (clear summary)
- The editor's row labels
- The picker card's field labels

all derive from one source of truth where they overlap.

The shared module SHALL also hold dialog titles introduced by
the four concurrent changes:

- `STATUS_DIALOG_TITLE`, `CLEAR_DIALOG_TITLE` (from
  `route-picker-info-output-through-overlay`)
- `ACTIVATION_FAILED_TITLE` (from
  `surface-picker-activation-errors-in-overlay`)
- `RELOAD_PROMPT_TITLE` (from `prompt-reload-on-hotkey-mutation`)
- `MOVE_PRESET_TITLE`, `HOTKEY_SHADOWS_TITLE`,
  `HOTKEY_CONFLICT_TITLE` (existing editor confirm overlays)

This matters specifically because two of those titles
(`Preset Status` and `Preset cleared`) appear both as overlay
titles (picker invocation) and as the leading line of the same
formatter's notify output (prompt invocation). One source of
truth keeps them aligned.

Where the surfaces use different label phrases (`Baseline
model:` vs `Model:`), the table records the surface's specific
label but in the same case convention.

### Decision: Centralize the failure-reason vocabulary and overlay strings

`apply()` (post-`surface-picker-activation-errors-in-overlay`)
emits four refusal strings via the `failureReason(kind, ...)`
helper. This change rewrites those four strings to the editor's
voice once, in one helper. No duplication anywhere.

Likewise, `formatHotkeyReloadNotice` already centralizes the
hotkey-change inline notice text; this change rewrites that
function's strings once.

The `Reload Pi?` prompt body text introduced by
`prompt-reload-on-hotkey-mutation` is short and lives in one
site (the `confirmReload` helper); this change rewrites it once
there. The `Activation failed` dialog body is sourced from
`failureReason`, so it inherits the centralized rewrite.

The net effect is that every user-facing string introduced by
the four concurrent changes flows through at most one of:
(a) the shared labels module, (b) the `failureReason` helper,
(c) the `formatHotkeyReloadNotice` formatter, or
(d) the `confirmReload` helper. No string appears more than
once in the codebase after this change lands.

### Decision: Test impact strategy

Every golden-style test that asserts on a status formatter
output, clear summary output, or specific notification message
must update in lockstep. Where reasonable, tests should assert
on a small key fragment ("Preset:" rather than the full
multi-line string) so future small string tweaks don't ripple
through dozens of tests. Where tests intentionally cover the
whole rendered block, the goldens are updated to the new voice
in the same commit.

### Decision: Single-commit landing

Vocabulary alignment is a wide but mechanical change. Splitting
it across multiple commits leaves the tree in inconsistent voice
between commits. This change SHALL land as one commit (or a
small ordered series — convention + helpers first, sites second
— but never with the convention added and the sites still in old
voice in the same merged tree).

## Risks / Trade-offs

- [Risk] The four concurrent changes introduce new strings that
  follow the old voice during their implementation. → **Acceptable**
  by design: this change scrubs them. The lint-style guardrail
  test added in this change prevents regression after the scrub.

- [Risk] Wide diff. Many test goldens update, many notify
  strings update. Reviewer fatigue is real. → **Mitigation:**
  The change is mechanical, scoped to user-facing strings only,
  and each diff hunk is trivially verifiable. PR description
  includes a short table mapping old → new for each non-trivial
  rewrite.

- [Risk] Two new strings introduced after this change lands
  drift to the old voice. → **Mitigation:** AGENTS.md captures
  the convention; reviewers enforce. There's no static linter
  for English voice, so this remains a soft enforcement.

- [Risk] Tests asserting on full string blocks miss subtle
  changes (e.g. an extra space). → **Mitigation:** Goldens are
  whitespace-sensitive; the test runner catches diffs.
  Where appropriate, tests assert on key fragments rather than
  full blocks for resilience to future tweaks.

- [Risk] User automation that greps the extension's
  notifications might break. → **Acceptable:** The extension's
  notifications are not a stable API. There is no documented
  contract that they remain string-stable. CHANGELOG entry
  notes the textual changes for transparency.

- [Trade-off] The convention permits some flexibility (label
  capitalization is enforced, comma-vs-semicolon in compound
  sentences is not). The point is consistency of the high-impact
  signals (case, punctuation, proper nouns), not pedantry.

## Migration Plan

No data migration. Roll forward by merging the single commit;
rollback is a revert. CHANGELOG entry summarizes the change
("internal: align user-facing strings to a single voice; no
behavior change").

## Open Questions

- Should we add a `/presets debug` mode that surfaces the raw
  internal failure `kind` values for power users? Not in
  scope; tracked separately.
