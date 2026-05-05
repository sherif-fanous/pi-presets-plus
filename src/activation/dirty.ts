/**
 * Dirty-flag transitions for the active preset attachment.
 *
 * Owns flipping the in-memory dirty flag and refreshing the status badge;
 * it does NOT decide whether drift exists, notify the user, or read the
 * on-disk preset files. Status refresh uses a synthetic preset built from
 * the active state's cached `declared` snapshot, so the helpers stay
 * in-memory only and never reopen the preset JSON files.
 */
import type { ActivePresetState, LoadedPreset } from "../types.js";
import { updateStatus } from "../ui/status.js";
import { getActive, setActive } from "./active-state.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Minimal context surface needed to refresh status after dirty changes. */
type DirtyContext = Pick<ExtensionContext, "ui">;

/** Mark the active preset clean, preserving its restore discriminator. */
export async function markClean(ctx: DirtyContext): Promise<void> {
  const active = getActive();

  if (!active?.dirty) return;

  setActive({ ...active, dirty: false });
  refreshStatus(ctx, getActive());

  await Promise.resolve();
}

/** Mark the active preset dirty, preserving its restore discriminator. */
export async function markDirty(ctx: DirtyContext): Promise<void> {
  const active = getActive();

  if (!active || active.dirty) return;

  setActive({ ...active, dirty: true });
  refreshStatus(ctx, getActive());

  await Promise.resolve();
}

function refreshStatus(
  ctx: DirtyContext,
  active: ActivePresetState | undefined,
): void {
  // Synthesize a `LoadedPreset` from the active state so `updateStatus`
  // can render `preset: <name>` without re-reading the preset JSON files.
  // The badge only needs `name` + `scope`; everything else is filler.
  const synthetic: LoadedPreset | undefined = active
    ? {
        model: active.declared.model,
        name: active.name,
        provider: active.declared.provider,
        scope: active.scope,
        ...(active.declared.thinkingLevel !== undefined
          ? { thinkingLevel: active.declared.thinkingLevel }
          : {}),
        ...(active.declared.tools !== undefined
          ? { tools: [...active.declared.tools] }
          : {}),
      }
    : undefined;

  updateStatus(ctx, active, (name, scope) =>
    synthetic && synthetic.name === name && synthetic.scope === scope
      ? synthetic
      : undefined,
  );
}
