## Why

Code quality reviews found two areas where the current design can lose data or accumulate fragile control flow. Storage mutations can rewrite a preset file after an incomplete load, scope moves are coordinated by the editor without recovery, and the picker repairs variable-height layout through repeated render-time correction.

## What Changes

- Make preset files read-only for mutation when the complete file cannot be loaded safely.
- Add a storage-owned cross-scope preset move with validation before writes and best-effort destination rollback when source removal fails.
- Replace the picker's repeated render-time correction flow with one pure viewport calculation based on measured card heights, line budget, selection, and scroll offset.
- Remove the `clampScrollToFit` helper, fixed-page-size path, and `correctedScrollOffset` render result after the viewport calculation replaces them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-storage`: Define safe mutation rejection and cross-scope move behavior.
- `preset-picker`: Define measured viewport layout behavior without requiring the existing correction algorithm or helper.

## Impact

The change will affect storage mutation results, editor scope-move orchestration, picker layout calculation, and their tests. It will require updates to the `preset-storage` and `preset-picker` specifications. It will add no dependency and will not change the preset file format.
