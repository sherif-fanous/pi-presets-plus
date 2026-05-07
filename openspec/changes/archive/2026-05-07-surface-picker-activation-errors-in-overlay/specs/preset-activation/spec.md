## MODIFIED Requirements

### Requirement: Apply a preset using a baseline overlay

The package SHALL apply a preset by (a) deciding whether to reuse an existing baseline-managed overlay or capture a fresh baseline of current Pi state, (b) setting the model via `pi.setModel`, the thinking level via `pi.setThinkingLevel` (using the effective level), and (when the preset specifies a non-empty `tools` array) the active tools via `pi.setActiveTools`, and (c) recording the applied preset's name and scope together with the baseline, the just-applied values as `lastApplied`, an `owned` bookkeeping record, and an incremented `applyCount`.

`apply()` SHALL return one of two shapes:

- `{ ok: true }` on success.
- `{ ok: false; reason: string; kind: "no-key" | "no-model" | "unknown-model" | "key-revoked" }` on refusal. The `reason` is human-readable and SHALL be the only text the package surfaces for that failure; the `kind` is a stable enum suitable for test assertions and call-site routing decisions.

`apply()` SHALL NOT call `ctx.ui.notify` for refusals. Callers SHALL surface the `reason` through their context-appropriate channel (e.g. `ctx.ui.notify` for prompt / hotkey / flag / session-restore callers; the shared info-dialog overlay for picker callers per the `preset-picker` capability).

`apply()` MAY still call `ctx.ui.notify` with severity `warning` for non-refusal accompaniments (e.g. unknown-tools dropped during a successful apply). Warnings ride alongside `ok: true` and are not part of the refusal return path.

Baseline capture rules, ownership rules, and `lastApplied` rules are unchanged from the previous version of this requirement.

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
