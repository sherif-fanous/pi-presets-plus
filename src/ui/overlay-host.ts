/**
 * Shared overlay-host helper for nested-dialog flows.
 *
 * Owns the "hide the current overlay, run a nested dialog, restore focus,
 * request a render" pattern used by the picker and editor whenever they
 * open a confirm / info / reload prompt over their own overlay. It does
 * NOT own overlay registration, focus stacks, or any picker / editor
 * state — callers pass their own handle and render trigger.
 *
 * Centralizing the pattern keeps the hide / focus / render order
 * consistent across every nested-dialog site so a future change to the
 * sequence (e.g. an async restore) lands in one place.
 */
import type { OverlayHandle } from "@earendil-works/pi-tui";

/**
 * Hide `handle` while `fn` runs, then restore + focus it and request a
 * render. The hidden window is restored even when `fn` throws so a
 * propagating error from a nested dialog never leaves the host overlay
 * stuck in its hidden state.
 */
export async function withHiddenOverlay<T>(
  handle: OverlayHandle | undefined,
  requestRender: () => void,
  fn: () => Promise<T>,
): Promise<T> {
  handle?.setHidden(true);

  try {
    return await fn();
  } finally {
    handle?.setHidden(false);
    handle?.focus();
    requestRender();
  }
}
