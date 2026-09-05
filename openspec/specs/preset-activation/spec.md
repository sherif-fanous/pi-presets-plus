# preset-activation Specification

## Purpose

The `preset-activation` capability defines how `pi-presets-plus` makes a preset _do_ something: applying a preset swaps Pi's current model, thinking level, and (when the preset declares them) active tools while preserving an overlay baseline that captures the prior values; clearing the active preset attempts to restore that baseline using a per-field decision rule that respects manual user overrides made after activation; the active preset's instructions are appended (never replace) to each turn's system prompt; activation emits a visible audit-trail message; the compact preset footer indicator reflects the active preset; session restore re-attaches the previously-active preset as a `priorUnknown` overlay (no re-apply, no fabricated baseline); and the `/presets <name>`, `/presets clear`, and `/presets status` subcommands wire the engine to the keyboard. Drift detection (auto-mark dirty on manual `/model` changes) and the `--preset` CLI flag, cycle commands, and per-preset hotkeys are deliberately deferred to later capabilities.

## Requirements

### Requirement: Apply a preset using a baseline overlay

The package SHALL apply a preset by (a) deciding whether to reuse an existing baseline-managed overlay or capture a fresh baseline of current Pi state, (b) setting the model via `pi.setModel`, the thinking level via `pi.setThinkingLevel` (using the effective level), and (when the preset specifies a non-empty `tools` array) the active tools via `pi.setActiveTools`, and (c) recording the applied preset's name and scope together with the baseline, the just-applied values as `lastApplied`, an `owned` bookkeeping record, and an incremented `applyCount`.

`apply()` SHALL return one of two shapes:

- `{ ok: true }` on success.
- `{ ok: false; reason: string; kind: "no-key" | "no-model" | "unknown-model" | "key-revoked" }` on refusal. The `reason` is human-readable and SHALL be the only text the package surfaces for that failure; the `kind` is a stable enum suitable for test assertions and call-site routing decisions.

`apply()` SHALL NOT call `ctx.ui.notify` for refusals. Callers SHALL surface the `reason` through their context-appropriate channel (e.g. `ctx.ui.notify` for prompt / hotkey / flag / session-restore callers; the shared info-dialog overlay for picker callers per the `preset-picker` capability).

`apply()` MAY still call `ctx.ui.notify` with severity `warning` for non-refusal accompaniments (e.g. unknown-tools dropped during a successful apply). Warnings ride alongside `ok: true` and are not part of the refusal return path.

Baseline capture rules:

- If no preset is currently attached, OR the currently attached preset has `restore.kind === "unknown"`, the package SHALL capture a fresh baseline from current Pi state (model, thinking level, active tools) and set `applyCount` to 1.
- If the currently attached preset has `restore.kind === "baseline"`, the package SHALL preserve the existing baseline unchanged and set `applyCount` to the previous `applyCount + 1`.

Ownership rules:

- `owned.model` and `owned.thinkingLevel` SHALL always be true in the baseline-managed shape.
- `owned.tools` SHALL be sticky-true across preset switches within the same overlay: once any preset in the overlay has declared a non-empty `tools` array, `owned.tools` SHALL remain true for the lifetime of that overlay.

`lastApplied` rules:

- `lastApplied.model` SHALL be the provider and id the package just wrote via `pi.setModel`.
- `lastApplied.thinkingLevel` SHALL be the effective thinking level the package just wrote via `pi.setThinkingLevel`.
- `lastApplied.tools` SHALL be updated to the filtered tool list when the current preset declares a non-empty `tools` array, and SHALL otherwise carry forward the previous overlay's `lastApplied.tools` value (if any).

#### Scenario: First activation while no preset is attached

- **WHEN** the user activates an available preset and no preset is currently attached
- **THEN** the package SHALL capture current Pi model, thinking level, and active tools as the baseline
- **AND** `applyCount` SHALL be 1
- **AND** `owned.tools` SHALL be true if and only if the preset declares a non-empty `tools` array
- **AND** the model, effective thinking level, and (when declared) filtered tools SHALL be written to Pi
- **AND** the active preset SHALL be set with `restore.kind === "baseline"`
- **AND** `apply()` SHALL return `{ ok: true }`

