/**
 * Reads the current Pi model, thinking level, and tools so a later clear
 * can restore the values that a preset activation replaced.
 */
import type { PresetOverlayBaseline } from "../types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Minimal context surface needed to capture the current model. */
type BaselineContext = Pick<ExtensionContext, "model">;

/** Minimal Pi surface needed to capture restorable state. */
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
