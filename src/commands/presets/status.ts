/**
 * `/presets status` textual diagnostic.
 *
 * Owns formatting the active preset and its baseline-overlay state into a
 * user-facing report; it does NOT update the footer indicator or mutate
 * the active attachment.
 */
import { getActive } from "../../activation/active-state.js";
import { loadAll } from "../../store/api.js";
import type { LoadedPreset } from "../../types.js";
import { surfaceWarnings } from "./notify.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";

interface Styler {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

const IDENTITY_STYLER: Styler = {
  bold: (text) => text,
  fg: (_color, text) => text,
};
const STATUS_LABELS = [
  "preset:",
  "scope:",
  "restore:",
  "baseline model:",
  "baseline thinking level:",
  "baseline tools:",
  "preset model:",
  "preset thinking level:",
  "preset tools:",
  "current model:",
  "current thinking level:",
  "current tools:",
] as const;
const STATUS_LABEL_WIDTH = Math.max(
  ...STATUS_LABELS.map((label) => label.length),
);

export function formatStatus(
  active: ReturnType<typeof getActive>,
  _preset: LoadedPreset,
  ctx: Pick<ExtensionCommandContext, "model">,
  pi: Pick<ExtensionAPI, "getActiveTools" | "getThinkingLevel">,
  styler: Pick<Theme, "bold" | "fg"> = IDENTITY_STYLER,
): string {
  if (!active) return "no preset is active.";

  const currentModel = ctx.model
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const currentTools = pi.getActiveTools();

  if (active.restore.kind === "unknown") {
    return [
      styler.bold(styler.fg("accent", "preset status")),
      row("preset:", active.name, styler),
      row("scope:", active.scope, styler),
      row(
        "restore:",
        "no saved baseline. clear will only turn the preset off",
        styler,
      ),
      row("current model:", formatModel(currentModel), styler),
      row("current thinking level:", pi.getThinkingLevel(), styler),
      row("current tools:", formatTools(currentTools), styler),
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
    : "not managed by active preset";

  return [
    styler.bold(styler.fg("accent", "preset status")),
    row("preset:", active.name, styler),
    row("scope:", active.scope, styler),
    row("baseline model:", formatModel(baseline.model), styler),
    row("baseline thinking level:", baseline.thinkingLevel, styler),
    row("baseline tools:", formatTools(baseline.tools), styler),
    row("preset model:", formatModel(lastApplied.model), styler),
    row("preset thinking level:", lastApplied.thinkingLevel, styler),
    row(
      "preset tools:",
      lastApplied.tools ? formatTools(lastApplied.tools) : "none",
      styler,
    ),
    row(
      "current model:",
      `${formatModel(currentModel)} (${modelClass})`,
      styler,
    ),
    row(
      "current thinking level:",
      `${pi.getThinkingLevel()} (${thinkingClass})`,
      styler,
    ),
    row(
      "current tools:",
      `${formatTools(currentTools)} (${toolsClass})`,
      styler,
    ),
  ].join("\n");
}

export async function runStatus(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const active = getActive();

  if (!active) {
    ctx.ui.notify("no preset is active.", "info");

    return;
  }

  const { presets, warnings } = await loadAll(ctx);

  surfaceWarnings(ctx, warnings);

  const preset = presets.find(
    (candidate) =>
      candidate.name === active.name && candidate.scope === active.scope,
  );

  if (!preset) {
    ctx.ui.notify(
      `active preset "${active.name}" is no longer loaded.`,
      "warning",
    );

    return;
  }

  ctx.ui.notify(formatStatus(active, preset, ctx, pi, ctx.ui.theme), "info");
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
  | "already at baseline"
  | "managed by active preset"
  | "user manually overrode preset value" {
  if (sameComparable(current, baseline)) return "already at baseline";
  if (sameComparable(current, lastApplied)) return "managed by active preset";

  return "user manually overrode preset value";
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
