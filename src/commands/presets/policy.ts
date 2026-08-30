/**
 * Read-only `/presets policy` diagnostic.
 *
 * Owns policy report formatting and notification delivery; it does NOT mutate
 * policy or preset files.
 */
import { loadAll } from "../../store/api.js";
import {
  loadPolicy,
  resolveMatchingRules,
  resolvePolicyDefault,
  type CompiledPolicyMatcher,
  type CompiledPolicyRule,
} from "../../store/policy.js";
import type { LoadedPreset } from "../../types.js";
import { surfaceWarnings } from "./notify.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Format the effective policy for a cwd without performing I/O. */
export function formatPolicy(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
): string {
  const matchedRules = resolveMatchingRules(cwd, rules);

  if (matchedRules.length === 0) {
    return `No policy rules apply to ${cwd}.`;
  }

  const allow = matchedRules.flatMap(({ rule }) => rule.allow);
  const prohibit = matchedRules.flatMap(({ rule }) => rule.prohibit);
  const resolved = resolvePolicyDefault(cwd, presets, rules);
  const lines = [
    `Policy for ${cwd}`,
    "Matching Rules:",
    ...matchedRules.map(
      ({ matchLength, rule }) =>
        `  ${rule.index + 1}. ${JSON.stringify(rule.match)} (${matchLength} characters matched)`,
    ),
    `Effective Allow: ${formatMatchers(allow)}`,
    `Effective Prohibit: ${formatMatchers(prohibit)}`,
  ];

  if (resolved.kind === "none") {
    lines.push("Resolved Default: none configured");
  } else if (resolved.kind === "unresolvable") {
    lines.push(
      `Resolved Default: no available preset permitted here (rule ${resolved.winner.rule.index + 1}, ${resolved.reason})`,
    );
  } else {
    lines.push(
      `Resolved Default: ${resolved.preset.name} (rule ${resolved.winner.rule.index + 1}, ${resolved.reason})`,
    );
  }

  return lines.join("\n");
}

/** Load and display the current effective policy through one notification. */
export async function runPolicy(ctx: ExtensionCommandContext): Promise<void> {
  const [policy, loaded] = await Promise.all([loadPolicy(), loadAll(ctx)]);

  surfaceWarnings(ctx, [...policy.warnings, ...loaded.warnings]);
  ctx.ui.notify(formatPolicy(ctx.cwd, loaded.presets, policy.rules), "info");
}

function formatMatchers(matchers: readonly CompiledPolicyMatcher[]): string {
  if (matchers.length === 0) return "none";

  return matchers
    .map((matcher) => `${matcher.field}:${JSON.stringify(matcher.pattern)}`)
    .join(", ");
}
