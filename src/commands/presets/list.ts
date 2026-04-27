/**
 * `/presets list` — print every loaded preset as a multi-line text block.
 *
 * Grouping and order (UI decision; not fixed by the spec, which only
 * requires the `shadowed` indicator to be surfaced):
 *
 *   1. Project presets (scope: project) — the ones active for this cwd.
 *   2. User presets (scope: user) that are NOT shadowed — global presets
 *      the user can still activate.
 *   3. User presets that ARE shadowed — kept visible for transparency
 *      but de-emphasized because a same-named project preset wins at
 *      activation time.
 *
 * Within each group, file order is preserved (the order `loadAll` +
 * `mergeScopes` produce). That matches the picker's eventual scroll
 * order so users see the same arrangement here and there.
 *
 * When no presets are loaded the helper points users at the two file
 * paths they can create by hand.
 */
import { loadAll } from "../../store/api.js";
import {
  getGlobalPresetsPath,
  getProjectPresetsPath,
} from "../../store/paths.js";
import type { LoadedPreset, PresetScope } from "../../types.js";
import { surfaceWarnings } from "./notify.js";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";

/**
 * Subset of `Theme` consumed by the formatters. Keeping the surface tiny
 * (`fg` + `bold`) lets tests pass an identity styler so substring
 * assertions on plain text continue to work without modification.
 */
type Styler = Pick<Theme, "fg" | "bold">;

/** Header labels for each group; kept in one place for consistency. */
const GROUP_HEADERS = {
  project: "Project presets",
  user: "User presets",
  shadowed: "Shadowed user presets (overridden by project presets above)",
} as const;
/** No-op styler that returns input unchanged; default for tests. */
const IDENTITY_STYLER: Styler = {
  fg: (_color, text) => text,
  bold: (text) => text,
};
/**
 * Field labels shown inline on a single `label: value` line.
 *
 * Order is fixed for consistency. Values are aligned to the widest label
 * in this list so every value starts in the same column; the column is
 * computed from these unstyled strings at module load, not from their
 * styled (ANSI-wrapped) length.
 *
 * `instructions:` is intentionally NOT in this list because its body
 * renders on subsequent indented lines rather than inline — including
 * it here would add a sparse 4-char gap to every short-label line.
 */
const INLINE_LABELS = [
  "scope:",
  "model:",
  "thinking:",
  "tools:",
  "hotkey:",
  "status:",
] as const;
/** Widest inline label (e.g. `"thinking:"` → 9). Computed once. */
const INLINE_LABEL_WIDTH = Math.max(
  ...INLINE_LABELS.map((label) => label.length),
);

/**
 * Build the "no presets configured" notification body.
 *
 * Exported for test assertions on the exact message.
 */
export function formatEmptyMessage(
  cwd: string,
  styler: Styler = IDENTITY_STYLER,
): string {
  return [
    "No presets configured.",
    "Create one of:",
    `  ${styler.fg("accent", getGlobalPresetsPath())}`,
    `  ${styler.fg("accent", getProjectPresetsPath(cwd))}`,
    `Each file should contain { "version": 1, "presets": [...] }.`,
  ].join("\n");
}

/**
 * Build the full text output for a non-empty preset list.
 *
 * Exported so tests can assert exact grouping/ordering without having to
 * stub out `ctx.ui.notify`.
 */
export function formatPresetList(
  loadedPresets: readonly LoadedPreset[],
  styler: Styler = IDENTITY_STYLER,
): string {
  const project: LoadedPreset[] = [];
  const userActive: LoadedPreset[] = [];
  const userShadowed: LoadedPreset[] = [];

  for (const loadedPreset of loadedPresets) {
    if (loadedPreset.scope === "project") project.push(loadedPreset);
    else if (loadedPreset.shadowed) userShadowed.push(loadedPreset);
    else userActive.push(loadedPreset);
  }

  const presetGroups: string[] = [];

  if (project.length > 0) {
    presetGroups.push(
      renderPresetGroup(GROUP_HEADERS.project, project, styler),
    );
  }

  if (userActive.length > 0) {
    presetGroups.push(
      renderPresetGroup(GROUP_HEADERS.user, userActive, styler),
    );
  }

  if (userShadowed.length > 0) {
    presetGroups.push(
      renderPresetGroup(GROUP_HEADERS.shadowed, userShadowed, styler),
    );
  }

  return presetGroups.join("\n\n");
}

/**
 * Run the `list` subcommand against a live `ExtensionContext`.
 */
