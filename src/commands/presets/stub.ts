/**
 * Bare `/presets` invocation handler.
 *
 * Replaces change 1's "scaffold; full features coming" notification with
 * a pointer at the two subcommands that now exist. Future changes extend
 * this message as new subcommands come online.
 */
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Show the info notification that describes the currently-available
 * subcommands. Does not perform any I/O.
 */
export function showStubNotice(ctx: Pick<ExtensionContext, "ui">): void {
  ctx.ui.notify(
    "No picker UI yet — try `/presets list` to see loaded presets, or `/presets reload` to re-read the JSON files. Picker arrives in a later change.",
    "info",
  );
}
