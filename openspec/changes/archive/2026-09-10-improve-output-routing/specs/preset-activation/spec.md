## MODIFIED Requirements

### Requirement: Apply uses effective thinking level and returns apply accompaniments

During apply, the package SHALL compute the effective thinking level from the preset and the resolved model using the same rule pi-ai's `getSupportedThinkingLevels` applies. If the model has `reasoning: false` (or falsy), the only valid level SHALL be `"off"`. Otherwise, for each level other than `"xhigh"` the level is valid unless `thinkingLevelMap?.[level]` is exactly `null`; `"xhigh"` is valid only when `thinkingLevelMap?.["xhigh"]` is defined and not `null`. The effective level SHALL be the preset's declared level (or `"off"` if absent) when valid for the resolved model, otherwise `"off"`. The package SHALL call `pi.setThinkingLevel` with the effective level.

The apply operation SHALL return successful accompaniments for user-facing changes or warnings, including a thinking-level adjustment and dropped unknown tools. The apply operation SHALL NOT directly emit a success notification or a separate accompaniment notification. The caller SHALL choose the delivery surface and SHALL be able to combine all accompaniments with the activation result in one user-facing outcome.

The validity check SHALL access `thinkingLevelMap` defensively (optional-chained read) so that pi-ai versions predating the field's introduction degrade to the same rule applied to an undefined map (levels through `"high"` remain valid; `"xhigh"` drops off).

#### Scenario: Reasoning model with no thinkingLevelMap honors declared level through high

- **WHEN** apply runs for a preset with `thinkingLevel: "high"` and the resolved model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** `pi.setThinkingLevel("high")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with no thinkingLevelMap clamps xhigh to off with notification

- **WHEN** apply runs for a preset with `thinkingLevel: "xhigh"` and the resolved model has `reasoning: true` and no `thinkingLevelMap` field
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level (`xhigh`), and actual level (`off`)

#### Scenario: Reasoning model with thinkingLevelMap missing a non-xhigh key honors declared level

- **WHEN** apply runs for a preset with `thinkingLevel: "low"` and the resolved model has `reasoning: true` and `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** `pi.setThinkingLevel("low")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model with thinkingLevelMap mapping xhigh to a non-null value honors declared level

- **WHEN** apply runs for a preset with `thinkingLevel: "xhigh"` and the resolved model has `thinkingLevelMap: { "xhigh": "max" }`
- **THEN** `pi.setThinkingLevel("xhigh")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Reasoning model clamps when thinkingLevelMap explicitly nulls the requested level

- **WHEN** apply runs for a preset with `thinkingLevel: "low"` and the resolved model has `reasoning: true` and `thinkingLevelMap: { "low": null }`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level (`low`), and actual level (`off`)

#### Scenario: Non-reasoning model clamps to off with notification

- **WHEN** apply runs for a preset with `thinkingLevel: "high"` and the resolved model has `reasoning: false`
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain an info accompaniment naming the preset, requested level (`high`), and actual level (`off`)

#### Scenario: Preset omits thinking level

- **WHEN** apply runs for a preset that has no `thinkingLevel` field
- **THEN** `pi.setThinkingLevel("off")` SHALL be called
- **AND** the apply result SHALL contain no thinking-level accompaniment

#### Scenario: Apply combines a thinking adjustment and dropped tools

- **WHEN** apply adjusts the requested thinking level and drops one or more unknown tools
- **THEN** the apply result SHALL contain both accompaniments
- **AND** no separate user-facing message SHALL be emitted by the apply operation

### Requirement: Activation reports a successful apply without changing LLM context

When a preset is successfully applied, the package SHALL produce one human-facing success outcome that names the preset. The outcome SHALL NOT use `pi.sendMessage()` and SHALL NOT add the activation text to LLM context. If the apply result contains accompaniments, the outcome SHALL include them in the same user-facing report where the delivery surface supports it.

A no-op re-apply SHALL produce no success outcome. Session restore SHALL remain silent because it re-attaches state without applying the preset.

#### Scenario: Interactive activation reports success

- **WHEN** a preset is applied via `/presets <name>` from the prompt
- **THEN** one info notification SHALL name the applied preset
- **AND** the notification SHALL not enter LLM context

#### Scenario: Picker activation reports success

- **WHEN** a preset is applied from the picker and the picker remains the active interaction surface
- **THEN** one user-facing success outcome SHALL name the applied preset
- **AND** the outcome SHALL include any apply accompaniments without adding them to LLM context

#### Scenario: Apply accompaniments are grouped

- **WHEN** an activation succeeds with a thinking adjustment or dropped unknown tools
- **THEN** the user SHALL receive one combined outcome for that activation
- **AND** the outcome SHALL identify each adjustment or warning

#### Scenario: Re-apply that is a no-op

