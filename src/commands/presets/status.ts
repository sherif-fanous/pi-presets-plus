/**
 * Reports `/presets status`: which preset is active, the baseline it
 * overlays, and how the session's current model, thinking level, and
 * tools compare against both.
 */
import type { OverlayFieldClassification } from "../../activation/classify-overlay-field.js";
import { assessOverlay } from "../../activation/overlay-assessment.js";
import type { ActivePresetSession } from "../../activation/session.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { LoadedPreset } from "../../types.js";
import { deliverCommandReport } from "../../ui/command-report.js";
import {
  BASELINE_MODEL_LABEL,
  BASELINE_THINKING_LABEL,
  BASELINE_TOOLS_LABEL,
  CURRENT_MODEL_LABEL,
  CURRENT_THINKING_LABEL,
  CURRENT_TOOLS_LABEL,
  PRESET_LABEL,
  PRESET_MODEL_LABEL,
  PRESET_THINKING_LABEL,
  PRESET_TOOLS_LABEL,
  RESTORE_LABEL,
  SCOPE_LABEL,
  STATUS_DIALOG_TITLE,
} from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

/** Report text, its severity, and the warnings the preset load produced. */
export interface StatusBodyResult {
  readonly body: string;
  readonly severity: "info" | "warning";
  readonly warnings: readonly string[];
}

/** The theme surface {@link formatStatus} needs to style its rows. */
interface Styler {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

/** Styler that returns text unchanged, for plain output and for tests. */
const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};
/** Every label the report can render, in display order. */
const STATUS_LABELS = [
  `${PRESET_LABEL}:`,
  `${SCOPE_LABEL}:`,
  `${RESTORE_LABEL}:`,
  `${BASELINE_MODEL_LABEL}:`,
  `${BASELINE_THINKING_LABEL}:`,
  `${BASELINE_TOOLS_LABEL}:`,
  `${PRESET_MODEL_LABEL}:`,
  `${PRESET_THINKING_LABEL}:`,
  `${PRESET_TOOLS_LABEL}:`,
  `${CURRENT_MODEL_LABEL}:`,
  `${CURRENT_THINKING_LABEL}:`,
  `${CURRENT_TOOLS_LABEL}:`,
] as const;
/** Width of the label column, so the values line up. */
const STATUS_LABEL_WIDTH = Math.max(
  ...STATUS_LABELS.map((label) => label.length),
);

/**
 * Render the status report for the active preset.
 *
 * A session whose baseline was never captured gets the shorter report
 * that omits the baseline and preset rows.
 */
export function formatStatus(
  active: ReturnType<ActivePresetSession["current"]>,
  _preset: LoadedPreset,
  ctx: Pick<ExtensionCommandContext, "model">,
  pi: Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">,
  styler: Pick<Theme, "bold" | "fg"> = IDENTITY_STYLER,
): string {
  if (!active) return "No preset is active.";

  const currentModel = ctx.model
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const currentThinking = pi.getThinkingLevel();
  const currentTools = pi.getActiveTools();
  const assessment = assessOverlay(active, {
    model: currentModel,
    thinkingLevel: currentThinking,
    tools: currentTools,
  });

  if (assessment.kind === "unknown") {
    return [
      styler.bold(styler.fg("accent", STATUS_DIALOG_TITLE)),
      row(`${PRESET_LABEL}:`, active.name, styler),
      row(`${SCOPE_LABEL}:`, active.scope, styler),
      row(
        `${RESTORE_LABEL}:`,
        "No saved baseline. Clear will only turn the preset off.",
        styler,
      ),
      row(`${CURRENT_MODEL_LABEL}:`, formatModel(currentModel), styler),
      row(`${CURRENT_THINKING_LABEL}:`, currentThinking, styler),
      row(`${CURRENT_TOOLS_LABEL}:`, formatTools(currentTools), styler),
    ].join("\n");
  }

  const { baseline, lastApplied } = assessment.restore;
  const modelClass = statusLabel(assessment.model);
  const thinkingClass = statusLabel(assessment.thinking);
  const toolsClass =
    assessment.tools === "not-owned"
      ? "Not managed by active preset"
      : statusLabel(assessment.tools);

  return [
    styler.bold(styler.fg("accent", STATUS_DIALOG_TITLE)),
    row(`${PRESET_LABEL}:`, active.name, styler),
    row(`${SCOPE_LABEL}:`, active.scope, styler),
    row(`${BASELINE_MODEL_LABEL}:`, formatModel(baseline.model), styler),
    row(`${BASELINE_THINKING_LABEL}:`, baseline.thinkingLevel, styler),
    row(`${BASELINE_TOOLS_LABEL}:`, formatTools(baseline.tools), styler),
    row(`${PRESET_MODEL_LABEL}:`, formatModel(lastApplied.model), styler),
    row(`${PRESET_THINKING_LABEL}:`, lastApplied.thinkingLevel, styler),
    row(
      `${PRESET_TOOLS_LABEL}:`,
      lastApplied.tools ? formatTools(lastApplied.tools) : "none",
      styler,
    ),
    row(
      `${CURRENT_MODEL_LABEL}:`,
      `${formatModel(currentModel)} (${modelClass})`,
      styler,
    ),
    row(
      `${CURRENT_THINKING_LABEL}:`,
      `${currentThinking} (${thinkingClass})`,
      styler,
    ),
    row(
      `${CURRENT_TOOLS_LABEL}:`,
      `${formatTools(currentTools)} (${toolsClass})`,
      styler,
    ),
  ].join("\n");
}

/** Load the presets and build the status report, severity, and warnings. */
export async function formatStatusBody(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<StatusBodyResult> {
  const active = session.current();

  if (!active) {
    return { body: "No preset is active.", severity: "info", warnings: [] };
  }

  const { presets, warnings } = await loadAll(ctx);
  const preset = findPreset(presets, active);

  if (!preset) {
    return {
      body: `Active preset "${active.name}" is no longer loaded.`,
      severity: "warning",
      warnings,
    };
  }

  return {
    body: formatStatus(active, preset, ctx, pi),
    severity: "info",
    warnings,
  };
}

/** Run `/presets status` and deliver the report to the user. */
export async function runStatus(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const result = await formatStatusBody(ctx, pi, session);

  const body = withWarnings(result.body, result.warnings);

  deliverCommandReport(ctx, pi, {
    body,
    severity: result.severity,
  });
}

/**
 * Wording each {@link OverlayFieldClassification} gets in a status row.
 *
 * `renderClearSummary` annotates its rows with the same vocabulary, so a
 * phrase that changes here has to change there too.
 */
const STATUS_VOCABULARY: Record<OverlayFieldClassification, string> = {
  "already-baseline": "Already at baseline",
  "matches-last-applied": "Managed by active preset",
  "user-override": "Left as-is because you changed it after activation",
};

function formatModel(model: { provider: string; id: string } | null): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

/** Render one label and value pair padded to the label column. */
function row(
  label: (typeof STATUS_LABELS)[number],
  value: string,
  styler: Pick<Theme, "fg">,
): string {
  const padding = " ".repeat(STATUS_LABEL_WIDTH - label.length);

  return `  ${styler.fg("muted", label)}${padding} ${value}`;
}

function statusLabel(classification: OverlayFieldClassification): string {
  return STATUS_VOCABULARY[classification];
}

function withWarnings(body: string, warnings: readonly string[]): string {
  if (warnings.length === 0) return body;

  return `${body}\n\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`;
}
