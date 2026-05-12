/**
 * `/presets status` textual diagnostic.
 *
 * Owns formatting the active preset and its baseline-overlay state into a
 * user-facing report; it does NOT update the footer indicator or mutate
 * the active attachment.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { LoadedPreset } from "../../types.js";
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
import { surfaceWarnings } from "./notify.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

export interface StatusBodyResult {
  readonly body: string;
  readonly severity: "info" | "warning";
  readonly warnings: readonly string[];
}

interface Styler {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};
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
const STATUS_LABEL_WIDTH = Math.max(
  ...STATUS_LABELS.map((label) => label.length),
);

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
  const currentTools = pi.getActiveTools();

  if (active.restore.kind === "unknown") {
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
      row(`${CURRENT_THINKING_LABEL}:`, pi.getThinkingLevel(), styler),
      row(`${CURRENT_TOOLS_LABEL}:`, formatTools(currentTools), styler),
    ].join("\n");
  }

  const { baseline, lastApplied, owned } = active.restore;
  const modelClass = classifyField(
    currentModel,
    baseline.model,
    lastApplied.model,
  );
  const thinkingClass = classifyField(
    pi.getThinkingLevel(),
    baseline.thinkingLevel,
    lastApplied.thinkingLevel,
  );
  const toolsClass = owned.tools
    ? classifyField(currentTools, baseline.tools, lastApplied.tools ?? [])
    : "Not managed by active preset";

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
      `${pi.getThinkingLevel()} (${thinkingClass})`,
      styler,
    ),
    row(
      `${CURRENT_TOOLS_LABEL}:`,
      `${formatTools(currentTools)} (${toolsClass})`,
      styler,
    ),
  ].join("\n");
}

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
    body: formatStatus(active, preset, ctx, pi, ctx.ui.theme),
    severity: "info",
    warnings,
  };
}

export async function runStatus(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<void> {
  const result = await formatStatusBody(ctx, pi, session);

  surfaceWarnings(ctx, result.warnings);
  ctx.ui.notify(result.body, result.severity);
}

/**
 * Compare a current value against the baseline and last-applied snapshots
 * and return a plain-English label.
 *
 * Vocabulary parallels the per-row annotations in `renderClearSummary` so
 * users see the same phrasing across `/presets status` and `/presets clear`.
 * `compare` is `===` for primitives and bag-equality for tool arrays;
 * model objects compare provider+id.
 */
function classifyField(
  current: { provider: string; id: string } | null | readonly string[] | string,
  baseline:
    | { provider: string; id: string }
    | null
    | readonly string[]
    | string,
  lastApplied: { provider: string; id: string } | readonly string[] | string,
):
  | "Already at baseline"
  | "Left as-is — you changed it after activation"
  | "Managed by active preset" {
  if (sameComparable(current, baseline)) return "Already at baseline";
  if (sameComparable(current, lastApplied)) return "Managed by active preset";

  return "Left as-is — you changed it after activation";
}

function formatModel(model: { provider: string; id: string } | null): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

function row(
  label: (typeof STATUS_LABELS)[number],
  value: string,
  styler: Pick<Theme, "fg">,
): string {
  const padding = " ".repeat(STATUS_LABEL_WIDTH - label.length);

  return `  ${styler.fg("muted", label)}${padding} ${value}`;
}

function sameComparable(
  left: { provider: string; id: string } | null | readonly string[] | string,
  right: { provider: string; id: string } | null | readonly string[] | string,
): boolean {
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);

  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray) return false;

    const leftArr = left as readonly string[];
    const rightArr = right as readonly string[];

    if (leftArr.length !== rightArr.length) return false;

    const rightSet = new Set(rightArr);

    return leftArr.every((value) => rightSet.has(value));
  }

  if (typeof left === "string" || typeof right === "string") {
    return (
      typeof left === "string" && typeof right === "string" && left === right
    );
  }

  const leftModel = left as { provider: string; id: string } | null;
  const rightModel = right as { provider: string; id: string } | null;

  return (
    leftModel?.provider === rightModel?.provider &&
    leftModel?.id === rightModel?.id
  );
}
