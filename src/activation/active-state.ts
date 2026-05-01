/**
 * In-memory active-preset reference for activation runtime.
 *
 * Owns only the module-scoped state cell for change `add-preset-activation`;
 * it does NOT persist session entries, update status, or mutate model/tools.
 * Future drift-detection work can extend callers with a dirty flag without
 * replacing this narrow accessor surface.
 */
import type { ActivePresetState } from "../types.js";

let active: ActivePresetState | undefined;

/** Remove the current active-preset attachment. */
export function clearActive(): void {
  active = undefined;
}

/** Return the current active-preset attachment, if any. */
export function getActive(): ActivePresetState | undefined {
  return active;
}

/** Replace the current active-preset attachment. */
export function setActive(next: ActivePresetState): void {
  active = next;
}
