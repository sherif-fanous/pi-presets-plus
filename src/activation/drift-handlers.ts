/**
 * Turns Pi model, thinking level, and turn events into dirty-state updates
 * for the active preset, comparing against the snapshot cached on
 * `ActivePresetState` so the per-turn work stays in memory.
 */
import { detectDriftReasons } from "./drift.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Minimal model_select event surface needed for drift handling. */
interface ModelSelectLikeEvent {
  model: { id: string; provider: string };
  source: "cycle" | "restore" | "set";
}

/** Minimal context surface needed for drift comparison and status refresh. */
type DriftHandlerContext = Pick<
  ExtensionContext,
  "model" | "modelRegistry" | "ui"
>;

/** Minimal Pi surface needed for full-state drift sync. */
type DriftHandlerPi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;

/**
 * Handle `model_select` by re-evaluating drift against the cached snapshot.
 *
 * The recheck covers every dimension even when the chosen model matches the
 * preset, because a drifted thinking level or tool set would otherwise show
 * a clean badge until the next `turn_start`.
 */
export async function handleModelSelectDrift(
  event: ModelSelectLikeEvent,
  ctx: DriftHandlerContext,
  pi: DriftHandlerPi,
  session: ActivePresetSession,
): Promise<void> {
  if (session.isSelfTriggered()) return;
  if (event.source === "restore") return;

  await syncDirtyFromCurrentState(ctx, pi, session);
}

/** Recompute all drift reasons and update the dirty flag if needed. */
export async function syncDirtyFromCurrentState(
  ctx: DriftHandlerContext,
  pi: DriftHandlerPi,
  session: ActivePresetSession,
): Promise<void> {
  const active = session.current();

  if (!active) return;

  const reasons = detectDriftReasons(active.declared, pi, ctx);

  if (reasons.length === 0) {
    if (active.dirty) session.markClean(ctx);

    return;
  }

  if (!active.dirty) session.markDirty(ctx);

  await Promise.resolve();
}
