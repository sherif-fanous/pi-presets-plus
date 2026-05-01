## Context

This change is the activation engine. Storage is in place from change 2; this change adds the runtime layer that moves pi state when the user picks a preset, and undoes those moves when they clear it.

The central design question is: **what does `/presets clear` mean?** Early iterations used a “depth-1 snapshot” model where every apply snapshotted current state and clear restored the latest snapshot. That produced a confusing outcome for chained applies: `A → B → clear` left Pi looking like preset A but with no active preset attached, and it silently overwrote manual user changes. This change replaces that model with a **baseline overlay with user-override protection**:

1. **Baseline overlay.** The first preset activation while no preset is attached captures a baseline of Pi state. Subsequent switches between presets preserve that baseline instead of overwriting it. Clear attempts to return to the original baseline, so the entire preset chain unwinds in one step.
2. **User-override protection.** For each field (model, thinking level, tools), clear restores the baseline only when current Pi state still looks extension-owned — i.e. still equal to the last value presets-plus wrote, or already equal to the baseline. If the user manually changed the field after activation, clear leaves that field alone.
3. **No surprise edits during restore.** When a session is resumed with a preset recorded as active, we attach it as `priorUnknown` without fabricating a baseline. Clearing a `priorUnknown` attachment never touches Pi state.
4. **Visibility.** Clear always emits a result notification describing exactly what it did per field. The `/presets status` subcommand is the long-form equivalent.

Drift detection (change 6), the `--preset` CLI flag, cycle commands, and per-preset hotkeys (change 7) remain out of scope.

## Goals / Non-Goals

**Goals**

- Activation that captures a baseline on the first preset while no overlay is active, preserves that baseline across preset switches, and bookkeeps `lastApplied`/`owned`/`applyCount` so clear can reason about ownership.
- Clear with per-field decisions: `current == baseline` → no-op; `current == lastApplied` → restore baseline; otherwise → treat as user override and leave unchanged.
- Clear always reports what it did.
- Re-apply that syncs drifted state (not a no-op) so the user has a deterministic way to force-sync without losing the baseline.
- Session restore that re-attaches the preset name and re-injects instructions, but never re-writes model/thinking/tools and never invents a baseline.
- Compact dim-themed footer indicator that reflects the active preset name without duplicating Pi's built-in model + thinking display.
- Visible activation marker message in the conversation, ignored by the LLM.

**Non-Goals**

- Drift detection on `model_select` or via `turn_start` — change 6.
- Persisting the baseline across sessions. The baseline is in-memory only. A resumed session with an active preset always attaches as `priorUnknown`.
- `--preset` CLI flag, `/presets next`/`prev`, per-preset hotkeys — change 7.
- Editor or capture UIs — change 5.
- Picker UI — change 4.
- A preset "stack" where clear pops back to the previous active preset. Clear returns to the pre-extension baseline, not to an earlier preset.

## Decisions

### Active state shape

```ts
// src/types.ts (additions)
export interface PresetOverlayBaseline {
  // Pi state captured immediately before the first preset activation
  // in an overlay. `model === null` means no model was selected at that
  // time. `tools` is captured unconditionally so clear can reason about
  // tools the overlay touched, but `owned.tools` gates whether clear
  // actually writes it.
  model: { provider: string; id: string } | null;
  thinkingLevel: ThinkingLevel;
  tools: string[];
}

export interface LastAppliedPresetEffects {
  // The last values presets-plus wrote to Pi. Used by clear to detect
  // whether current state still looks extension-owned.
  model: { provider: string; id: string };
  thinkingLevel: ThinkingLevel; // effective level actually set
  tools?: string[]; // present iff any preset in the overlay wrote tools
}

export interface PresetOverlayOwnership {
  // Model and thinking are always written on apply, so these are always
  // true in the baseline-managed shape. Tools are only owned if at least
  // one preset in the overlay declared a non-empty tools array.
  model: true;
  thinkingLevel: true;
  tools: boolean;
}

export type ActivePresetState =
  | {
      name: string;
      scope: PresetScope;
      restore: {
        kind: "baseline";
        baseline: PresetOverlayBaseline;
        lastApplied: LastAppliedPresetEffects;
        owned: PresetOverlayOwnership;
        applyCount: number; // number of successful applies in this overlay
      };
    }
  | {
      name: string;
      scope: PresetScope;
      restore: { kind: "unknown" }; // session-restore attachment
    };
```

