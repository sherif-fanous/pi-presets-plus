## Context

Drift detection closes the lying-status-badge problem documented as a temporary gap in change 3 and 4. Up to and including change 5, the badge shows the preset's *recorded* model and thinking level — but if the user manually changes the model (via `/model` or `Ctrl+P`), the recorded values stop matching reality. This change makes the badge tell the truth.

Two design choices drive everything here:

1. **Mark dirty, don't auto-clear.** An earlier draft (during the umbrella-discussion phase, see `openspec/breakdown.md`) auto-cleared the preset on any manual model change. That was ergonomically aggressive: users complained, "I bumped the model for one comparison; why did you erase my preset?" Marking dirty preserves user intent — the model change sticks, the preset remains attached — and surfaces the divergence in the badge with an asterisk and in the picker with a drift line. The user resolves it explicitly: re-apply from the picker to sync state to the preset, or clear from the picker to un-attach.

2. **Bidirectional transitions.** The dirty flag flips both ways. Drifted → dirty (badge gains asterisk). Re-synced → clean (asterisk disappears). The badge always reflects whether state matches the preset *right now*.

## Goals / Non-Goals

**Goals**

- Real `model_select` handler that marks dirty and clean appropriately.
- Cheap drift handlers: `thinking_level_select` catches thinking drift immediately, while `turn_start` catches tools drift and acts as a safety net.
- Visual feedback via a single character in the status badge and an explanatory line on the active preset's picker card.
- Idempotent: running the comparison twice in a row produces the same result; running it after a re-apply produces clean.
- No surprise behavior changes elsewhere — apply still applies, clear still clears, instructions still inject.

**Non-Goals**

- Changing the user's pi state automatically. Drift detection only updates the dirty flag; never writes to model/thinking/tools.
- Detecting active-tool drift mid-turn. Tool changes are rechecked at turn boundaries.
- Detecting drift in instructions. We can't know what the user changed about other extensions' system prompts; not in scope.
- Expanding text-command status output. Drift details are surfaced in the status badge and picker dialog, not by adding more `/presets status` text.
- Persisting dirty across sessions. Restored attachments start `dirty: false`; the next turn re-evaluates.

## Decisions

### Type extension

`ActivePresetState` already evolved (in earlier changes) into a discriminated
union keyed on `restore.kind`. Drift adds `dirty` as a sibling of `restore`
on both variants — not a new variant.

```ts
// src/types.ts (additions only)
export type ActivePresetState =
  | {
      name: string;
      scope: PresetScope;
      restore: {
        kind: "baseline";
        baseline: PresetOverlayBaseline;
        lastApplied: LastAppliedPresetEffects;
        owned: PresetOverlayOwnership;
        applyCount: number;
      };
      dirty: boolean;          // added in this change
    }
  | {
      name: string;
      scope: PresetScope;
      restore: { kind: "unknown" };
      dirty: boolean;          // added in this change
    };
```

No existing code path that constructs `ActivePresetState` should break —
we initialize `dirty: false` everywhere a state is created (apply, restore).

### `model_select` handler (replaces change-3 placeholder)

```ts
pi.on("model_select", async (event, ctx) => {
  if (isSelfTriggeredModelSet()) return;     // our own setModel inside apply
  if (event.source === "restore") return;    // session restore
  const active = getActive();
  if (!active) return;
  const { presets } = await loadAll(ctx);
  const preset = presets.find(
    (p) => p.name === active.name && p.scope === active.scope,
  );
  if (!preset) return;
  if (event.model.provider === preset.provider && event.model.id === preset.model) {
    if (active.dirty) markClean(ctx);        // user manually re-synced
    return;
  }
  markDirty(ctx, "model changed manually");
});
```

`pi-coding-agent`'s `ModelSelectEvent.source` is `"set" | "cycle" | "restore"`
(verified in `node_modules/.../types.d.ts`). Three short-circuits:
- Self-call guard via `isSelfTriggeredModelSet()` from `src/activation/apply.ts`.
- Source filter — restore is structural, not a user action.
- No-op when no preset is active.

The "user re-synced manually" branch matters: a user who notices the badge is dirty might fix the model selection themselves; we should clear the asterisk in that case.

### `thinking_level_select` and `turn_start` handlers

