/**
 * Clear-summary rendering for pi-presets-plus.
 *
 * Owns pure formatting of clear-result rows and lead copy. It does NOT own
 * clear decisions, Pi state restoration, notifications, or active sessions.
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

interface Styler {
  bold(text: string): string;
  fg(color: Parameters<Theme["fg"]>[0], text: string): string;
}

const FIELD_LABELS: Record<ClearField, string> = {
  model: MODEL_LABEL,
  thinking: THINKING_LABEL,
  tools: TOOLS_LABEL,
};

const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};

/**
 * Choose the plain-English lead sentence that sits under the title.
 *
 * The sentence describes the overall disposition so the per-row values
 * underneath can stay short. Decision priority (most specific first):
 *
 *   1. Every field is `unknown` (priorUnknown branch) — no baseline saved.
 *   2. Any field failed to restore — surface the problem in the lead.
 *   3. Every field already matched baseline — nothing was actually written.
 *   4. Every field is restore-like (restored / restored-partial /
 *      already-baseline) — the happy path; mention unavailable tools if any.
 *   5. Every field was kept (user-override / not-owned / baseline-null) —
 *      preset turned off but no baseline values were applicable.
 *   6. Otherwise it's a mixed result.
 */
export function chooseClearLead(parts: readonly ClearPart[]): string {
  if (parts.every((part) => part.action === "unknown")) {
    return "No saved baseline. Current settings were left as-is.";
  }

  if (parts.some((part) => part.action === "restore-failed")) {
    return "Tried to restore your previous settings but ran into a problem.";
  }

  if (parts.every((part) => part.action === "already-baseline")) {
    return "Your settings already matched the saved baseline.";
  }

  if (parts.every((part) => isRestoreLike(part.action))) {
    return parts.some((part) => part.action === "restored-partial")
      ? "Restored your previous settings. Some tools are no longer available."
      : "Restored your previous settings.";
  }

  if (parts.every((part) => isKeptLike(part.action))) {
    return "Kept all your manual changes. Nothing to restore.";
  }

  return "Restored some settings. Kept your manual changes for others.";
}

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
      return `Could not switch back to ${part.value}.`;

    case "restored-partial":
      return part.dropped && part.dropped.length > 0
        ? `${part.value} (Unavailable: ${part.dropped.join(", ")})`
        : part.value;

    case "user-override":
      return `${part.value} (Left as-is — you changed it after activation)`;
  }
}

export function formatTools(tools: readonly string[]): string {
  return tools.length > 0 ? tools.join(", ") : "none";
}

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