#### Scenario: Switching from one baseline-managed preset to another

- **WHEN** preset A is the currently attached baseline-managed preset and the user activates preset B
- **THEN** the baseline SHALL be preserved unchanged from the A-era overlay
- **AND** `applyCount` SHALL be incremented
- **AND** `owned.tools` SHALL become true if it was already true OR if B declares a non-empty `tools` array, and SHALL otherwise remain false
- **AND** `lastApplied.model` and `lastApplied.thinkingLevel` SHALL reflect B's just-applied values
- **AND** `lastApplied.tools` SHALL be B's filtered tool list when B declares tools, and SHALL carry forward the prior `lastApplied.tools` otherwise

#### Scenario: Apply after a priorUnknown attachment

- **WHEN** the currently attached preset has `restore.kind === "unknown"` (session-restored) and the user activates any available preset
- **THEN** the package SHALL capture a fresh baseline from current Pi state
- **AND** `applyCount` SHALL be 1
- **AND** the attachment SHALL transition from `unknown` to `baseline`

#### Scenario: Apply unavailable preset returns structured refusal

- **WHEN** the user attempts to activate a preset marked `unavailable: "no-key"`
- **THEN** activation SHALL be refused without baseline capture, model/thinking/tools change, or active-state change
- **AND** `apply()` SHALL return `{ ok: false, reason: <human-readable text naming the preset and reason>, kind: "no-key" }`
- **AND** `apply()` SHALL NOT call `ctx.ui.notify` for the refusal

#### Scenario: Apply unavailable preset (no-model) returns structured refusal

- **WHEN** the user attempts to activate a preset marked `unavailable: "no-model"`
- **THEN** `apply()` SHALL return `{ ok: false, reason: <text naming the preset>, kind: "no-model" }`
- **AND** `apply()` SHALL NOT call `ctx.ui.notify` for the refusal

#### Scenario: Apply preset referencing an unknown model returns structured refusal

- **WHEN** the user activates a preset whose declared `provider`/`model` does not resolve in `ctx.modelRegistry`
- **THEN** `apply()` SHALL return `{ ok: false, reason: <text naming the missing provider/model>, kind: "unknown-model" }`
- **AND** `apply()` SHALL NOT call `ctx.ui.notify` for the refusal

#### Scenario: setModel returns false (key revoked between load and apply)

- **WHEN** `pi.setModel` returns false during apply (auth revoked between preset load and activation)
- **THEN** `apply()` SHALL return `{ ok: false, reason: <text naming the provider/model>, kind: "key-revoked" }`
- **AND** `apply()` SHALL NOT call `ctx.ui.notify` for the refusal
- **AND** the active preset state SHALL NOT be updated

#### Scenario: Re-apply same preset, state already matches

- **WHEN** the user activates the preset that is already attached with `restore.kind === "baseline"` and current Pi state matches the preset's declared fields
- **THEN** the operation SHALL be a no-op (no baseline change, no writes, no session entry, no activation marker)
- **AND** `apply()` SHALL return `{ ok: true }`

#### Scenario: Re-apply same preset, state has drifted

- **WHEN** the user activates the preset that is already attached but current Pi state does NOT match the preset's declared fields
- **THEN** a full apply SHALL run while preserving the existing baseline
- **AND** `applyCount` SHALL be incremented
- **AND** `lastApplied` and `owned` SHALL be updated to reflect the re-application

#### Scenario: Unknown-tools warning during otherwise successful apply

- **WHEN** apply runs for a preset declaring `tools: ["foo", "bar"]` where `bar` is not in `pi.getAllTools()`
- **THEN** `pi.setActiveTools(["foo"])` SHALL be called
- **AND** `apply()` SHALL emit a `ctx.ui.notify(<text naming "bar">, "warning")` for the dropped tool
- **AND** `apply()` SHALL return `{ ok: true }`

### Requirement: Apply uses effective thinking level and surfaces clamping