```ts
pi.on("thinking_level_select", async (_event, ctx) => {
  await syncDirtyFromCurrentState(ctx, pi);
});

pi.on("turn_start", async (_event, ctx) => {
  await syncDirtyFromCurrentState(ctx, pi);
});

async function syncDirtyFromCurrentState(ctx, pi) {
  const active = getActive();
  if (!active) return;
  const { presets } = await loadAll(ctx);
  const preset = presets.find(
    (p) => p.name === active.name && p.scope === active.scope,
  );
  if (!preset) return;

  const reasons = detectDriftReasons(preset, pi, ctx);  // see below

  if (reasons.length === 0) {
    if (active.dirty) markClean(ctx);
  } else if (!active.dirty) {
    markDirty(ctx, reasons.join(", ") + " changed manually");
  }
}
```

Notes:
- `thinking_level_select` gives immediate feedback for manual thinking changes in current Pi versions.
- `turn_start` remains the safety net and catches tool drift because active-tool changes do not have an equivalent extension event in this design.
- `effectiveThinkingLevel(preset, model)` (already in `src/activation/thinking.ts`)
  is used so non-reasoning models don't trigger spurious dirty.
- `preset.tools` only enters the comparison when the preset has tools. A preset
  that omits `tools` never triggers a tool-based dirty (it never claimed those
  tools).
- The order-independent tool comparison reuses `sameSet` from
  `src/activation/same-set.ts` — same primitive `clear`/`stateMatches`
  already use, one source of truth.
- The "did anything change" check runs before the "are we already dirty" check,
  so we avoid an unnecessary state mutation when nothing changed and we're
  already clean.

### Reusing `stateMatches`

`src/activation/state-matches.ts` already exposes `stateMatches(preset, pi, ctx)`,
which is the boolean projection of "are there any drift reasons." To avoid two
parallel implementations of the same comparison, the new
`src/activation/drift.ts` SHOULD own the per-field check and `stateMatches`
SHOULD become a thin `detectDriftReasons(...).length === 0` shim. The single
implementation then powers: the apply fast-path early-return, the picker
drift line (which needs reasons, not just a bool), and the dirty-sync
handlers.

### `markDirty` / `markClean`

```ts
// src/activation/dirty.ts
import { getActive, setActive } from "./active-state.js";
import { updateStatus } from "../ui/status.js";
import { loadAll } from "../store/api.js";

export async function markDirty(
  ctx: Pick<ExtensionContext, "ui">,
  _reason: string,
): Promise<void> {
  const active = getActive();
  if (!active || active.dirty) return;
  setActive({ ...active, dirty: true });
  await refreshStatus(ctx);
  // Optional: only notify the FIRST time per session (track via a separate flag).
}

export async function markClean(
  ctx: Pick<ExtensionContext, "ui">,
): Promise<void> {
  const active = getActive();
  if (!active || !active.dirty) return;
  setActive({ ...active, dirty: false });
  await refreshStatus(ctx);
}
```

Both helpers spread `...active` so the `restore` discriminator is preserved
verbatim — drift is orthogonal to the baseline/unknown axis.

