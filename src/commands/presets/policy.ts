/**
 * Read-only `/presets policy` report.
 *
 * Owns effective policy formatting and notification delivery; it does NOT
 * mutate policy or preset files.
 */
import { loadAll } from "../../store/api.js";
import {
  isPermitted,
  loadPolicy,
  resolveMatchingRules,
  resolvePolicyDefault,
  type CompiledPolicyRule,
} from "../../store/policy.js";
import type { LoadedPreset } from "../../types.js";
import { deliverCommandReport } from "../../ui/command-report.js";
import {
  ALLOWED_PRESETS_LABEL,
  DEFAULT_PRESET_LABEL,
  DIRECTORY_LABEL,
  POLICY_DIALOG_TITLE,
  PROHIBITED_PRESETS_LABEL,
} from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

interface Styler {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};
const POLICY_LABELS = [
  `${DIRECTORY_LABEL}:`,
  `${ALLOWED_PRESETS_LABEL}:`,
  `${PROHIBITED_PRESETS_LABEL}*:`,
  `${DEFAULT_PRESET_LABEL}:`,
] as const;
const POLICY_LABEL_WIDTH = Math.max(
  ...POLICY_LABELS.map((label) => label.length),
);
const OVERRIDE_FOOTNOTE =
  "* You can still activate a prohibited preset by confirming the override.";

/** Format the effective policy for a cwd without performing I/O. */
export function formatPolicy(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
  styler: Pick<Theme, "bold" | "fg"> = IDENTITY_STYLER,
): string {
  const matchedRules = resolveMatchingRules(cwd, rules);

  if (matchedRules.length === 0) {
    return `No preset policy applies to ${cwd}.`;
  }

  const usablePresets = presets.filter(
    (preset) => !preset.shadowed && !preset.unavailable,
  );
  const allowed: string[] = [];
  const prohibited: string[] = [];

  for (const preset of usablePresets) {
    (isPermitted(preset, matchedRules) ? allowed : prohibited).push(
      preset.name,
    );
  }

  const resolvedDefault = resolvePolicyDefault(cwd, presets, rules);
  const prohibitedLabel = `${PROHIBITED_PRESETS_LABEL}${prohibited.length > 0 ? "*" : ""}:`;
  const lines = [
    styler.bold(styler.fg("accent", POLICY_DIALOG_TITLE)),
    row(`${DIRECTORY_LABEL}:`, cwd, styler),
    row(`${ALLOWED_PRESETS_LABEL}:`, formatNames(allowed), styler),
    row(prohibitedLabel, formatNames(prohibited), styler),
    row(
      `${DEFAULT_PRESET_LABEL}:`,
      resolvedDefault.kind === "resolved"
        ? resolvedDefault.preset.name
        : "none",
      styler,
    ),
  ];

  if (prohibited.length > 0) lines.push("", OVERRIDE_FOOTNOTE);

  return lines.join("\n");
}

/** Load and display the current effective policy through one notification. */
export async function runPolicy(
  ctx: ExtensionCommandContext,
  pi?: Pick<ExtensionAPI, "appendEntry">,
): Promise<void> {
  const [policy, loaded] = await Promise.all([loadPolicy(), loadAll(ctx)]);
  const warnings = [...policy.warnings, ...loaded.warnings];
  const body = withWarnings(
    formatPolicy(ctx.cwd, loaded.presets, policy.rules),
    warnings,
  );

  if (pi) {
    deliverCommandReport(ctx, pi, {
      body,
      severity: warnings.length > 0 ? "warning" : "info",
    });
  } else {
    ctx.ui.notify(body, warnings.length > 0 ? "warning" : "info");
  }
}

function formatNames(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "none";
}

function row(label: string, value: string, styler: Pick<Theme, "fg">): string {
  const padding = " ".repeat(POLICY_LABEL_WIDTH - label.length);

  return `  ${styler.fg("muted", label)}${padding} ${value}`;
}

function withWarnings(body: string, warnings: readonly string[]): string {
  if (warnings.length === 0) return body;

  return `${body}\n\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`;
}
