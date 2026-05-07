## 1. apply() return-shape change

- [x] 1.1 Update `ApplyResult` in `src/activation/apply.ts` (or define it inline if it doesn't exist as a named type yet) to be `{ ok: true } | { ok: false; reason: string; kind: "no-key" | "no-model" | "unknown-model" | "key-revoked" }`. Add a JSDoc comment marking it as in-memory only and documenting each `kind` value.
- [x] 1.2 Replace each `ctx.ui.notify(..., "error")` in `apply()` with a `return { ok: false, reason, kind }` using consistent text. Centralize the strings in a small `failureReason(kind, ...args): string` helper (in `apply.ts` or `src/activation/failure-reason.ts`) so vocabulary alignment touches one site.
- [x] 1.3 Keep `apply()`'s warning notify call sites (e.g. unknown-tools dropped) unchanged — warnings ride alongside `ok: true` and are not part of the refusal return.
- [x] 1.4 Update the JSDoc on `apply()` to reflect the new return shape and the rule that callers surface `reason` via their context-appropriate channel.

## 2. Caller updates (notify path)

- [x] 2.1 Update `src/hotkeys.ts` to read the new return shape: `if (!result.ok) ctx.ui.notify(result.reason, "error")`. Remove any hotkey-specific failure-string composition that duplicates `failureReason`.
- [x] 2.2 Update `src/flag.ts` to read the new return shape and surface the `reason` via `ctx.ui.notify(result.reason, "error")`.
- [x] 2.3 Update `src/index.ts` (session-restore re-apply path, if any) to read the new return shape and surface the `reason` via `ctx.ui.notify` if a refusal occurs during restore.
- [x] 2.4 Update `src/commands/presets/router.ts` (the `/presets <name>` path) to read the new return shape and surface the `reason` via `ctx.ui.notify(result.reason, "error")`.

## 3. Picker dialog wiring (overlay path)

- [x] 3.1 Update `src/ui/picker.ts` activation handler: on `{ ok: false, reason }`, hide the picker overlay (`overlayHandle.setHidden(true)`), `await openInfoDialog(ctx, { title: "Activation failed", body: reason, tone: "error" })`, restore the picker (`setHidden(false); focus(); requestRender()`), and keep the same row selected.
- [x] 3.2 Confirm `openInfoDialog` is reachable; this task depends on `route-picker-info-output-through-overlay` having landed first. If not, scope this change to also export the dialog from `src/ui/info-dialog.ts` (best avoided — sequence the merge).
- [x] 3.3 Verify the picker no longer calls `ctx.ui.notify` for activation refusals (only for warnings, if any).

## 4. Tests

- [x] 4.1 Update existing `apply()` tests that asserted on `ctx.ui.notify` calls for refusals to instead assert on the returned `{ ok: false, reason, kind }`. Cover all four kinds: `no-key`, `no-model`, `unknown-model`, `key-revoked`.
- [x] 4.2 Add a regression test asserting `apply()` does NOT call `ctx.ui.notify` on refusal (only on warning).
- [x] 4.3 Add a picker test: activating a preset marked `unavailable: "no-key"` opens the error info-dialog with the expected `reason`, the picker stays open, and dismissing returns focus.
- [x] 4.4 Add tests for hotkey and `--preset` flag failure paths: activation refusal results in a single `ctx.ui.notify(reason, "error")` call (no dialog).
- [x] 4.5 Confirm the warning path (unknown tools) still emits one `ctx.ui.notify(_, "warning")` call alongside `ok: true`.

## 5. Verification

- [x] 5.1 Run `mise run check` and confirm a clean tree.
- [x] 5.2 Manually verify in a live pi session: open `/presets`, press Enter on a preset with a missing API key, confirm an error dialog appears above the picker, dismiss with Esc, confirm the picker is still open with the same row selected.
- [x] 5.3 Manually verify: trigger a preset hotkey for an unavailable preset and confirm the failure surfaces via main-window notify (not a dialog), since no overlay is on screen.
- [x] 5.4 Manually verify: launch with `--preset <unavailable>` and confirm the failure surfaces via main-window notify.