A `dirty: boolean` field will be added in change 6; it is intentionally absent here so this change ships a complete-feeling shape without a flag that does nothing.

### Apply semantics

Three deliberate properties:

1. **Baseline is captured once per overlay.** On the first successful activation while no baseline-managed preset is attached, we capture the baseline. Subsequent switches reuse it.
2. **lastApplied / owned are updated on every successful apply.** `lastApplied.model` and `lastApplied.thinkingLevel` always reflect the most recent successful apply. `lastApplied.tools` is only updated when the new preset declares a non-empty `tools` array; otherwise it carries forward the previous value. `owned.tools` is sticky-true — once any preset in the overlay wrote tools, the overlay "owns" the tools channel for the rest of its lifetime.
3. **No-op re-apply stays a no-op.** When the same preset is already active and `stateMatches` returns true, apply short-circuits and no state changes, baseline updates, session entries, or markers are emitted.

Pseudocode:

```ts
async function apply(preset: LoadedPreset) {
  if (preset.unavailable) {
    notifyError(`Preset "${preset.name}" is unavailable…`);
    return;
  }

  const current = getActive();

  // No-op re-apply.
  if (
    current?.name === preset.name &&
    current.scope === preset.scope &&
    current.restore.kind === "baseline" &&
    stateMatches(preset, ctx)
  ) {
    return;
  }

  // Decide baseline + applyCount + previous owned/lastApplied.
  let baseline: PresetOverlayBaseline;
  let applyCount: number;
  let previousOwnedTools = false;
  let previousAppliedTools: string[] | undefined;

  if (current?.restore.kind === "baseline") {
    // Preserve baseline across preset switches.
    baseline = current.restore.baseline;
    applyCount = current.restore.applyCount + 1;
    previousOwnedTools = current.restore.owned.tools;
    previousAppliedTools = current.restore.lastApplied.tools;
  } else {
    // No overlay, or priorUnknown. Capture a fresh baseline from current
    // Pi state. (priorUnknown means we cannot reconstruct the pre-A
    // baseline; the best we can do is capture the current state.)
    baseline = captureBaseline(pi, ctx);
    applyCount = 1;
  }

  // Resolve and write model/thinking.
  const model = ctx.modelRegistry.find(preset.provider, preset.model);
  if (!model) { notifyError(…); return; }
  if (!(await setModelGuarded(preset.provider, preset.model))) return;

  const effective = effectiveThinkingLevel(preset, model);
  pi.setThinkingLevel(effective);
  if (effective !== (preset.thinkingLevel ?? "off")) {
    notifyInfo(`Preset "${preset.name}" requested thinking:${preset.thinkingLevel ?? "off"} for ${preset.provider}/${preset.model}; applied "${effective}" instead.`);
  }

  // Tools.
  let appliedTools = previousAppliedTools;
  let ownedTools = previousOwnedTools;
  if (preset.tools && preset.tools.length > 0) {
    const validTools = filterValidTools(preset.tools, pi.getAllTools());
    const dropped = preset.tools.filter((t) => !validTools.includes(t));
    if (dropped.length > 0) {
      notifyWarning(`Preset "${preset.name}" references unknown tools: ${dropped.join(", ")}…`);
    }
    pi.setActiveTools(validTools);
    appliedTools = validTools;
    ownedTools = true;
  }

  setActive({
    name: preset.name,
    scope: preset.scope,
    restore: {
      kind: "baseline",
      baseline,
      lastApplied: {
        model: { provider: preset.provider, id: preset.model },
        thinkingLevel: effective,
        ...(appliedTools !== undefined ? { tools: appliedTools } : {}),
      },
      owned: {
        model: true,
        thinkingLevel: true,
        tools: ownedTools,
      },
      applyCount,
    },
  });

  pi.appendEntry("presets-plus:active", { name: preset.name, scope: preset.scope });
  pi.sendMessage({ customType: "presets-plus:activated", display: true, content: `Preset activated: ${preset.name}`, details: { name: preset.name, model: `${preset.provider}/${preset.model}`, thinkingLevel: effective } });
  updateStatus();
}
```

### Clear semantics

Per-field decision table (identical for model, thinkingLevel, and tools):

