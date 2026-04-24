/**
 * `/presets reload` — re-read both scope files and report the count.
 *
 * A single notification per invocation: warnings are appended to the
 * count message rather than fired as separate notifications so a noisy
 * file does not flood the UI (the same policy as `session_start`
 * pre-warming in `src/index.ts`).
 */

import { loadAll } from "../../store/api.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Run the `reload` subcommand against a live `ExtensionContext`.
 */
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