During apply, the package SHALL compute the effective thinking level from the preset and resolved model using the same rule as pi-ai's `getSupportedThinkingLevels`. If the model has falsy `reasoning`, only `"off"` SHALL be valid. Otherwise, a level SHALL be invalid when `thinkingLevelMap?.[level]` is exactly `null`. The extended `"xhigh"` and `"max"` levels SHALL also be invalid unless `thinkingLevelMap` defines a non-null value for them.

The effective level SHALL be the preset's declared level, or `"off"` when absent, when that level is valid. For an invalid declared level, the package SHALL start with `"off"` and use pi-ai's clamp rule to select the nearest level the model supports. The package SHALL call `pi.setThinkingLevel` with that effective level so its adjustment notice, drift snapshot, and overlay state match Pi's resulting state.

The apply operation SHALL return successful accompaniments for user-facing adjustments or warnings, including a thinking-level adjustment and dropped unknown tools. It SHALL NOT emit a separate success or accompaniment notification. The caller SHALL choose the delivery surface and SHALL be able to combine every accompaniment with the activation result.

The validity check SHALL read `thinkingLevelMap` defensively. An absent map SHALL leave levels through `"high"` valid and SHALL disable `"xhigh"` and `"max"`.

#### Scenario: Reasoning model with no thinkingLevelMap honors declared level through high

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"high"`
- **THEN** `pi.setThinkingLevel("high")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with no thinkingLevelMap clamps xhigh to off

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"xhigh"`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Reasoning model with thinkingLevelMap missing the requested non-xhigh key honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "xhigh": "max" }` and the preset requests `"low"`
- **THEN** `pi.setThinkingLevel("low")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with thinkingLevelMap mapping xhigh to a non-null value honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "xhigh": "max" }` and the preset requests `"xhigh"`
- **THEN** `pi.setThinkingLevel("xhigh")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with no thinkingLevelMap clamps max to off

- **WHEN** apply runs for a reasoning model with no `thinkingLevelMap` and the preset requests `"max"`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Reasoning model with thinkingLevelMap mapping max to a non-null value honors declared level

- **WHEN** apply runs for a reasoning model with `thinkingLevelMap: { "max": "max" }` and the preset requests `"max"`
- **THEN** `pi.setThinkingLevel("max")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model clamps when thinkingLevelMap explicitly nulls the requested level

- **WHEN** apply runs for a reasoning model whose map sets the requested level to `null`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Non-reasoning model clamps to off with notification

- **WHEN** apply runs for a non-reasoning model and the preset requests a non-off level
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level, and actual level

#### Scenario: Off is unavailable during fallback

- **WHEN** a preset requests `"max"` and the reasoning model maps both `"max"` and `"off"` to `null`
- **THEN** the effective level SHALL be the nearest supported level above `"off"`
- **AND** `pi.setThinkingLevel` SHALL be called with that level
- **AND** the apply result and overlay state SHALL record that same level

#### Scenario: Preset omits thinking level

- **WHEN** a preset has no `thinkingLevel`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

### Requirement: Clear restores the overlay baseline with user-override protection

The package SHALL provide a clear operation that detaches the active preset and attempts to return Pi to the overlay's baseline state, respecting manual user overrides made after activation.

When the active preset has `restore.kind === "baseline"`, clear SHALL evaluate each of the fields model, thinking level, and tools independently using the following decision rule (tools additionally requires `owned.tools === true`; if `owned.tools` is false, clear SHALL leave tools unchanged):

1. If the current Pi value equals the baseline value, perform no write for that field (already at baseline).
2. Otherwise, if the current Pi value equals `lastApplied` for that field, write the baseline value.
3. Otherwise, leave the current Pi value unchanged (user override).

When the active preset has `restore.kind === "unknown"`, clear SHALL perform a soft clear: detach the active preset without writing model, thinking, or tools.

Equality comparisons: model equality compares `provider` and `id` exactly (a `null` baseline model only equals a `null` current model); thinking equality compares string values exactly; tools equality compares the two lists as sets of tool names (order-insensitive).

Regardless of which branch runs, clear SHALL detach the active preset, append a `presets-plus:active` session entry with `{ name: null }`, refresh the compact preset footer indicator, and emit a result notification describing the outcome per field.

