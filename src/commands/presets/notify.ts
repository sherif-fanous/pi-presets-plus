/**
 * Shared notification helper for `/presets` subcommands.
 *
 * The storage spec requires load-time warnings to be surfaced as a single
 * rolled-up notification (rather than one-per-warning), so that a user
 * with several broken presets after a bad edit isn't flooded. This helper
 * is the canonical way subcommands and the session-start handler do that.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Fire a single warning-level notification listing every warning, or
 * no-op when the list is empty.
 */
export function surfaceWarnings(
  ctx: Pick<ExtensionContext, "ui">,
  warnings: readonly string[],
): void {
  if (warnings.length === 0) return;

  ctx.ui.notify(
    `${warnings.length} preset warning${warnings.length === 1 ? "" : "s"}:\n- ${warnings.join("\n- ")}`,
    "warning",
  );
}
