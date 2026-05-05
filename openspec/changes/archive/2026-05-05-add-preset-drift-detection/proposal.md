## Why

This is the sixth of seven changes building `pi-presets-plus` (see `openspec/breakdown.md`). Through change 5 the package has full CRUD and a polished UI, but a known gap remains: when the user manually changes the model, thinking level, or active tools while a preset is active, nothing tells them the active state and the preset definition no longer match. The status badge keeps saying `★ plan · …` even when the active model is no longer plan's model. This change closes that gap with two surgical additions:

1. The `model_select` placeholder from change 3 becomes real: it marks the active preset *dirty* (not cleared) when the user manually changes the model.
2. New drift handlers compare pi state against the active preset's declared fields and flip dirty in either direction (drifted → dirty, re-synced → clean): `thinking_level_select` gives immediate feedback for thinking changes, while `turn_start` catches tool drift and acts as a safety net.

The user-visible result is a warning-colored `!` appended to the status badge — `preset: plan!` — when state has drifted, plus a drift line on the active preset's picker card. The badge format otherwise stays as activation defined it (`preset: <name>`, dim); the dirty marker is a one-character extension that MODIFIES the existing activation requirement. The preset stays attached so instructions still inject; the user resolves drift by re-applying from the picker (select the active preset and press `Enter`) or clearing from the picker once change 5 wires the `c` action.

## What Changes

- Add a `dirty: boolean` field as a sibling of `restore` on both variants of `ActivePresetState` in `src/types.ts`. Default `false` on apply and on session restore (`restore: { kind: "unknown" }`).
- Replace the `model_select` placeholder handler with a real one: when source is `"set"` or `"cycle"` and the new model differs from the active preset's `(provider, model)`, mark dirty; when the new model matches the active preset's model and dirty was true, mark clean.
- Add `thinking_level_select` and `turn_start` handlers that compare model, effective thinking level, and (when `preset.tools` is non-empty) active tools as a set; flip dirty in both directions; update the status badge.
- Add `markDirty(ctx, reason)` and `markClean(ctx)` helpers that update the active state's `dirty` flag and trigger `updateStatus`. Default behavior is silent; an optional one-time-per-session debug notification is acceptable.
- Update `apply` to set `dirty: false` on the new `ActivePresetState`, and to call `markClean(ctx)` on its idempotent fast-path early-return when the existing active state is currently dirty.
- Update the session-restore path in `src/index.ts` to construct the `restore: { kind: "unknown" }` attachment with `dirty: false`.
- Update `clear` — no behavior change needed; clear ignores `dirty`.
- Update `updateStatus` in `src/ui/status.ts` to append a warning-colored `!` immediately after `<name>` when `active.dirty === true`. Format becomes `preset: <name>` (clean, dim) or `preset: <name>!` (dirty; trailing `!` in `warning` color).
- Update the picker card for the active preset to include the dirty state and per-field drift reasons (rendered as a `Drift:` row in `warning` color) when `active.dirty === true`.
- Refactor `stateMatches` to delegate to a new `detectDriftReasons` helper so the apply fast-path, the `turn_start` handler, and the picker card all share one comparison implementation.

## Capabilities

### New Capabilities

- `preset-drift-detection`: dirty/clean state on the active preset; mark-dirty on `model_select`; per-turn comparison via `turn_start`; status-badge dirty marker; picker drift indicator; bidirectional clean/dirty transitions.

### Modified Capabilities

- `preset-activation`: the footer status entry's "`preset: <name>`" format is extended to allow a trailing dirty marker (`preset: <name>!`) when the active attachment is dirty. The clean-state format is unchanged. See `specs/preset-activation/spec.md` in this change's delta.

## Impact

- **One additional event handler runs on every turn.** The work is two or three equality checks on small data; cost is dominated by the surrounding LLM call.
- **No new file I/O.** Drift detection is in-memory only.
- **No data-format changes.** The on-disk JSON shape is unchanged. The `dirty` flag exists only in the in-memory `ActivePresetState`.
- **The status badge gains a one-character marker.** Users may notice the trailing `!` appearing and disappearing as state drifts and re-syncs. README documents the meaning ("preset is attached but pi state has drifted from the preset's declared fields").
- **No breaking changes.** Existing presets, files, commands, and UI behavior continue to work.
