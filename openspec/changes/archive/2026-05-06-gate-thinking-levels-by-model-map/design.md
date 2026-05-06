## Context

`pi-ai` 0.72.0 introduced `Model.thinkingLevelMap` — an optional
`Partial<Record<ModelThinkingLevel, string | null>>` field where
each pi thinking level maps to a provider-specific value, with
`null` marking the level as unsupported and missing keys meaning
"fall back to provider default". The pi-presets-plus extension's
`validThinkingLevels` helper currently inspects only
`model.reasoning === false` and is binary (returns either `["off"]`
or all six levels). It was written before `thinkingLevelMap`
existed and predates the precise capability signal that field now
provides.

Two surfaces consume `validThinkingLevels`:

1. The editor's Thinking row uses it to dim disabled radio entries
   and to drive `snapThinkingIfInvalid` when the user changes
   model/provider.
2. `effectiveThinkingLevel` (called from `apply()`) uses it to
   clamp a preset's declared level to `"off"` when the model can't
   honor it.

Both surfaces are already routed through this single helper, so
narrowing its return value naturally narrows both.

This extension targets users on a range of pi versions, including
some that bundle pi-ai versions older than 0.72.0. The change must
not crash or throw on a model whose `thinkingLevelMap` is `undefined`.

## Goals / Non-Goals

**Goals:**

- Read `thinkingLevelMap` (when present) so the editor's Thinking
  row reflects what each model actually supports rather than a
  blanket all-six.
- Remain forward- and backward-compatible: a model whose pi-ai
  version pre-dates `thinkingLevelMap` still shows levels through `"high"`
  exactly as pi-ai does today, with `"xhigh"` hidden unless explicitly mapped.
- Use one parser, one helper, one source of truth — no duplicated
  level-classification logic between the editor row and the apply-
  time clamp.

**Non-Goals:**

- Tools-row gating. `pi-ai`'s `Model<Api>` does not expose a
  "supports tools" flag in 0.72.0; the editor cannot reliably
  hide/disable the Tools row by capability. This change leaves the
  Tools row alone.
- Surface-level UX changes to the Thinking row (dim color, snap-to-
  off behavior, inline notice text). The dim affordance and snap
  logic already exist; this change only changes which levels they
  apply to.
- Any change to apply-time behavior beyond what naturally flows
  from a narrower `validThinkingLevels`. The existing clamp
  notification fires unchanged.
- New configuration, new persisted state, new public types.

## Decisions

### Decision: Mirror pi-ai's `getSupportedThinkingLevels` exactly

A level SHALL be considered valid for a reasoning model when:

1. For every level except `"xhigh"`: the level is valid unless
   `model.thinkingLevelMap?.[level] === null`. Undefined map or
   missing key → valid (fall through to provider defaults).
2. For `"xhigh"`: valid only when the map explicitly maps `"xhigh"`
   to a non-null value (i.e. `mapped !== undefined && mapped !== null`).

Non-reasoning models (`reasoning === false` or falsy) short-circuit
to `["off"]`.

This is a byte-for-byte reimplementation of pi-ai's
`getSupportedThinkingLevels(model)` in `@mariozechner/pi-ai`'s
`dist/models.js`. The rationale for the `"xhigh"` carve-out lives
in pi-ai: `"xhigh"` is not a real provider level — it is a pi-
specific ceiling that only exists when a model explicitly opts
in by mapping it (typically to the provider's `"max"` or
`"high"`). Treating it permissively would surface `"xhigh"` for
every reasoning model, contradicting pi's own level selector.

Picking any other semantics would make the editor's enabled set
diverge from what pi will actually accept at apply time, so we
defer to pi-ai as the source of truth and document the quirk
here.

### Decision: Backward compatibility for pre-`thinkingLevelMap` pi-ai

A model object with no `thinkingLevelMap` field at all — older
pi-ai bundles — falls through the permissive branch for every
level except `"xhigh"`, which is dropped. This is consistent
with pi-ai's own helper applied to the same model object, so the
extension and pi agree on the supported set regardless of pi-ai
version. Reasoning models on older bundles therefore expose five
levels (`off` … `high`) rather than six. The `reasoning === false`
short-circuit is unchanged.

### Decision: Keep the `model.reasoning === false` short-circuit

Even with permissive map parsing, `model.reasoning === false`
remains the dominant signal for non-reasoning models: those
models have no business showing any thinking level other than
`"off"`. The short-circuit returns `["off"]` early and skips map
inspection. This also mirrors how today's helper behaves and
avoids any edge case where a non-reasoning model's map happens
to declare a reasoning level.

### Decision: Defensive read of the new field

Access `thinkingLevelMap` via an optional-chained read (`model.thinkingLevelMap?.[level]`),
with explicit `=== null` checks for the unsupported sentinel.
This keeps the helper a single-pass `filter` and degrades to
"all levels valid" when the field is absent (the pre-0.72 case).

### Decision: Helper signature unchanged

`validThinkingLevels(model: Model<Api> | undefined): ThinkingLevel[]`
keeps its current signature. Only the body changes. `effectiveThinkingLevel`
keeps its current signature. The editor and apply-time call sites
require zero changes.

### Decision: Drop tools-row gating from this scope

`pi-ai/dist/types.d.ts` does not declare a tools-capability flag
on `Model<Api>` in 0.72.0. Models have `input` (text/image) and
`reasoning`, but no `tools`-supported boolean. We can revisit when
pi-ai exposes one. Hiding the row by heuristic would create a
worse UX (user sees the Tools row appear/disappear inconsistently
across models) than leaving it always visible.

## Risks / Trade-offs

- [Risk] A pi-ai version older than 0.72.0 ships models without
  `thinkingLevelMap`. → **Mitigation:** Defensive optional-chain
  read; absence of the field falls through to "off through high valid",
  preserving pi-ai's current selector behavior.

- [Risk] A model declares `thinkingLevelMap: {}` (xhigh excluded) (empty object). →
  **Mitigation:** Empty object means no lower level is explicitly null,
  so levels through `"high"` are valid while `"xhigh"` remains hidden because it is not explicitly mapped.

- [Risk] A model declares all six levels as `null`. → **Acceptable:**
  the helper returns `[]`. Editor disables every radio entry; the
  apply-time clamp falls through to `"off"`. This is unusual but
  not pathological — the apply-time notice already covers it.

- [Risk] A preset previously saved with a level that becomes
  invalid after a pi-ai upgrade. → **Mitigation:** Existing apply-
  time behavior already covers this — `effectiveThinkingLevel`
  clamps to `"off"` and emits a notification; the user can edit
  the preset to pick a valid level.

- [Trade-off] Permissive parsing means a model that declares
  _only_ `{"xhigh": "max"}` still surfaces all six radio entries
  in the editor. The user might expect strict ("only declared
  levels"), but pi-ai's own documentation reserves missing keys
  for "provider default" — strict would mis-represent that
  contract for lower levels. `"xhigh"` remains special because pi-ai requires an explicit non-null mapping before surfacing it. The dim affordance only fires for levels explicitly
  marked unsupported.

## Migration Plan

No data migration. The change is a single-helper update with no
storage or state implications. Roll forward by merging; rollback
is a one-commit revert. No user-facing announcement required —
behavior tightens for some models but never expands beyond what
the model itself declares supported.

## Open Questions

_None._