Failures to apply the baseline (e.g. `pi.setModel` returns false, baseline tools reference names no longer present) SHALL NOT abort the clear operation: the active preset SHALL still be detached and the result notification SHALL describe the partial outcome.

#### Scenario: Clear after single activation from baseline

- **WHEN** preset A is applied while no preset was attached and then the user clears while current Pi state still equals `lastApplied`
- **THEN** model, thinking, and (if owned) tools SHALL be restored to the baseline values captured before A was applied
- **AND** the active preset SHALL be detached and a result notification SHALL name the restored fields

#### Scenario: Clear after a chain of presets (A → B → clear)

- **WHEN** preset A is applied from baseline S0, then preset B is applied while A is attached, then clear is invoked while current Pi state still equals B's `lastApplied`
- **THEN** model, thinking, and (if owned) tools SHALL be restored to S0 (the original baseline), not to A's state
- **AND** the active preset SHALL be detached

#### Scenario: Clear respects manual model override

- **WHEN** preset A is applied and the user then manually changes the model (e.g. via `/model`) so that current model differs from `lastApplied.model`
- **AND** the user runs `/presets clear`
- **THEN** the model SHALL NOT be modified by clear
- **AND** the result notification SHALL state that model was left unchanged because it changed after activation
- **AND** other fields that still equal `lastApplied` SHALL be restored to baseline

#### Scenario: Clear respects manual tools override

- **WHEN** preset A (with non-empty `tools`) is applied and the user then manually changes active tools so that current tools differ from `lastApplied.tools` as a set
- **AND** the user runs `/presets clear`
- **THEN** tools SHALL NOT be modified by clear
- **AND** the result notification SHALL state that tools were left unchanged because they changed after activation

#### Scenario: Clear when tools channel is not owned

- **WHEN** no preset in the active overlay declared a non-empty `tools` array (so `owned.tools === false`)
- **AND** the user runs `/presets clear`
- **THEN** tools SHALL be left unchanged regardless of current/baseline/lastApplied comparisons
- **AND** the result notification SHALL state that tools were unchanged

#### Scenario: Field already at baseline

- **WHEN** clear evaluates a field whose current Pi value already equals the baseline value
- **THEN** the package SHALL perform no write for that field
- **AND** the result notification SHALL state that the field was already at baseline (or SHALL classify it alongside "restored" when summarizing — implementations MAY collapse these into one user-facing bucket, but MUST NOT report a write that did not happen)

#### Scenario: Soft clear after session restore

- **WHEN** a session is resumed with preset `plan` attached as `priorUnknown` and clear is invoked before any re-apply
- **THEN** the active preset SHALL be detached
- **AND** the model, thinking level, and active tools SHALL NOT be modified by the clear
- **AND** the result notification SHALL state that model, thinking, and tools were unchanged because no restore baseline was available

#### Scenario: Clear with no active preset

- **WHEN** clear is invoked while no preset is attached
- **THEN** no state change or session entry SHALL occur
- **AND** a result notification SHALL state that there is no active preset to clear

#### Scenario: Baseline model could not be restored

- **WHEN** clear determines that the model should be restored but `pi.setModel` returns false or throws for the baseline model
- **THEN** the clear operation SHALL still detach the active preset and restore other fields where possible
- **AND** the result notification SHALL state that the previous model could not be restored, naming it

#### Scenario: Baseline tools include unavailable names

- **WHEN** clear determines that tools should be restored but the baseline tool list contains names not present in `pi.getAllTools()`
- **THEN** unavailable names SHALL be filtered out before calling `pi.setActiveTools`
- **AND** the result notification SHALL name the dropped tools

### Requirement: Inject preset instructions into the system prompt by appending

While a preset with a non-empty `instructions` field is active, the package SHALL append those instructions to the system prompt for each turn via the `before_agent_start` event, separated from the prior prompt by a blank line. The package SHALL NOT replace or otherwise mutate the incoming `systemPrompt`. Appending is required (not merely preferred) because the incoming prompt contains pi's tool descriptions, guidelines, and contributions from earlier extensions in the chain.

