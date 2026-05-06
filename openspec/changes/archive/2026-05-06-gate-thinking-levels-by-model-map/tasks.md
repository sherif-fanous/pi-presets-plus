## 1. Helper update

- [x] 1.1 Update `validThinkingLevels(model)` in `src/activation/thinking.ts` to honor `model.thinkingLevelMap` with permissive parsing: levels through `"high"` are valid unless `thinkingLevelMap[level] === null`; `"xhigh"` is valid only when explicitly mapped to a non-null value. Keep the `model.reasoning === false` short-circuit returning `["off"]`. Use optional-chained access on `thinkingLevelMap` so models without the field continue to surface levels through `"high"` while excluding `"xhigh"`.
- [x] 1.2 Update the JSDoc on `validThinkingLevels` to describe the new semantics, including the explicit `null === unsupported` rule, the "missing keys fall through to provider defaults" rule for levels through `"high"`, the `"xhigh"`-must-be-explicitly-mapped carve-out (mirroring pi-ai's `getSupportedThinkingLevels`), and the backward-compatibility note for pi-ai versions predating the field (models without `thinkingLevelMap` surface levels through `"high"` only).
- [x] 1.3 Verify `effectiveThinkingLevel` continues to delegate to `validThinkingLevels` (no signature change required).

## 2. Tests

- [x] 2.1 Add unit tests for `validThinkingLevels` covering: undefined `thinkingLevelMap`, `thinkingLevelMap: {}` (xhigh excluded), partial map with no nulls including explicit xhigh, partial map with one null, all-null map, and `reasoning: false` short-circuit (regression).
- [x] 2.2 Add an apply-time test: preset with `thinkingLevel: "low"` against a model whose `thinkingLevelMap` has `{ "low": null }` clamps to `"off"` and emits the existing clamp notification with the expected wording.
- [x] 2.3 Add an apply-time test: preset with `thinkingLevel: "low"` against a model whose `thinkingLevelMap` is `{ "xhigh": "max" }` (no `"low"` key) applies `"low"` without notification.
- [x] 2.4 Add an editor-snap test: the user changes the model from one whose `thinkingLevelMap` allows `"low"` to one whose `thinkingLevelMap` declares `"low": null` while `"low"` is selected → snap to `"off"` and inline notice appears.
- [x] 2.5 Add a backward-compatibility test: a model object without a `thinkingLevelMap` field returns levels through `"high"` from `validThinkingLevels` (no exception thrown).

## 3. Tools-row scope guard

- [x] 3.1 Add a one-line comment in the editor's tools-row render path noting that tools-capability gating is intentionally out of scope until pi-ai exposes a "supports tools" flag, citing this change name as the place that decision was made.

## 4. Verification

- [x] 4.1 Run `mise run check` (format-check, type-check, lint, test) and confirm a clean tree.
- [x] 4.2 Manually verify in a live pi session: opening the editor on a model whose `thinkingLevelMap` declares one level as `null` shows that level dimmed; selecting it via cycle keys is impossible.
- [x] 4.3 Manually verify on an older pi-ai bundle (or a synthetic model object lacking `thinkingLevelMap`) that levels through `"high"` remain selectable for reasoning models.
