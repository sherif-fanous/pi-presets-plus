## 1. Shared dialog frame helper

- [x] 1.1 In `src/ui/frame.ts` (or a new `src/ui/dialog-frame.ts` if it grows), add a `renderDialogFrame({ title, bodyLines, footer, width, theme })` helper that returns the array of styled lines for top-border + title row + blank + body rows + blank + footer hint + bottom-border.
- [x] 1.2 Add a `wrapBody(text, width)` helper that performs the same word-wrapping logic currently inlined in `confirm.ts`, so both confirm and info-dialog share one implementation.
- [x] 1.3 Refactor `src/ui/confirm.ts` to consume `renderDialogFrame` and `wrapBody`; verify `openConfirm` API is unchanged from the caller's perspective.
- [x] 1.4 Add a regression test asserting the rendered output of `openConfirm` with a representative title/message pair is identical pre- and post-refactor (golden test).

## 2. Info-dialog component

- [x] 2.1 Create `src/ui/info-dialog.ts` with `openInfoDialog(ctx, { title, body, tone })` returning `Promise<void>`. Tones: `"info" | "warning" | "error"` — affecting only title color and footer hint copy. Component dismisses on `Enter` or `Esc`.
- [x] 2.2 The component MUST consume `renderDialogFrame` and `wrapBody` (shared with confirm); MUST NOT duplicate chrome rendering.
- [x] 2.3 Use overlay options matching the confirm dialog: anchor center, max height 90 %, min width 48, width 90 %.
- [x] 2.4 Add unit tests covering: rendering with each tone, dismiss on Enter, dismiss on Esc, multi-line body wrapping at narrow width.

## 3. Status path: picker integration

- [x] 3.1 Extract `formatStatusForPicker(ctx, pi): Promise<string>` in `src/commands/presets/status.ts` (or a sibling file) that returns the same body `runStatus` would emit, including the "no preset is active" case.
- [x] 3.2 Wire a Status action (`s` key) into the picker. On press: call `formatStatusForPicker`, then `openInfoDialog` with title `"Preset Status"` (matches the editor's title-case voice).
- [x] 3.3 Hide the picker overlay during the dialog (`overlayHandle.setHidden(true)`), restore on dismiss (`setHidden(false); focus(); requestRender()`) — same pattern editor.ts uses for confirm dialogs.
- [x] 3.4 Update the picker footer hint row to include the `Status` entry.

## 4. Clear path: picker integration

- [x] 4.1 Extract `clearForPicker(ctx, pi): Promise<{ name: string, parts: ClearPart[] } | null>` from `src/activation/clear.ts`. The runner SHALL perform the same state changes as `clear()` (detach, write baseline overlay, append session entry, refresh status indicator) but SHALL return the payload instead of calling `ctx.ui.notify`. Returns `null` if no preset was active.
- [x] 4.2 The existing `clear(ctx, pi)` keeps its current shape and is what `/presets clear` from the prompt calls. Internally, it can delegate to `clearForPicker` and then notify with the rendered summary, to avoid duplicated logic.
- [x] 4.3 Update the picker's `c` action: keep the existing confirm prompt; on confirm, call `clearForPicker`, render the summary via `renderClearSummary`, and `openInfoDialog` with title `"Preset Cleared"` and the rendered body.
- [x] 4.4 Hide/restore the picker overlay around the dialog same as the Status path.

## 5. Tests

- [x] 5.1 Add a picker test: pressing `s` with an active preset opens the info-dialog with the formatted status; dismissing returns focus to the picker.
- [x] 5.2 Add a picker test: pressing `s` with no active preset opens the info-dialog with the "no preset is active" body.
- [x] 5.3 Add a picker test: pressing `c` and confirming shows the clear summary in the info-dialog, not via notify.
- [x] 5.4 Add a picker test: pressing `c` and dismissing the confirm with No does NOT open the info-dialog.
- [x] 5.5 Add a regression test for `/presets clear` invoked from the prompt: the summary is delivered via `ctx.ui.notify` (unchanged behavior).
- [x] 5.6 Add a regression test for `/presets status` invoked from the prompt: the diagnostic is delivered via `ctx.ui.notify` (unchanged behavior).

## 6. Verification

- [x] 6.1 Run `mise run check` and confirm a clean tree.
- [x] 6.2 Manually verify in a live pi session: open `/presets`, press `s`, read the dialog, dismiss with Esc; press `c`, confirm, read the summary in the dialog, dismiss with Enter.
- [x] 6.3 Manually verify `/presets status` and `/presets clear` typed at the prompt still emit via the main-window notify path (not as overlays).
