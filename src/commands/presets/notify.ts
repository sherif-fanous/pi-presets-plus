/**
 * Shared notification helper for `/presets` subcommands.
 *
 * Owns rolling load-time warnings into a single user-visible notification
 * so callers do not flood the UI; it does NOT own loading or validation.
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