- **WHEN** the re-apply rule short-circuits because state already matches
- **THEN** no activation success outcome SHALL be emitted

#### Scenario: Restore attachment

- **WHEN** the package re-attaches a preset on `session_start` without running apply
- **THEN** no activation success outcome SHALL be emitted

### Requirement: Clear emits one concise, severity-aware result notification

The package SHALL emit exactly one user-visible result on every successful invocation of clear, including the no-active-preset path. The result SHALL name the preset when one was active and SHALL describe the clear outcome. It SHALL preserve the required distinctions for restored fields, user overrides, fields not owned by the overlay, missing baselines, failed restoration, and partially restored tools, but it MAY use concise grouped wording rather than listing every field in all successful cases.

The prompt invocation SHALL deliver the result through `ctx.ui.notify`. A normal successful clear SHALL use info severity. A clear that completes with a restore failure or partial restore SHALL use warning severity. The picker invocation SHALL show the same textual result in the shared info-dialog overlay so the picker remains usable after dismissal.

#### Scenario: Full restore from prompt

- **WHEN** the user runs `/presets clear` from the prompt and clear restores every managed field to baseline
- **THEN** one info notification SHALL name the cleared preset and state that the previous settings were restored

#### Scenario: Full restore from picker

- **WHEN** the user triggers `c` from inside the picker, confirms, and clear restores every managed field to baseline
- **THEN** the result SHALL be shown in the info-dialog overlay above the picker
- **AND** the textual result SHALL match the prompt-invoked result

#### Scenario: User override is preserved

- **WHEN** clear leaves a field unchanged because its current value differs from both baseline and `lastApplied`
- **THEN** the result SHALL state that the field was left unchanged because the user changed it after activation
- **AND** the result SHALL use info severity unless another clear outcome requires warning severity

#### Scenario: Restore failure uses warning severity

- **WHEN** clear detaches the preset but cannot restore one or more baseline values
- **THEN** exactly one result SHALL be delivered
- **AND** the result SHALL use warning severity and name the failed restoration

#### Scenario: PriorUnknown result

- **WHEN** clear runs for a `priorUnknown` attachment
- **THEN** the result SHALL state that the current model, thinking, and tools were unchanged because no restore baseline was available

#### Scenario: Nothing to clear

- **WHEN** clear is invoked with no active preset
- **THEN** exactly one info result SHALL state that no preset is active

### Requirement: `/presets` reports use a command-output surface

The `/presets` command SHALL accept the named-preset and `clear` behaviors already defined by this capability. It SHALL treat `status` as a read-only command report, not as a notification. When the user runs `/presets status` from the prompt in TUI mode, the package SHALL append a durable TUI-only report entry that does not enter LLM context. When the user requests status from inside the picker, the package SHALL show the same report text in the shared info-dialog overlay above the picker.

The status report SHALL include the active name and scope, the attachment kind and `applyCount` when available, baseline values, `lastApplied` values, current Pi values, and per-field ownership classification for a baseline attachment. For a `priorUnknown` attachment it SHALL show the current values and state that no restore baseline is available. With no active preset it SHALL report that no preset is active.

The report SHALL apply its theme when rendered. It SHALL not persist ANSI styling. In RPC mode, the package SHALL deliver the report through the RPC-compatible notification path because JSON and print modes are out of scope.

#### Scenario: Status from the prompt

- **WHEN** the user runs `/presets status` from the prompt in TUI mode
- **THEN** a command report SHALL appear in the conversation
- **AND** the report SHALL be durable in the session
- **AND** the report SHALL not enter LLM context

#### Scenario: Status from the picker

- **WHEN** the user presses `s` in the picker
- **THEN** the status report SHALL appear in an info dialog above the picker
- **AND** dismissing the dialog SHALL return the user to the picker
- **AND** the report text SHALL match the prompt-invoked report

#### Scenario: Status in RPC mode

- **WHEN** the user invokes `/presets status` in RPC mode
- **THEN** the report SHALL be delivered through the RPC notification protocol
- **AND** the report SHALL not be sent to the LLM as a custom message

#### Scenario: Status with no active preset

- **WHEN** the user runs `/presets status` and no preset is active
- **THEN** the command report SHALL state that no preset is active

#### Scenario: Status with a baseline attachment

- **WHEN** the user runs `/presets status` and a preset is active with `restore.kind === "baseline"`
- **THEN** the report SHALL show the active name and scope, attachment kind, `applyCount`, baseline values, `lastApplied` values, current Pi values, and field classifications

#### Scenario: Status with a priorUnknown attachment

- **WHEN** the user runs `/presets status` and a preset is active with `restore.kind === "unknown"`
- **THEN** the report SHALL show current Pi values
- **AND** the report SHALL state that no restore baseline is available and clear will only detach the preset
