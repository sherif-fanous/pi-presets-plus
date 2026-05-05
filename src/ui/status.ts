/**
 * Status-bar rendering for active presets.
 *
 * Owns the compact `presets-plus` footer status entry; it does NOT
 * compute drift or mutate active state.
 */
import type { ActivePresetState, LoadedPreset } from "../types.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "presets-plus";

/** Minimal context surface needed to update footer status. */
type StatusContext = Pick<ExtensionContext, "ui">;

/** Render or clear the active-preset status badge. */
export function updateStatus(
  ctx: StatusContext,
  active: ActivePresetState | undefined,
  lookup: (
    name: string,
    scope: ActivePresetState["scope"],
  ) => LoadedPreset | undefined,
): void {
  if (!active) {
    ctx.ui.setStatus(STATUS_KEY, dim(ctx, "preset: none"));

    return;
  }

  const preset = lookup(active.name, active.scope);

  if (!preset) {
    ctx.ui.setStatus(STATUS_KEY, dim(ctx, "preset: none"));

    return;
  }

  const label = dim(ctx, `preset: ${preset.name}`);

  if (!active.dirty) {
    ctx.ui.setStatus(STATUS_KEY, label);

    return;
  }

  ctx.ui.setStatus(STATUS_KEY, `${label}${warning(ctx, "!")}`);
}

function dim(ctx: StatusContext, text: string): string {
  return ctx.ui.theme?.fg("dim", text) ?? text;
}

function warning(ctx: StatusContext, text: string): string {
  return ctx.ui.theme?.fg("warning", text) ?? text;
}
