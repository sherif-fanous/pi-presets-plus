/**
 * Fresh-session policy-default activation.
 *
 * Owns precedence guards, default resolution, apply refusal handling, and the
 * default-applied notification; it does NOT restore sessions or parse flags.
 */
import { loadPolicy, resolvePolicyDefault } from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import { apply } from "./apply.js";
import type { ActivePresetSession } from "./session.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export interface PolicyDefaultPrecedence {
  readonly flagApplied: boolean;
  readonly restored: boolean;
}

/** Apply a permitted policy default only when flag and restore did not win. */
export async function maybeApplyPolicyDefault(
  presets: readonly LoadedPreset[],
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  precedence: PolicyDefaultPrecedence,
): Promise<boolean> {
  if (precedence.flagApplied || precedence.restored) return false;

  const { rules, warnings } = await loadPolicy();

  if (warnings.length > 0) ctx.ui.notify(warnings.join("\n"), "warning");

  const resolved = resolvePolicyDefault(ctx.cwd, presets, rules);

  if (resolved.kind === "none") return false;

  if (resolved.kind === "unresolvable") {
    ctx.ui.notify(
      `The default from rule ${resolved.winner.rule.index + 1} (${JSON.stringify(resolved.winner.rule.match)}) does not match any permitted preset that is available. Pi kept the baseline.`,
      "warning",
    );

    return false;
  }

  const result = await apply(resolved.preset, ctx, pi, session);

  if (!result.ok) {
    ctx.ui.notify(result.reason, "warning");

    return false;
  }

  return true;
}