#### Scenario: Active preset with instructions

- **WHEN** the agent starts a turn while an active preset has non-empty instructions
- **THEN** the system prompt for that turn SHALL equal `<incoming prompt> + "\n\n" + <preset instructions>`
- **AND** the incoming prompt's content SHALL appear unmodified at the start of the result

#### Scenario: Active preset without instructions

- **WHEN** the active preset has no `instructions` field
- **THEN** the `before_agent_start` handler SHALL return undefined and the system prompt SHALL be unchanged

#### Scenario: No active preset

- **WHEN** no preset is active
- **THEN** the `before_agent_start` handler SHALL return undefined and the system prompt SHALL be unchanged

#### Scenario: Active preset attached via session restore

- **WHEN** a session is resumed with a preset attached as `priorUnknown` and that preset has non-empty instructions
- **THEN** the next turn's system prompt SHALL include the appended instructions, even though no apply was performed during restore

### Requirement: Persist active preset name in the session

When a preset is applied or cleared, the package SHALL append a custom session entry of type `presets-plus:active` recording the new active preset name (or `null` on clear) and the active scope, so that session restore can recover the active state. The package SHALL NOT persist the overlay baseline, `lastApplied`, `owned`, or `applyCount`: those are in-memory only.

#### Scenario: Apply persists name and scope

- **WHEN** preset `plan` (project scope) is applied
- **THEN** a `presets-plus:active` custom entry SHALL be appended with `{ name: "plan", scope: "project" }`

#### Scenario: Clear persists a null name

- **WHEN** the active preset is cleared (any branch, including soft clear)
- **THEN** a `presets-plus:active` custom entry SHALL be appended with `{ name: null }`

### Requirement: Session restore re-attaches active preset without re-applying or fabricating a baseline

On `session_start`, the package SHALL inspect the current branch for the most recent `presets-plus:active` entry. If a non-null name is present and the named preset still loads successfully and is available, the package SHALL set the in-memory active preset state to a `priorUnknown` shape (`restore.kind === "unknown"`) and SHALL NOT invoke `pi.setModel`, `pi.setThinkingLevel`, or `pi.setActiveTools`, and SHALL NOT fabricate an overlay baseline.

#### Scenario: Session resumes with previously active preset

- **WHEN** a session is resumed and the most recent `presets-plus:active` entry names `plan` and `plan` is still loaded and available
- **THEN** the active preset SHALL be set to `{ name: "plan", scope, restore: { kind: "unknown" } }`
- **AND** no model, thinking, or tools change SHALL be triggered as a side effect of restore
- **AND** the next turn SHALL still append the preset's instructions per the injection requirement

#### Scenario: Session resumes but preset no longer available

- **WHEN** the most recent `presets-plus:active` entry names a preset that no longer exists or is `unavailable`
- **THEN** the active preset SHALL remain unset and a warning SHALL be emitted

#### Scenario: Session resumes with cleared state

- **WHEN** the most recent `presets-plus:active` entry has `name: null`
- **THEN** no active preset SHALL be set on restore

#### Scenario: Re-apply after restore starts a new baseline

- **WHEN** a session is resumed with `plan` attached as `priorUnknown` and the user runs `/presets plan` again
- **THEN** apply SHALL capture a fresh baseline from current Pi state
- **AND** the attachment SHALL transition from `unknown` to `baseline`
- **AND** a subsequent clear SHALL target that freshly-captured baseline, not the pre-original-activation state

### Requirement: Activation emits a visible audit-trail message

When a preset is applied (interactively via `/presets <name>`), the package SHALL emit a custom message of type `presets-plus:activated` via `pi.sendMessage` with `display: true`, containing the preset name, the resolved `provider/model`, and the effective thinking level. This message SHALL render in the conversation but SHALL NOT enter the LLM context.

#### Scenario: Interactive activation

- **WHEN** a preset is applied via `/presets <name>`
- **THEN** a `presets-plus:activated` custom message SHALL appear in the conversation showing the preset name and effective model and thinking level

#### Scenario: Re-apply that is a no-op

