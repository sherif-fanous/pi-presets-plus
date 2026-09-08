/**
 * Runs `/presets reload`, which re-reads both scope files and reports how
 * many presets came back along with any warnings.
 */
import { loadAll } from "../../store/api.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Re-read both preset files and notify the user of the result. */
export async function runReload(ctx: ExtensionContext): Promise<void> {
  const { presets, warnings } = await loadAll(ctx);
  const summary = `Reloaded ${presets.length} preset${presets.length === 1 ? "" : "s"}.`;

  if (warnings.length === 0) {
    ctx.ui.notify(summary, "info");

    return;
  }

  ctx.ui.notify(
    `${summary}\n${warnings.length} warning${warnings.length === 1 ? "" : "s"}:\n- ${warnings.join("\n- ")}`,
    "warning",
  );
}
