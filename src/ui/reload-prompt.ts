/**
 * Asks whether Pi should reload after a preset change, and performs the
 * reload once the calling overlay has closed.
 */
import { openConfirm } from "./confirm.js";
import { RELOAD_PROMPT_TITLE } from "./labels.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Body of the reload confirmation dialog. */
const RELOAD_PROMPT_BODY =
  "Hotkey changes take effect after a reload. Reload now?";

/** Minimum context the reload helpers need. */
interface ReloadContext {
  readonly reload?: () => Promise<void>;
  readonly ui: ExtensionCommandContext["ui"];
}

/** Ask whether Pi should reload now, returning false when reload is unavailable. */
export async function confirmReload(ctx: ReloadContext): Promise<boolean> {
  if (typeof ctx.reload !== "function") return false;

  return openConfirm(ctx, RELOAD_PROMPT_TITLE, RELOAD_PROMPT_BODY);
}

/**
 * Reload Pi after giving custom overlays a turn to resolve and unmount.
 *
 * A failed reload is reported to the user rather than escaping into the
 * calling editor or picker flow. Callers resolve their overlay before
 * calling this helper, or stale TUI components survive the reload.
 */
export function reloadAfterOverlayClose(ctx: ReloadContext): void {
  const { reload } = ctx;

  if (typeof reload !== "function") return;

  setTimeout(() => {
    void reloadPi({ reload, ui: ctx.ui });
  }, 0);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return "unknown error";
}

async function reloadPi(
  ctx: Required<Pick<ReloadContext, "reload" | "ui">>,
): Promise<void> {
  try {
    await ctx.reload();
  } catch (error) {
    ctx.ui.notify(`Failed to reload Pi: ${formatError(error)}.`, "error");
  }
}
