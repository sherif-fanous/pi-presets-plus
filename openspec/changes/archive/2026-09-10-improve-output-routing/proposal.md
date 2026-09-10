## Why

The extension currently uses several Pi output mechanisms without a clear rule for their meaning. This causes activation messages to enter LLM context through `pi.sendMessage()`, long query results such as `/presets status` to appear as transient notifications, and related startup or apply messages to appear as separate notices. This change gives each output a clear audience, lifetime, and delivery surface.

## What Changes

- Replace the successful preset activation `pi.sendMessage()` marker with a human-facing notification that does not enter LLM context.
- Return apply accompaniments, such as thinking-level adjustments and dropped tools, so callers can combine them with the activation result.
- Aggregate related startup warnings into one startup report where possible.
- Treat `/presets status` and `/presets policy` as command reports instead of notifications.
- Render prompt-invoked status and policy reports as durable TUI-only session entries. Use the existing info dialog for the same reports requested from the picker.
- Keep `/presets show-prompt` as a temporary preview dialog and use that dialog for its empty and error outcomes.
- Keep `/presets clear` as one concise, severity-aware notification in the prompt and a readable info dialog in the picker.
- Keep `presets-plus:active` session entries hidden and separate from visible command reports.
- Support TUI and RPC output paths. JSON and print modes are out of scope.
- Review all new and changed user-facing prose with the humanizer and unslop skills.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `preset-activation`: Change activation, apply accompaniment, clear, status, policy, and prompt-preview output behavior while preserving preset state and restore semantics.
- `preset-access-policy`: Change startup warning aggregation and the delivery of policy reports and default-activation outcomes.

## Impact

- Affects output routing in `src/activation/apply.ts`, `src/activation/clear.ts`, `src/activation/policy-default.ts`, `src/activation/session.ts`, and the `/presets` command modules.
- Adds or changes TUI-only custom session-entry rendering for command reports.
- Changes the extension API usage from normal activation `pi.sendMessage()` to `ctx.ui.notify()`.
- May change apply result types so UI boundaries can combine success messages and warnings.
- Raises the development dependency baseline for Pi packages to `0.80.5`, the earliest published release that provides `registerEntryRenderer()`.
- Keeps RPC notifications as the non-TUI delivery path. JSON and print mode behavior is not changed.
- Requires updates to tests, affected OpenSpec requirements, dependency metadata, changelog, and user-facing message text.
