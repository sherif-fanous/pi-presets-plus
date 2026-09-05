/**
 * User-requested preset activation orchestration.
 *
 * Owns policy authorization followed by preset application; it does NOT own
 * preset lookup, result presentation, or policy-default activation.
 */
import type { LoadedPreset } from "../types.js";
import { apply, type ApplyResult } from "./apply.js";
import { gateActivation } from "./policy-gate.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export type ActivationResult =
  | ApplyResult
  | {
      readonly kind: "cancelled";
      readonly ok: false;
      readonly reason: string;
    };

/** Check policy, then apply a preset when activation is permitted. */
export async function requestActivation(
  preset: LoadedPreset,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<ActivationResult> {
  if (!(await gateActivation(preset, ctx))) {
    return {
      kind: "cancelled",
      ok: false,
      reason: "Activation cancelled.",
    };
  }

  return apply(preset, ctx, pi, session);
}
