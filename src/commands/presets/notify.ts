/**
 * Rolls the warnings a preset load produced into one notification so a
 * broken file does not flood the UI with separate messages.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Show one warning notification listing every warning, or nothing at all
 * when the list is empty.
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
