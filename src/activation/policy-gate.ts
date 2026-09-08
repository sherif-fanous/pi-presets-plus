/**
 * Checks a preset against the access policy before activation and asks the
 * user to confirm an override when the policy forbids it.
 */
import {
  isPermitted,
  loadPolicy,
  resolveMatchingRules,
} from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Return true when activation may proceed, including an explicit override. */
export async function gateActivation(
  preset: LoadedPreset,
  ctx: Pick<ExtensionContext, "cwd" | "ui">,
): Promise<boolean> {
  const { rules, warnings } = await loadPolicy();

  if (warnings.length > 0) {
    ctx.ui.notify(warnings.join("\n"), "warning");
  }

  const matchedRules = resolveMatchingRules(ctx.cwd, rules);

  if (isPermitted(preset, matchedRules)) return true;

  const { openPolicyOverride } = await import("../ui/policy-overlay.js");

  return openPolicyOverride(ctx, preset);
}