Helpers are intentionally minimal: flip the flag, refresh the badge, return.
Notifications about drift transitions are easy to spam (every Ctrl+P could
fire one), so the default behavior is silent — the badge and picker drift
line are the notification. We may add a subtle one-time notice ("Preset 'plan'
drifted; open `/presets` and press Enter on it to re-sync") but it's optional
and we can decide during implementation.

### Status badge update

The activation capability already shipped a deliberately slim format —
`preset: <name>` rendered in `dim` — because pi's built-in footer already
surfaces the live model and thinking level. Drift detection preserves that
format and only adds a single trailing marker:

- **Clean:** `preset: <name>` (dim) — unchanged from activation.
- **Dirty:** `preset: <name>!` where the trailing `!` is rendered in the
  theme's `warning` color so the divergence is visually obvious without
  expanding the badge's footprint. The rest of the line stays dim.

Sketch (against current `src/ui/status.ts`):

```ts
if (!active.dirty) {
  ctx.ui.setStatus(STATUS_KEY, dim(ctx, `preset: ${preset.name}`));
  return;
}
const label = dim(ctx, `preset: ${preset.name}`);
const marker = ctx.ui.theme?.fg("warning", "!") ?? "!";
ctx.ui.setStatus(STATUS_KEY, `${label}${marker}`);
```

The marker is appended directly after `<name>`, no space, so the eye reads
`name!` as a unit. This format change MODIFIES the activation capability's
"Footer status entry" requirement (see
`specs/preset-activation/spec.md` in this change's delta).

### Picker drift indicator

The picker card (`src/ui/widgets.ts`, `PresetCardComponent`) already renders
fields with a fixed-width label column (`FIELD_LABEL_WIDTH =
"Shadowing:".length` = 10). `Drift:` (6 chars) fits under that width
without layout changes. The card already conditionally appends `Status:`
rows for `clampWarning` and unavailability, both styled with
`theme.fg("warning", …)`; the drift line follows the same pattern.

This change adds one extra line to the active card when `active.dirty === true`:

```text
│ ▌ ● plan                                                            │
│   Scope:      Project                                               │
│   Model:      anthropic / claude-opus-4.5                           │
│   Thinking:   High                                                  │
│   Tools:      read, grep, find, ls                                  │
│   Drift:      ⚠ Dirty — model differs                               │
```

The value is rendered via `theme.fg("warning", …)`, matching the existing
clamp/availability `Status:` rows. To pass dirty info into the card, we
extend `PresetCardOptions` with `dirty?: boolean` and `driftReasons?:
readonly string[]`; the card surfaces the line only when both are present.

For multiple drift reasons, the line lists all names in a comma-separated
phrase, e.g. `⚠ Dirty — model, tools differ`. Clean active presets omit
the line. Inactive presets never show drift details because drift is a
property of the current active attachment, not of the preset definition
itself.

Reason strings are derived from the same `detectDriftReasons` helper used
by `turn_start`, so the badge marker and the picker line never disagree.

### Apply integration

`apply` (in `src/activation/apply.ts`) constructs the active state via
`setActive({ name, scope, restore: { kind: "baseline", … } })`. We add
`dirty: false` to that call. After apply runs, the active state is by
definition clean (we just wrote everything).

**Idempotent fast-path edge case.** Apply currently has an early return
when the requested preset is already active and `stateMatches(preset, pi,
ctx)` is true:

```ts
if (
  current?.name === preset.name &&
  current.scope === preset.scope &&
  current.restore.kind === "baseline" &&
  stateMatches(preset, pi, ctx)
) {
  return { ok: true };
}
```

Without adjustment, this branch would leave a stale `dirty: true` flag on
a re-apply where the user has already manually re-synced state to the
preset (after a manual change but before the next `turn_start` runs). The
spec scenario "Re-apply after drift from picker" expects the dirty flag to
clear immediately. The fix is small: when the fast-path matches and
`current.dirty === true`, call `markClean(ctx)` before returning. (An
equivalent shape: drop the fast-path entirely when dirty, falling through
to the rebuild — but rebuilding `lastApplied`/`baseline` discards the
original pre-activation snapshot, so the targeted `markClean` is
preferred.)

We do *not* otherwise need to call `markClean()` after a full apply because
the state we just constructed already has `dirty: false`.

### Clear integration

`clear` (in `src/activation/clear.ts`) calls `clearActive()` which sets the
module-scoped state cell to `undefined`. Nothing about dirty matters
here — clear unconditionally un-attaches.

### Restore integration

The session-restore path in `src/index.ts` (`restoreActiveFromBranch`)
calls `setActive({ name, scope, restore: { kind: "unknown" } })`. We
change that to include `dirty: false`. The next `turn_start` will evaluate
drift against the restored preset and may flip it dirty if state has
drifted (the user could have edited their global model selection between
sessions).

## Risks / Trade-offs

- **Tool drift can lag until the next turn.** Model drift is immediate via `model_select`, and thinking drift is immediate via `thinking_level_select`, but active-tool drift still waits for `turn_start`. Mitigation: the badge updates before the next agent turn proceeds.
- **`turn_start` runs for every user.** Cost is two or three equality checks; negligible. Mitigation: not really a concern, but worth noting in the README that a passive event handler is now active.
- **Spurious dirty for non-reasoning models** if we forget to use `effectiveThinkingLevel`. Mitigation: covered by unit tests on the comparison helper and tested manually by saving a preset with `thinking: "high"` for a non-reasoning model — the `clampWarning` is set, but the live state should still be `clean` because the effective level is `"off"` and pi's actual level is `"off"`.
- **Notification spam.** If we naively notified on every dirty transition, Ctrl+P would fire one per cycle. Mitigation: silent by default; the badge change is the visible signal. Optional one-time-per-session notice is OK if we add it carefully.
- **`dirty: false` on a `restore: { kind: "unknown" }` attachment is technically a lie if state has already drifted by restore time** — we just don't know yet because `turn_start` hasn't run. Mitigation: the lie lasts at most one turn; the next `turn_start` evaluates and corrects. Acceptable.
- **Re-syncing manually clears dirty without telling the user.** A user might wonder why the asterisk vanished. Mitigation: this is the desired behavior; the badge tells the truth, no narration needed.