| Current Pi value                                      | Interpretation              | Clear action         |
| ----------------------------------------------------- | --------------------------- | -------------------- |
| equal to baseline value                               | Already at baseline         | No write             |
| equal to `lastApplied` value (and channel is `owned`) | Still extension-owned       | Write baseline value |
| anything else (or channel not owned)                  | User override / non-overlay | Leave unchanged      |

Tools have an additional gate: if `owned.tools === false`, the overlay never wrote tools and clear SHALL NOT write tools regardless of comparisons.

`priorUnknown` attachments take the soft-clear branch: detach only, never touch Pi state.

Pseudocode:

```ts
async function clear() {
  const active = getActive();
  if (!active) {
    notifyInfo("No active preset to clear.");
    return;
  }

  if (active.restore.kind === "unknown") {
    clearActive();
    pi.appendEntry("presets-plus:active", { name: null });
    updateStatus();
    notifyInfo(
      `Cleared preset "${active.name}"; model, thinking, and tools unchanged ` +
        `because no restore baseline was available.`,
    );
    return;
  }

  const { baseline, lastApplied, owned } = active.restore;
  const parts: ClearPart[] = [];

  // Model
  const currentModel = currentModelRef(ctx); // { provider, id } | null
  if (equalsModel(currentModel, baseline.model)) {
    parts.push({ field: "model", action: "already-baseline" });
  } else if (equalsModel(currentModel, lastApplied.model)) {
    if (baseline.model) {
      const ok = await setModelGuarded(
        baseline.model.provider,
        baseline.model.id,
      );
      parts.push({
        field: "model",
        action: ok ? "restored" : "restore-failed",
      });
    } else {
      // Cannot "unset" a model via Pi API; report and leave.
      parts.push({ field: "model", action: "baseline-null" });
    }
  } else {
    parts.push({ field: "model", action: "user-override" });
  }

  // Thinking
  const currentThinking = pi.getThinkingLevel();
  if (currentThinking === baseline.thinkingLevel) {
    parts.push({ field: "thinking", action: "already-baseline" });
  } else if (currentThinking === lastApplied.thinkingLevel) {
    pi.setThinkingLevel(baseline.thinkingLevel);
    parts.push({ field: "thinking", action: "restored" });
  } else {
    parts.push({ field: "thinking", action: "user-override" });
  }

  // Tools
  if (!owned.tools) {
    parts.push({ field: "tools", action: "not-owned" });
  } else {
    const currentTools = pi.getActiveTools();
    const lastAppliedTools = lastApplied.tools ?? [];
    if (toolsEqual(currentTools, baseline.tools)) {
      parts.push({ field: "tools", action: "already-baseline" });
    } else if (toolsEqual(currentTools, lastAppliedTools)) {
      const allowed = new Set(pi.getAllTools().map((t) => t.name));
      const filtered = baseline.tools.filter((t) => allowed.has(t));
      const dropped = baseline.tools.filter((t) => !allowed.has(t));
      pi.setActiveTools(filtered);
      parts.push({
        field: "tools",
        action: dropped.length > 0 ? "restored-partial" : "restored",
        dropped,
      });
    } else {
      parts.push({ field: "tools", action: "user-override" });
    }
  }

  clearActive();
  pi.appendEntry("presets-plus:active", { name: null });
  updateStatus();
  notifyInfo(renderClearSummary(active.name, parts));
}
```

Tools equality uses set-equality on tool names (sorted-array comparison). Thinking equality compares raw strings. Model equality compares `provider` and `id` exactly; `null` only equals `null`.

### Clear result notification

Rendered from the `parts` list above. Examples:

- All restored: `Cleared preset "qa-full"; restored model, thinking, and tools.`
- Model overridden: `Cleared preset "qa-full"; restored thinking and tools; left model unchanged because it changed after activation.`
- Tools not owned: `Cleared preset "qa-minimal"; restored model and thinking; tools were unchanged.`
- Multi-preset chain back to baseline: `Cleared preset "qa-full"; restored model, thinking, and tools.` (the user experience is identical regardless of how many presets were chained; clear always targets the original baseline.)
- `priorUnknown`: `Cleared preset "qa-full"; model, thinking, and tools unchanged because no restore baseline was available.`
- Restore-failed model: `Cleared preset "qa-full"; could not restore previous model github-copilot/gpt-5.5; restored thinking and tools.`
- Tools restored with drops: `Cleared preset "qa-full"; restored model and thinking; restored tools except unavailable: foo, bar.`
- Nothing to clear: `No active preset to clear.`

