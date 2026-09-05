/**
 * Active-preset overlay assessment.
 *
 * Owns classification of current Pi values against the baseline and the last
 * values applied by a preset. It does NOT read Pi state, render output,
 * restore values, or mutate session state.
 */
import type { ActivePresetState } from "../types.js";
import {
  classifyOverlayField,
  type OverlayFieldClassification,
} from "./classify-overlay-field.js";
import { sameModel } from "./same-model.js";
import { sameSet } from "./same-set.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

export interface CurrentOverlayState {
  readonly model: { provider: string; id: string } | null;
  readonly thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>;
  readonly tools: readonly string[];
}

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
