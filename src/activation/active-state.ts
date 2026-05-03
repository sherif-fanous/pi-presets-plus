/**
 * In-memory active-preset reference for the activation runtime.
 *
 * Owns the module-scoped state cell tracking which preset is currently
 * active; it does NOT persist session entries, update status, or mutate
 * pi model/tool state.
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