- **WHEN** the re-apply rule short-circuits (state already matches)
- **THEN** NO activation marker SHALL be appended

#### Scenario: Restore attachment

- **WHEN** the package re-attaches a preset on `session_start` (no apply runs)
- **THEN** NO activation marker SHALL be appended (the marker from the original apply already exists in the branch)

### Requirement: Clear emits a per-field result notification

The package SHALL emit exactly one user-visible report on every successful invocation of clear (including the no-active-preset path), describing the outcome for each of model, thinking, and tools. The report SHALL distinguish at least the following per-field outcomes:

- restored to baseline
- already at baseline (MAY be collapsed with "restored" in user-facing text)
- left unchanged because the field changed after activation (user override)
- left unchanged because the overlay did not own the field (tools only)
- left unchanged because no restore baseline was available (priorUnknown branch)
- could not restore (e.g. model write failed)
- tools restored with some baseline names dropped because they are no longer available

The report SHALL name the preset that was cleared.

The delivery surface SHALL depend on the call site:

- When clear is invoked from `/presets clear` typed at the prompt, the package SHALL deliver the report via `ctx.ui.notify` with severity `info`.
- When clear is invoked from inside the `/presets` picker (the `c` action), the package SHALL deliver the report via the shared info-dialog overlay so the report is readable without dismissing the picker; the dialog SHALL block until the user dismisses it with `Enter` or `Esc`.

The textual content of the report SHALL be identical across both delivery surfaces (the same formatter feeds both); only the rendering chrome differs.

#### Scenario: Full restore from prompt

- **WHEN** the user runs `/presets clear` from the prompt and clear restores every field to baseline
- **THEN** the report SHALL be delivered via `ctx.ui.notify` and SHALL name the cleared preset and indicate that model, thinking, and tools were restored

#### Scenario: Full restore from picker

- **WHEN** the user triggers `c` from inside the picker, confirms, and clear restores every field to baseline
- **THEN** the report SHALL be delivered via the info-dialog overlay above the picker
- **AND** the textual content SHALL match what the prompt-invoked path would have produced

#### Scenario: User override respected in report

- **WHEN** clear leaves a field unchanged because current value differs from both baseline and `lastApplied`
- **THEN** the report SHALL explicitly state that that field was left unchanged because it changed after activation, regardless of delivery surface

#### Scenario: priorUnknown report

- **WHEN** clear runs the soft-clear branch for a `priorUnknown` attachment
- **THEN** the report SHALL state that model, thinking, and tools were unchanged because no restore baseline was available, regardless of delivery surface

#### Scenario: Nothing-to-clear report

- **WHEN** clear is invoked with no active preset
- **THEN** the report SHALL state that there is no active preset to clear, regardless of delivery surface

### Requirement: New-session and fork behavior

On `/new` (new session) the active preset SHALL be unset (the new branch contains no `presets-plus:active` entry, so the standard restore logic finds nothing to attach). On `/fork` the forked session SHALL inherit the active preset name from the parent (the fork's branch already contains the parent's most recent `presets-plus:active` entry, and the standard restore logic re-attaches it as `priorUnknown`). Neither `/new` nor `/fork` SHALL carry the in-memory overlay baseline across sessions.

#### Scenario: New session has no active preset

- **WHEN** the user runs `/new`
- **THEN** the active preset in the new session SHALL be undefined

#### Scenario: Fork inherits active preset as priorUnknown

- **WHEN** the user runs `/fork` while preset `plan` is active with a baseline-managed overlay
- **THEN** the forked session's active preset SHALL be `plan` attached with `restore.kind === "unknown"`
- **AND** the forked session SHALL NOT inherit the parent overlay's baseline, `lastApplied`, or `owned`

### Requirement: Compact preset footer indicator

The package SHALL display a dim-themed footer status entry under the key `presets-plus`. While a preset is active and clean, the entry SHALL use the format `preset: <name>`. While a preset is active and dirty (drift detected), the entry SHALL render the same `preset: <name>` text in `dim` followed immediately (no separating whitespace) by a single `!` character rendered in the theme's `warning` color, producing the visual form `preset: <name>!`. When no preset is active, or when the active preset's definition can no longer be looked up, the entry SHALL use the format `preset: none`. The indicator SHALL intentionally omit provider, model, and thinking level because Pi's built-in footer already displays current model and thinking information. The indicator SHALL be refreshed on apply, clear, session_start, and on every transition of the active preset's `dirty` flag.

