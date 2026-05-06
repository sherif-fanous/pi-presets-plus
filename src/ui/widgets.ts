/**
 * Reusable preset-picker widget primitives.
 *
 * Owns readable key/value preset card rendering; it does NOT own picker
 * state, keyboard handling, or activation.
 */
import type { LoadedPreset } from "../types.js";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, type Component } from "@mariozechner/pi-tui";

export interface PresetCardOptions {
  active: boolean;
  dirty?: boolean;
  driftReasons?: readonly string[];
  inheritedTools?: readonly string[];
  selected: boolean;
  showShadowed?: boolean;
}

/**
 * Minimum theme surface needed by the preset card and its formatters.
 *
 * Restricting to `fg` + `bold` (matching the `Styler` pattern in
 * `activation/clear.ts`) lets tests pass an honest stub without an
 * `as unknown as Theme` cast and makes future Theme additions
 * visible at the call sites that actually need them.
 */
type CardTheme = Pick<Theme, "fg" | "bold">;

type ThinkingColor = Parameters<Theme["fg"]>[0];

const FIELD_LABEL_WIDTH = "Shadowing:".length;
const PROMPT_PREVIEW_WIDTH = 60;

class PresetCardComponent implements Component {
  constructor(
    private readonly loadedPreset: LoadedPreset,
    private readonly theme: CardTheme,
    private readonly options: PresetCardOptions,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const titlePrefix = this.options.selected
      ? this.theme.fg("accent", "▌ ")
      : "  ";
    const dot = this.theme.fg(
      this.options.active ? "success" : "dim",
      formatStatusDot(this.options.active),
    );
    const displayName = this.options.active
      ? this.theme.fg("accent", this.theme.bold(this.loadedPreset.name))
      : this.theme.fg("text", this.loadedPreset.name);
    const lines = [`${titlePrefix}${dot} ${displayName}`];

    lines.push(
      this.renderField(
        "Scope:",
        this.theme.fg("muted", formatScopeValue(this.loadedPreset)),
      ),
    );

    lines.push(
      this.renderField(
        "Model:",
        this.theme.fg(
          "muted",
          `${this.loadedPreset.provider} / ${this.loadedPreset.model}`,
        ),
      ),
    );

    lines.push(
      this.renderField(
        "Thinking:",
        this.theme.fg(
          thinkingColor(this.loadedPreset.thinkingLevel ?? "off"),
          formatThinkingLevel(this.loadedPreset.thinkingLevel ?? "off"),
        ),
      ),
    );

    lines.push(
      this.renderField(
        "Tools:",
        formatToolsSummary(
          this.loadedPreset.tools,
          this.options.inheritedTools ?? [],
        ),
      ),
    );

    const promptPreview = formatInstructionsPreview(
      this.loadedPreset.instructions,
    );

    if (promptPreview.length > 0) {
      lines.push(this.renderField("Prompt:", promptPreview));
    }

    if (this.loadedPreset.clampWarning === true) {
      lines.push(
        this.renderField(
          "Status:",
          this.theme.fg("warning", "⚠ thinking will be clamped"),
        ),
      );
    }

    if (this.loadedPreset.hotkeyConflict === true) {
      lines.push(
        this.renderField(
          "Status:",
          this.theme.fg("warning", "⚠ hotkey conflict"),
        ),
      );
    }

    const availabilityStatus = formatAvailabilityStatus(this.loadedPreset);

    if (availabilityStatus.length > 0) {
      lines.push(
        this.renderField(
          "Status:",
          this.theme.fg("warning", availabilityStatus),
        ),
      );
    }

    if (
      this.options.active &&
      this.options.dirty &&
      this.options.driftReasons &&
      this.options.driftReasons.length > 0
    ) {
      lines.push(
        this.renderField(
          "Drift:",
          this.theme.fg(
            "warning",
            `⚠ Dirty — ${this.options.driftReasons.join(", ")} differ`,
          ),
        ),
      );
    }

    if (this.loadedPreset.shadowed && this.options.showShadowed !== false) {
      lines.push(
        this.renderField(
          "Shadowing:",
          this.theme.fg("dim", "Overridden by project preset"),
        ),
      );
    }

    return lines.map((line) => truncateToWidth(line, width, "…"));
  }

  private renderField(label: string, value: string): string {
    const padding = " ".repeat(Math.max(0, FIELD_LABEL_WIDTH - label.length));

    return `  ${this.theme.fg("muted", label)}${padding} ${value}`;
  }
}

export function formatAvailabilityStatus(loadedPreset: LoadedPreset): string {
  switch (loadedPreset.unavailable) {
    case "no-key":
      return "Unavailable — missing API key";
    case "no-model":
      return "Unavailable — model not found";
    case undefined:
      return "";
    default:
      return "";
  }
}

export function formatInstructionsPreview(
  instructions: string | undefined,
): string {
  if (!instructions) return "";

  const singleLine = instructions.replaceAll(/\s+/g, " ").trim();

  if (singleLine.length <= PROMPT_PREVIEW_WIDTH) return singleLine;

  return `${singleLine.slice(0, PROMPT_PREVIEW_WIDTH - 1).trimEnd()}…`;
}

export function formatScopeValue(loadedPreset: LoadedPreset): string {
  return loadedPreset.scope === "project" ? "Project" : "User";
}

export function formatStatusDot(active: boolean): string {
  return active ? "●" : " ";
}

export function formatThinkingLevel(
  level: NonNullable<LoadedPreset["thinkingLevel"]>,
): string {
  switch (level) {
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "X-High";
    case "off":
      return "Off";
  }
}

export function formatToolsSummary(
  tools: readonly string[] | undefined,
  inheritedTools: readonly string[] = [],
): string {
  if (tools && tools.length > 0) return `preset: ${tools.join(", ")}`;
  if (inheritedTools.length === 0) return "session";

  return `session: ${inheritedTools.join(", ")}`;
}

/**
 * Multi-line component for a single loaded preset.
 *
 * The card is intentionally stateless: callers pass active/selected flags on
 * construction and rebuild cards when state changes. This keeps rendering
 * deterministic and easy for future editor dialogs to share.
 */
export function presetCard(
  loadedPreset: LoadedPreset,
  theme: CardTheme,
  options: PresetCardOptions,
): Component {
  return new PresetCardComponent(loadedPreset, theme, options);
}

function thinkingColor(
  level: NonNullable<LoadedPreset["thinkingLevel"]>,
): ThinkingColor {
  switch (level) {
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    case "off":
      return "thinkingOff";
  }
}
