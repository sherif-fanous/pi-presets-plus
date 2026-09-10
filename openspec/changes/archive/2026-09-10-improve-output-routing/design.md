## Context

The extension currently uses `ctx.ui.notify()` for short feedback and for long read-only reports. It uses `pi.sendMessage()` for the activation marker, although Pi converts custom messages into user messages for LLM context. It already uses hidden `pi.appendEntry()` entries for active-preset restore state and uses info dialogs for picker-local reports.

See `proposal.md` for the motivation and scope. The modified capability specs define the required behavior.

## Goals / Non-Goals

**Goals:**

- Give activation, reports, warnings, dialogs, and persistent state distinct meanings.
- Keep normal human-facing activation output out of LLM context.
- Give prompt-invoked status and policy commands a durable TUI-only report surface.
- Keep picker-local reports readable without closing the picker.
- Group related apply and startup messages without losing warning details.
- Preserve RPC support through its existing notification protocol.
- Keep all new and changed user-facing prose plain, direct, and reviewed with humanizer and unslop.

**Non-Goals:**

- Add support for JSON or print mode output.
- Change preset selection, baseline, restore, drift, or permission rules.
- Persist preset instructions as command reports.
- Create a general LLM context-message feature.
- Redesign the picker or editor layout.

## Decisions

### Use a semantic apply outcome

The apply operation will calculate successful accompaniments and return them with its result. It will not call `ctx.ui.notify()` for normal success or for apply-time warnings. The caller will format one outcome for its interaction surface.

This keeps the activation engine independent from the prompt, picker, hotkey, flag, and startup surfaces. It also prevents one activation from producing separate success, clamp, and dropped-tool messages.

An alternative was to keep notifications inside apply and add a second success notification at each caller. That preserves less code but produces duplicated and inconsistent output, so it is rejected.

### Use notifications for action feedback

Successful activation and clear are actions. Prompt and RPC callers will use notifications for their short results. Picker callers will use an info dialog when the picker must remain open. A clear result may use warning severity when restoration fails or completes only partly.

An alternative was to persist every action result as a session report. That would add history for routine events and make the transcript noisy, so it is rejected for activation and clear.

### Add a TUI-only command report entry

Status and policy are explicit read-only queries. In TUI mode, prompt-invoked queries will append a structured, TUI-only session entry and render it with a registered entry renderer. The entry will contain unstyled report data. The renderer will apply the current theme during rendering.

The extension will require Pi package version `0.80.5` or newer. This is the earliest published `@earendil-works/pi-coding-agent` release that exposes `registerEntryRenderer()`. The matching `@earendil-works/pi-ai` and `@earendil-works/pi-tui` packages will use the same minimum version.

Picker-invoked queries will continue to use the existing info dialog. Both surfaces will receive the same formatted report content.

An alternative was to keep using `ctx.ui.notify()` for all query output. This is rejected because a long query result is not a transient notification and is easy to lose among status lines.

### Keep prompt preview temporary

`/presets show-prompt` will remain a temporary preview dialog. The package will not persist the prompt text in a session report. The same dialog surface will handle prompt content, empty prompt states, and named-preset errors.

This avoids copying potentially sensitive preset instructions into session history.

### Aggregate startup warnings at the lifecycle boundary

Startup code will collect warnings from preset loading, policy loading, restore, hotkey registration, and default activation. It will present one startup warning where possible. Each warning will remain identifiable in the combined text.

A warning that occurs after startup, such as a later hotkey failure, will use the normal notification path and will not be added to an old startup report.

### Use RPC notification delivery as a transport fallback

RPC mode does not provide the TUI entry-renderer surface. Prompt-invoked status and policy reports will therefore use the RPC notification protocol in RPC mode. The report remains human-only and will not use `pi.sendMessage()`.

JSON and print modes are outside this change.

### Keep hidden active entries separate

The existing `presets-plus:active` entries will continue to store restore metadata without a renderer. Visible command reports will use a separate custom entry type and data shape. This prevents restore bookkeeping from appearing as user-facing history.

## Risks / Trade-offs

- [Risk] Durable status and policy reports create session history for each query. -> [Mitigation] Persist only explicit status and policy queries, not routine actions or prompt contents.
- [Risk] Entry renderers are TUI-specific. -> [Mitigation] Use the RPC notification protocol in RPC mode and keep JSON and print modes out of scope.
- [Risk] Combining apply warnings may produce long notifications. -> [Mitigation] Use concise message wording and preserve only details that explain a changed or degraded result.
- [Risk] Startup aggregation can hide the timing of an individual warning. -> [Mitigation] Keep each warning as a separate bullet in one combined startup message.
- [Risk] Existing tests and specifications may expect `pi.sendMessage()` or notification calls. -> [Mitigation] Update the affected tests and delta requirements together, then run the full project check.
- [Risk] Pi versions before `0.80.5` do not provide `registerEntryRenderer()`. -> [Mitigation] Raise the package dependency baseline to `0.80.5` and document the breaking compatibility change in the changelog and release commit.
- [Risk] Clear reports may be too detailed for a short notification. -> [Mitigation] Group normal restoration into one sentence and expand only when overrides, missing baselines, or restore failures need explanation.