#### Scenario: Active preset displayed (clean)

- **WHEN** preset `plan` is active and `dirty` is `false`
- **THEN** the `presets-plus` footer status entry SHALL be `preset: plan` (dim, no trailing marker)

#### Scenario: Active preset displayed (dirty)

- **WHEN** preset `plan` is active and `dirty` is `true`
- **THEN** the `presets-plus` footer status entry SHALL render the dim text `preset: plan` followed immediately by a `!` rendered in the theme's `warning` color

#### Scenario: No active preset

- **WHEN** no preset is active
- **THEN** the `presets-plus` footer status entry SHALL be `preset: none`

#### Scenario: Active preset definition missing

- **WHEN** an active preset attachment exists but the preset definition cannot be found during status refresh
- **THEN** the `presets-plus` footer status entry SHALL be `preset: none`

#### Scenario: Refresh on dirty transitions

- **WHEN** the active preset's `dirty` flag transitions in either direction
- **THEN** the `presets-plus` footer status entry SHALL be refreshed without requiring user action

### Requirement: /presets <name>, /presets clear, /presets status subcommands

The `/presets` command SHALL accept three additional subcommands beyond those introduced in change 2:

- `<name>` — activate the named preset (any token that is not a known subcommand is interpreted as a preset name).
- `clear` — clear the active preset per the baseline-overlay restore rules with user-override protection. The result SHALL be delivered via `ctx.ui.notify` (prompt invocation surface).
- `status` — print a textual summary of active state including baseline, `lastApplied`, current Pi values, per-field ownership classification (extension-owned / user override / already at baseline), `applyCount`, and the attachment kind (`baseline` vs. `priorUnknown`). The summary SHALL be delivered via `ctx.ui.notify` (prompt invocation surface).

The picker provides additional in-overlay paths to `clear` and `status` whose textual content is identical but whose delivery surface is the shared info-dialog overlay (see the picker capability for those scenarios).

#### Scenario: Activate by name

- **WHEN** the user runs `/presets plan` and `plan` exists and is available
- **THEN** the preset SHALL be applied per the apply requirement

#### Scenario: Activate unknown name

- **WHEN** the user runs `/presets does-not-exist`
- **THEN** an error SHALL be reported listing available preset names and no state change SHALL occur

#### Scenario: Clear from prompt

- **WHEN** the user runs `/presets clear`
- **THEN** the clear flow SHALL run per the clear requirement
- **AND** the result SHALL be delivered via `ctx.ui.notify`

#### Scenario: Status with no active preset

- **WHEN** the user runs `/presets status` and no preset is active
- **THEN** an info message SHALL state that no preset is active, delivered via `ctx.ui.notify`

#### Scenario: Status with baseline-managed attachment from prompt

- **WHEN** the user runs `/presets status` from the prompt and a preset is active with `restore.kind === "baseline"`
- **THEN** the output SHALL be delivered via `ctx.ui.notify`
- **AND** the output SHALL show the active name and scope, the attachment kind with `applyCount`, the baseline values, `lastApplied` values, and current Pi values for model, thinking, and tools
- **AND** each field SHALL be classified as extension-owned, user-overridden, already at baseline, or (tools only) not owned by the overlay

#### Scenario: Status with priorUnknown attachment from prompt

- **WHEN** the user runs `/presets status` from the prompt and a preset is active with `restore.kind === "unknown"`
- **THEN** the output SHALL be delivered via `ctx.ui.notify`
- **AND** the output SHALL indicate `priorUnknown (no restore baseline — clear will only un-attach)`
- **AND** SHALL show current Pi values for model, thinking, and tools

### Requirement: model_select handler is reserved

