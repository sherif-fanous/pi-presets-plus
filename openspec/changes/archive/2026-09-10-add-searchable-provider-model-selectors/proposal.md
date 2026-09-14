## Why

Choosing a provider and then a model can require hundreds of arrow presses.
Searchable selectors let users find models by name and version without stepping
through the registry.

## What Changes

- Open a searchable selector with Enter on the Provider or Model row while
  retaining left/right cycling.
- Filter providers by identifier and models by identifier or display name,
  supporting queries such as `opus 5` across separators.
- Restrict model results to the selected provider and retain selectable models
  marked `(no key)`.
- Confirm a provider with its first registry model selected, then return to the
  form without automatically opening model selection.
- Keep browsing separate from selection: cancellation preserves the draft, and
  confirmation restores focus to the originating row.
- Add contextual hints and tests for search, selection, cancellation, and
  dependent field updates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-editor`: Add searchable provider and model selection with explicit
  keyboard, ranking, confirmation, and cancellation behavior.

## Impact

The editor, provider/model rows, selection UI, and editor tests will change.
Existing draft transitions remain responsible for model defaults and
thinking-level adjustments. Preset storage, activation behavior, and public
commands stay unchanged. No new dependency is expected.