Implementation splits the renderer into a pure function `renderClearSummary(name, parts)` for test coverage.

### `stateMatches` used by the no-op rule

Unchanged from previous design: compares the preset's declared fields against current Pi state using `effectiveThinkingLevel` for the thinking dimension. The no-op rule only applies when `current.restore.kind === "baseline"` AND the name/scope match AND `stateMatches(preset, ctx)`. If any of those is false, apply runs the full flow and updates `lastApplied`/`applyCount` as above.

### Self-call guard for `model_select`

Unchanged from previous design. Change 6 fills in the handler body.

### Session restore

```ts
pi.on("session_start", async (_event, ctx) => {
  const branch = ctx.sessionManager.getBranch();
  const lastActiveEntry = findLastCustomEntry(branch, "presets-plus:active");
  if (!lastActiveEntry || lastActiveEntry.data.name === null) {
    clearActive();
    updateStatus();
    return;
  }

  const data = lastActiveEntry.data as { name: string; scope?: PresetScope };
  const preset = lookup(data.name, data.scope ?? "user");
  if (!preset || preset.unavailable) {
    ctx.ui.notify(
      `Restored session referenced preset "${data.name}" which is ${preset ? `unavailable (${preset.unavailable})` : "not loaded"}; not attaching.`,
      "warning",
    );
    clearActive();
    updateStatus();
    return;
  }

  setActive({
    name: preset.name,
    scope: preset.scope,
    restore: { kind: "unknown" },
  });
  updateStatus();
});
```

We deliberately do not fabricate a baseline at restore time: we do not know what state Pi had immediately before the original activation, and guessing is worse than being honest. The user can re-apply explicitly (`/presets <name>`) to start a fresh baseline-managed overlay.

### `/new` and `/fork`

Unchanged from previous design: both fall out for free from the restore logic.

### Instruction injection: append, not replace

Unchanged from previous design.

### Activation marker message

Unchanged from previous design.

### `/presets status`

This subcommand is the user's diagnostic window. Sample output for a baseline-managed attachment:

```
Active preset:        qa-full (project)
Attachment:           baseline (applyCount: 2)
Baseline model:       anthropic/claude-opus-4.5
Baseline thinking:    low
Baseline tools:       read, grep, ls
Last applied model:   anthropic/claude-sonnet-4-6
Last applied thinking: high
Last applied tools:   read, bash, edit
Current model:        anthropic/claude-sonnet-4-6    ← extension-owned
Current thinking:     high                           ← extension-owned
Current tools:        read, bash, edit               ← extension-owned
Tools owned by overlay: yes
```

When a field drifts:

```
Current model:        openai/gpt-5.2-codex           ← user override
```

When the field matches baseline (rare mid-activation but possible after a manual revert):

```
Current thinking:     low                            ← already at baseline
```

For a `priorUnknown` attachment:

```
Active preset:        qa-full (project)
Attachment:           priorUnknown (no restore baseline — clear will only un-attach)
Current model:        anthropic/claude-sonnet-4-6
Current thinking:     high
Current tools:        read, bash, edit
```

### Effective thinking level

Unchanged from previous design.

## Risks / Trade-offs

- **Clear cannot always fully restore.** When a user manually changes model away from the preset's value, clear respects the override and leaves model alone. That is intentional but means a user who wants a hard reset has to manually revert their changes first. The clear message makes this explicit.
- **Baseline equals `lastApplied` edge case.** If the baseline model coincidentally equals the preset's model (e.g. user was already on that model), the overlay still writes it during apply (a no-op for Pi) and clear's `current == lastApplied` branch triggers. The net effect is still correct. Covered by tests.
- **Set-equality for tools.** Two tool lists with different orderings are treated as equal. This is intentional; Pi's tool ordering is not user-facing. If a future Pi version makes ordering meaningful, this helper becomes the single point to update.
- **priorUnknown → apply → clear returns to the restore-time state, not the pre-original-activation state.** We document this clearly in `/presets status` and in the activation/clear notifications. It is strictly better than silently inventing an incorrect baseline.
- **No baseline persistence.** Closing and resuming a session drops the baseline; the first post-resume activation captures a fresh baseline from whatever Pi state was restored. Persisting the baseline is possible but out of scope here; it would need explicit session schema support.
- **Self-call guard is a module-level boolean.** Same as before: safe given Pi's sequential event delivery today; revisit if concurrency assumptions change.
