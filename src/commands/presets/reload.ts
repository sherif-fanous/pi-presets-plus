/**
 * `/presets reload` command runner.
 *
 * Owns re-reading both scope files on demand and reporting the result to
 * the user as a single notification; it does NOT own the underlying
 * storage layer or activation state.
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
