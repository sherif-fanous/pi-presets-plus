/**
 * Activates the preset that the access policy names as the default for the
 * current directory when nothing else claimed the fresh session.
 */
import { loadPolicy, resolvePolicyDefault } from "../store/policy.js";
import type { LoadedPreset } from "../types.js";
import { notifyApplyResult } from "../ui/apply-result.js";
import { apply } from "./apply.js";
import type { ActivePresetSession } from "./session.js";
import {
  isAutomaticDefaultEligible,
  type StartupSelection,
} from "./startup-selection.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Whether a command flag or a restored session already chose a preset. */
export interface PolicyDefaultPrecedence {
  readonly flagApplied: boolean;
  readonly restored: boolean;
}

/** Apply a permitted policy default only when startup eligibility allows it. */
export async function maybeApplyPolicyDefault(
  presets: readonly LoadedPreset[],
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
  precedence: PolicyDefaultPrecedence,
  startup: StartupSelection,
): Promise<boolean> {
  if (precedence.flagApplied || precedence.restored) return false;

  const { rules, warnings } = await loadPolicy();

  if (warnings.length > 0) ctx.ui.notify(warnings.join("\n"), "warning");

  if (!isAutomaticDefaultEligible(startup, ctx)) return false;

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

  notifyApplyResult(ctx, resolved.preset, result);

  return true;
}
