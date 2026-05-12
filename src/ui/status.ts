/**
 * Status-bar rendering for active presets.
 *
 * Owns the compact `presets-plus` footer status formatter; it does NOT
 * compute drift, mutate active state, or write to the Pi UI directly.
 */
import type { ActivePresetState } from "../types.js";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const STATUS_KEY = "presets-plus";

/** Render the active-preset status badge. */
export function renderStatusBadge(
  active: ActivePresetState | undefined,
  theme: Theme | undefined,
): string {
  if (!active) return dim(theme, "Preset: none");

  const label = dim(theme, `Preset: ${active.name}`);

  if (!active.dirty) return label;

  return `${label}${warning(theme, "!")}`;
}

function dim(theme: Theme | undefined, text: string): string {
  return theme?.fg("dim", text) ?? text;
}

function warning(theme: Theme | undefined, text: string): string {
  return theme?.fg("warning", text) ?? text;
}
