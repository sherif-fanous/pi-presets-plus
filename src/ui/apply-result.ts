/**
 * Turns the outcome of a preset activation into a single notification,
 * folding any notices into the message body.
 */
import type { ApplyResult } from "../activation/apply.js";
import type { LoadedPreset } from "../types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Deliver one activation outcome through the current human-facing UI. */
export function notifyApplyResult(
  ctx: Pick<ExtensionContext, "ui">,
  preset: Pick<LoadedPreset, "name">,
  result: ApplyResult,
): void {
  if (!result.ok) {
    ctx.ui.notify(result.reason, "error");

    return;
  }

  if (result.applied === false) return;

  const notices = result.notices ?? [];
  const body = [
    `Preset "${preset.name}" applied.`,
    ...notices.map((notice) => notice.message),
  ].join("\n");
  const severity = notices.some((notice) => notice.severity === "warning")
    ? "warning"
    : "info";

  ctx.ui.notify(body, severity);
}
