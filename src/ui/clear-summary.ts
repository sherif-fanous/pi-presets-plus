/**
 * Renders the summary shown after a preset is cleared: a title, a lead
 * sentence, and one row per managed field.
 */
import type {
  ClearAction,
  ClearField,
  ClearPart,
} from "../activation/clear.js";
import {
  CLEAR_DIALOG_TITLE,
  MODEL_LABEL,
  THINKING_LABEL,
  TOOLS_LABEL,
} from "./labels.js";
import type { Theme } from "@earendil-works/pi-coding-agent";

/** Minimum theme surface the summary needs to color its title and labels. */
interface Styler {
  bold(text: string): string;
  fg(color: Parameters<Theme["fg"]>[0], text: string): string;
}

/** Row label for each field the clear summary reports on. */
const FIELD_LABELS: Record<ClearField, string> = {
  model: MODEL_LABEL,
  thinking: THINKING_LABEL,
  tools: TOOLS_LABEL,
};

/** Styler used when the caller passes no theme, leaving the text plain. */
const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};

/**
 * Choose the plain-English lead sentence that sits under the title.
 *
 * The sentence describes the overall disposition so the per-row values
 * underneath can stay short. The branches run from most specific to least:
 * no saved baseline, a failed restore, everything already matching the
 * baseline, everything restored, everything kept, then a mixed result.
 */
export function chooseClearLead(parts: readonly ClearPart[]): string {
  if (parts.every((part) => part.action === "unknown")) {
    return "No saved baseline. Pi left your current settings unchanged.";
  }

  if (parts.some((part) => part.action === "restore-failed")) {
    return "Pi could not restore all of your previous settings.";
  }

  if (parts.every((part) => part.action === "already-baseline")) {
    return "Your settings already matched the saved baseline.";
  }

  if (parts.every((part) => isRestoreLike(part.action))) {
    return parts.some((part) => part.action === "restored-partial")
      ? "Pi restored your previous settings. Some tools are no longer available."
      : "Pi restored your previous settings.";
  }

  if (parts.every((part) => isKeptLike(part.action))) {
    return "Pi kept all your manual changes. There was nothing else to restore.";
  }

  return "Pi restored some settings and kept your manual changes for the rest.";
}

/** Format a model reference as `provider/id`, or `none` when unset. */
export function formatModel(
  model: { provider: string; id: string } | null,
): string {
  return model ? `${model.provider}/${model.id}` : "none";
}

/** Render the post-colon body for a single field row. */
export function formatRowValue(part: ClearPart): string {
  switch (part.action) {
    case "already-baseline":
    case "restored":
      return part.value;

    case "baseline-null":
    case "unknown":
      return `${part.value} (No baseline saved for this field)`;

    case "not-owned":
      return `${part.value} (Not managed by cleared preset)`;

    case "restore-failed":
      return `Pi could not switch back to ${part.value}.`;

    case "restored-partial":
      return part.dropped && part.dropped.length > 0
        ? `${part.value} (Unavailable: ${part.dropped.join(", ")})`
        : part.value;

    case "user-override":
      return `${part.value} (Left as-is because you changed it after activation)`;
  }
}

/** Format a tool list as a comma-separated string, or `none` when empty. */
export function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

/** Render the full clear summary: title, lead sentence, and field rows. */
export function renderClearSummary(
  name: string,
  parts: readonly ClearPart[],
  styler?: Pick<Theme, "bold" | "fg">,
): string {
  const safeStyler = styler ?? IDENTITY_STYLER;
  const labels = parts.map((part) => `${FIELD_LABELS[part.field]}:`);
  const labelWidth = Math.max(...labels.map((label) => label.length));
  const title = safeStyler.bold(
    safeStyler.fg("accent", `${CLEAR_DIALOG_TITLE}: ${name}`),
  );
  const lead = chooseClearLead(parts);
  const rows = parts.map((part) => {
    const label = `${FIELD_LABELS[part.field]}:`;
    const padding = " ".repeat(labelWidth - label.length);

    return `  ${safeStyler.fg("muted", label)}${padding} ${formatRowValue(part)}`;
  });

  return [title, lead, ...rows].join("\n");
}

function isKeptLike(action: ClearAction): boolean {
  return (
    action === "user-override" ||
    action === "not-owned" ||
    action === "baseline-null"
  );
}

function isRestoreLike(action: ClearAction): boolean {
  return (
    action === "restored" ||
    action === "restored-partial" ||
    action === "already-baseline"
  );
}
