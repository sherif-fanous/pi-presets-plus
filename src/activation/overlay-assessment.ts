/**
 * Classifies the current Pi model, thinking level, and tools against the
 * baseline captured at activation and the values the preset applied.
 */
import type { ActivePresetState } from "../types.js";
import {
  classifyOverlayField,
  type OverlayFieldClassification,
} from "./classify-overlay-field.js";
import { sameModel } from "./same-model.js";
import { sameSet } from "./same-set.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Per-field classification for a preset that captured a baseline. */
export interface BaselineOverlayAssessment {
  readonly kind: "baseline";
  readonly restore: Extract<
    ActivePresetState["restore"],
    { readonly kind: "baseline" }
  >;
  readonly model: OverlayFieldClassification;
  readonly thinking: OverlayFieldClassification;
  readonly tools: "not-owned" | OverlayFieldClassification;
}

/** Pi values an assessment compares against the overlay snapshots. */
export interface CurrentOverlayState {
  readonly model: { provider: string; id: string } | null;
  readonly thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>;
  readonly tools: readonly string[];
}

/**
 * Result of assessing the overlay.
 *
 * A preset restored from a session carries no baseline, so its assessment is
 * `unknown` and callers cannot restore any field.
 */
export type OverlayAssessment =
  | BaselineOverlayAssessment
  | { readonly kind: "unknown" };

/** Classify each current Pi value under an active preset overlay. */
export function assessOverlay(
  active: ActivePresetState,
  current: CurrentOverlayState,
): OverlayAssessment {
  if (active.restore.kind === "unknown") return { kind: "unknown" };

  const { baseline, lastApplied, owned } = active.restore;

  return {
    kind: "baseline",
    restore: active.restore,
    model: classifyOverlayField(
      current.model,
      baseline.model,
      lastApplied.model,
      sameModel,
    ),
    thinking: classifyOverlayField(
      current.thinkingLevel,
      baseline.thinkingLevel,
      lastApplied.thinkingLevel,
      Object.is,
    ),
    tools: owned.tools
      ? classifyOverlayField(
          current.tools,
          baseline.tools,
          lastApplied.tools ?? [],
          sameSet,
        )
      : "not-owned",
  };
}
