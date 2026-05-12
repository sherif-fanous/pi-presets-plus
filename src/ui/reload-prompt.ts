/**
 * Reload confirmation helper shared by commit-time preset mutations.
 *
 * Owns the user-facing reload prompt and guarded `ctx.reload()` invocation;
 * it does NOT own deciding whether a particular preset mutation needs a
 * reload.
 */
import { openConfirm } from "./confirm.js";
import { RELOAD_PROMPT_TITLE } from "./labels.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const RELOAD_PROMPT_BODY =
  "Hotkey changes take effect after a reload. Reload now?";

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
 * Reload failures are reported to the user instead of escaping the calling
 * editor or picker flow. Callers should resolve their overlay before invoking
 * this helper; otherwise stale TUI components may survive the extension reload.
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
