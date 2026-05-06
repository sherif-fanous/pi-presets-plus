## Why

Pi 0.72.0 standardized `Model.thinkingLevelMap`, a per-model record
that maps each pi thinking level to a provider-specific value or
`null` when the level is unsupported. Today the extension's
`validThinkingLevels` only inspects `model.reasoning === false` and
returns either `["off"]` or all six levels — which means a
reasoning model that explicitly declares `{"off": null}` (and
several do) is still offered "off" in the editor, and a model that
declares only a subset like `{"xhigh": "max"}` is still offered all
six levels with no indication that, say, `low` may not behave as
expected.

This change reads `thinkingLevelMap` (when present) so the editor
and apply-time logic both reflect what the model actually supports,
while staying compatible with pi-ai versions that predate the
field.

## What Changes

- Update `validThinkingLevels(model)` to honor `thinkingLevelMap`
  with permissive semantics: when the map is present, levels through `"high"` are valid unless that level's value in the map is exactly `null`. `"xhigh"` is valid only when explicitly mapped to a non-null value, matching pi-ai's selector/helper behavior. Missing keys for lower levels remain valid (they fall back to provider defaults, per pi-ai's documentation of the field).
- Preserve the `model.reasoning === false` short-circuit
  (returns `["off"]`) — that capability check is still authoritative.
- Backward-compatibility: when a model has no `thinkingLevelMap`
  field at all (older pi-ai bundles), levels through `"high"` stay
  valid and `"xhigh"` drops off (same rule applied uniformly — no
  map means no explicit `xhigh` mapping). Access the field
  defensively (optional chaining) so the extension does not throw
  on pi-ai versions that lack it.
- Drop the tools-row gating idea from this scope. `pi-ai`'s
  `Model` type does not currently expose a "supports tools"
  capability flag, so there is no clean signal to drive UI
  hiding/disabling. Revisit if/when pi-ai adds one.
- Editor behavior carries over: `snapThinkingIfInvalid` continues
  to fire when the user changes provider/model and the previously
  selected level is no longer valid; the auto-snap target stays
  `"off"` and the existing inline notice text is reused.
- Apply-time `effectiveThinkingLevel` already routes through
  `validThinkingLevels`, so no further apply-time changes are
  needed beyond the helper update; the existing apply-time notice
  ("requested thinking:low for …. applied 'off' instead.") fires
  unchanged when a preset is loaded for a model whose map says the
  level is unsupported.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `preset-activation`: `validThinkingLevels` honors the model's
  `thinkingLevelMap` (permissive parsing) when present, and
  remains backward-compatible when absent. `effectiveThinkingLevel`
  inherits the new semantics through this helper.
- `preset-editor`: The Thinking row's enabled set narrows when the
  selected model's map declares a level as `null`; the disabled
  legend ("dimmed levels are unavailable for this model") fires
  for any model whose map omits or nulls some levels.

## Impact

- Touches: `src/activation/thinking.ts` (single-function update
  with a defensive read of the new field).
- Test impact: new tests for `validThinkingLevels` covering
  no-map, map-with-some-nulls, map-with-all-nulls,
  map-with-all-defined; editor tests for the dim-row and snap
  behavior under each shape.
- No storage or activation-state changes.
- No new pi-ai API consumed beyond a defensive read of an optional
  field; the extension keeps working on pre-0.72 pi installations
  where the field is undefined.