The package SHALL register a `model_select` event handler that performs no behavior in this change beyond a self-call guard reservation. The handler exists so that change 6 can fill it in without restructuring extension wiring; in this change it MUST NOT clear, re-baseline, or otherwise alter the active state in response to model changes.

#### Scenario: Manual model change while preset is active

- **WHEN** a preset is active and the user changes the model via `/model` or model cycling
- **THEN** the active preset SHALL remain attached unchanged and the compact footer indicator SHALL continue to display the active preset name
- **AND** a subsequent `/presets clear` SHALL detect the override and leave the model unchanged while still restoring other fields per the clear requirement
- **AND** the README SHALL document this as a known temporary gap until change 6

### Requirement: New activations route through the permission gate

The package SHALL route every NEW activation through the permission gate defined
by the `preset-access-policy` capability before invoking the apply flow. New
activations are: the `--preset` flag, manual `/presets <name>` selection, picker
activation, and per-preset hotkey activation.

When the gate reports that the target preset is not permitted for the current
cwd, the package SHALL present the warning overlay and SHALL invoke the apply
flow only on explicit override; on cancel the package SHALL NOT change model,
thinking, or tools and SHALL NOT attach the preset. When the target is
permitted, activation SHALL proceed exactly as before this change.

Session restore SHALL bypass the gate: re-attaching a previously-active preset
on `session_start` SHALL NOT consult the gate and SHALL behave exactly as
specified by the existing restore requirement.

#### Scenario: Permitted activation is unchanged

- **WHEN** an activation targets a permitted preset
- **THEN** the gate SHALL pass through and the apply flow SHALL run exactly as specified before this change

#### Scenario: Non-permitted activation gated before apply

- **WHEN** an activation targets a non-permitted preset
- **THEN** the warning overlay SHALL be shown and the apply flow SHALL run only on explicit override

#### Scenario: Cancel leaves state untouched

- **WHEN** an activation targets a non-permitted preset and the user cancels
- **THEN** no model, thinking, or tools change SHALL occur and no preset SHALL be attached

#### Scenario: Restore bypasses the gate

- **WHEN** a session is resumed re-attaching a preset that would be non-permitted
- **THEN** the gate SHALL NOT be consulted and restore SHALL re-attach the preset per the existing restore requirement

### Requirement: Session-start consults the policy default

The package SHALL extend the `session_start` activation sequence with a
policy-default step that runs after the `--preset` flag step and the
session-restore step. This step SHALL auto-activate the resolved policy default
(see the `preset-access-policy` capability) only on a fresh session — that is,
only when the flag did not activate a preset and restore did not attach an
existing active preset (including a failed restore, which attaches nothing). The
step SHALL NOT alter the behavior of the flag step, the restore step, or the
apply/clear engine; it only adds a new, lower-precedence entry point into the
existing apply flow.

The activation precedence at `session_start` SHALL therefore be, highest to
lowest: `--preset` flag, session restore (when the named preset still loads),
policy default, Pi baseline.

#### Scenario: Policy default step runs after flag and restore

- **WHEN** a fresh session starts with no flag and nothing to restore, and a policy default resolves
- **THEN** the policy-default step SHALL apply that preset through the standard apply flow

#### Scenario: Policy default step is skipped when a higher-precedence step wins

- **WHEN** either the `--preset` flag activates a preset or session restore re-attaches a still-loadable preset
- **THEN** the policy-default step SHALL be a no-op

#### Scenario: Existing apply, clear, and restore behavior is unchanged

- **WHEN** a preset is applied, cleared, or restored through any existing path
- **THEN** the baseline-overlay, user-override, instruction-injection, audit-trail, and footer behaviors SHALL behave exactly as specified before this change

### Requirement: Clear restores a max thinking baseline

The package SHALL capture `"max"` when it is Pi's current thinking level before preset activation. If clear later determines that the thinking level remains owned by the preset overlay, it SHALL restore that max baseline through the existing per-field clear rules.

#### Scenario: Max baseline is restored

- **WHEN** Pi is using `"max"` before a preset applies another thinking level
- **AND** clear determines that the preset still owns the thinking-level field
- **THEN** clear SHALL call `pi.setThinkingLevel("max")`
