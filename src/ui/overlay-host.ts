/**
 * Runs a nested dialog over an existing overlay, hiding the host overlay
 * for the duration and then restoring, refocusing, and re-rendering it.
 */
import type { OverlayHandle } from "@earendil-works/pi-tui";

/**
 * Hide `handle` while `fn` runs, then restore it, focus it, and request a
 * render. The overlay is restored even when `fn` throws, so an error from
 * a nested dialog cannot leave the host overlay stuck in its hidden state.
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
