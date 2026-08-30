/**
 * Access-policy gate for new preset activations.
 *
 * Owns fresh policy loading, warning surfacing, and override confirmation; it
 * does NOT apply presets or participate in session restore.
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