export async function runList(ctx: ExtensionContext): Promise<void> {
  const { presets, warnings } = await loadAll(ctx);

  if (presets.length === 0) {
    ctx.ui.notify(formatEmptyMessage(ctx.cwd, ctx.ui.theme), "info");
    surfaceWarnings(ctx, warnings);

    return;
  }

  ctx.ui.notify(formatPresetList(presets, ctx.ui.theme), "info");
  surfaceWarnings(ctx, warnings);
}

/**
 * Render a single inline `label: value` row with the value aligned to
 * `INLINE_LABEL_WIDTH`. Padding is computed on the raw label text, then
 * styling is applied — this matters because `styler.fg(...)` wraps the
 * label in ANSI escape sequences that have non-zero JS string length
 * but zero visual width.
 */
function formatInlineRow(
  label: (typeof INLINE_LABELS)[number],
  value: string,
  styler: Styler,
): string {
  const padding = " ".repeat(INLINE_LABEL_WIDTH - label.length);

  return `  ${styler.fg("muted", label)}${padding} ${value}`;
}

/**
 * Format a single `LoadedPreset` as a multi-line text block.
 *
 * Layout:
 * ```
 *   <name>
 *     scope:    <scope>
 *     model:    <provider/model>
 *     thinking: <level>
 *     tools:    <n> (<list>) | inherit
 *     hotkey:   <hotkey>                    (omitted when unset)
 *     status:   missing API key for ...     (omitted when available)
 *     status:   shadowed by project preset  (omitted when not shadowed)
 *     instructions:                         (omitted when unset)
 *       <body, preserved line breaks, indented 4 spaces>
 * ```
 */
function formatPresetBlock(loadedPreset: LoadedPreset, styler: Styler): string {
  const lines: string[] = [];

  lines.push(`${styler.bold(styler.fg("accent", loadedPreset.name))}`);
  lines.push(
    formatInlineRow("scope:", formatScope(loadedPreset.scope), styler),
  );

  lines.push(
    formatInlineRow(
      "model:",
      `${loadedPreset.provider}/${loadedPreset.model}`,
      styler,
    ),
  );

  lines.push(
    formatInlineRow("thinking:", loadedPreset.thinkingLevel ?? "off", styler),
  );

  const toolsLabel =
    loadedPreset.tools && loadedPreset.tools.length > 0
      ? `${loadedPreset.tools.length} (${loadedPreset.tools.join(", ")})`
      : "inherit";

  lines.push(formatInlineRow("tools:", toolsLabel, styler));

  if (loadedPreset.hotkey) {
    lines.push(formatInlineRow("hotkey:", loadedPreset.hotkey, styler));
  }

  if (loadedPreset.unavailable) {
    const reasonColor =
      loadedPreset.unavailable === "no-model" ? "error" : "warning";
    const value = styler.fg(
      reasonColor,
      formatUnavailableReason(loadedPreset.unavailable, loadedPreset),
    );

    lines.push(formatInlineRow("status:", value, styler));
  }

  if (loadedPreset.shadowed) {
    const value = styler.fg(
      "dim",
      "shadowed by project preset of the same name",
    );

    lines.push(formatInlineRow("status:", value, styler));
  }

  if (loadedPreset.instructions) {
    lines.push(`  ${styler.fg("muted", "instructions:")}`);

    for (const bodyLine of loadedPreset.instructions.split("\n")) {
      lines.push(`    ${bodyLine}`);
    }
  }

  return lines.join("\n");
}

function formatScope(presetScope: PresetScope): string {
  // Kept as a function so a future change can localize or badge the label
  // without touching callers.
  return presetScope;
}

/**
 * User-facing phrasing for each `LoadedPreset.unavailable` reason.
 *
 * The raw enum values (`"no-key"`, `"no-model"`) stay on the data
 * model — they are greppable and programmatic consumers (the picker
 * in a later change) branch on them. The formatter only swaps in the
 * human explanation here. Interpolating `provider` / `model` is the
 * point: telling the user _which_ key is missing is the whole value
 * over the raw enum.
 */
function formatUnavailableReason(
  reason: NonNullable<LoadedPreset["unavailable"]>,
  loadedPreset: LoadedPreset,
): string {
  switch (reason) {
    case "no-key":
      return `missing API key for provider "${loadedPreset.provider}"`;
    case "no-model":
      return `model "${loadedPreset.provider}/${loadedPreset.model}" not found in registry`;
  }
}

/** Render a header + blank line + preset blocks for one group. */
function renderPresetGroup(
  header: string,
  loadedPresets: readonly LoadedPreset[],
  styler: Styler,
): string {
  const styledHeader = styler.bold(styler.fg("accent", header));
  const blocks = loadedPresets
    .map((loadedPreset) => formatPresetBlock(loadedPreset, styler))
    .join("\n\n");

  return `${styledHeader}\n${blocks}`;
}
