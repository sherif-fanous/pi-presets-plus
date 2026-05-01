/**
 * Baseline capture for preset activation overlays.
 *
 * Owns reading current Pi state before presets-plus starts or restarts a
 * baseline-managed overlay for OpenSpec change `add-preset-activation`; it
 * does NOT apply presets or restore state. Future restorable fields should be
 * added here only when clear can safely reason about ownership.
 */
import type { PresetOverlayBaseline } from "../types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

/** Minimal context surface needed to capture the current model. */
type BaselineContext = Pick<ExtensionContext, "model">;

/** Minimal pi surface needed to capture restorable state. */
type BaselinePi = Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">;

/** Capture the current Pi state as an overlay restore baseline. */
export function captureBaseline(
  pi: BaselinePi,
  ctx: BaselineContext,
): PresetOverlayBaseline {
  return {
    model: ctx.model
      ? { provider: ctx.model.provider, id: ctx.model.id }
      : null,
    thinkingLevel: pi.getThinkingLevel(),
    tools: pi.getActiveTools(),
  };
}
