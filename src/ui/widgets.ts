/**
 * Renders one preset as a multi-line key/value card, along with the value
 * formatters the card and its callers share.
 */
import type { LoadedPreset } from "../types.js";
import {
  MODEL_LABEL,
  SCOPE_LABEL,
  STATUS_LABEL,
  THINKING_LABEL,
  TOOLS_LABEL,
} from "./labels.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

/** Per-render flags that decide how a card highlights and annotates itself. */
export interface PresetCardOptions {
  active: boolean;
  dirty?: boolean;
  driftReasons?: readonly string[];
  inheritedTools?: readonly string[];
  selected: boolean;
  showShadowed?: boolean;
}

/**
 * Minimum theme surface the preset card and its formatters need.
 *
 * Narrowing to `fg` and `bold` lets a test pass an honest stub without an
 * `as unknown as Theme` cast.
 */
type CardTheme = Pick<Theme, "fg" | "bold">;

/** Theme color name accepted for a thinking level. */
type ThinkingColor = Parameters<Theme["fg"]>[0];

/** Column width that keeps every card label aligned to one gutter. */
const FIELD_LABEL_WIDTH = Math.max(
  "Shadowing:".length,
  `${THINKING_LABEL}:`.length,
);
/** Characters of preset instructions shown in the card preview. */
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
      this.renderField(`${SCOPE_LABEL}:`, formatScopeValue(this.loadedPreset)),
    );

    lines.push(
      this.renderField(
        `${MODEL_LABEL}:`,
        `${this.loadedPreset.provider} / ${this.loadedPreset.model}`,
      ),
    );

    lines.push(
      this.renderField(`${THINKING_LABEL}:`, this.thinkingLevelValue()),
    );

    lines.push(
      this.renderField(
        `${TOOLS_LABEL}:`,
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
          `${STATUS_LABEL}:`,
          this.theme.fg("warning", "⚠ Thinking will be clamped."),
        ),
      );
    }

    if (this.loadedPreset.hotkeyConflict === true) {
      lines.push(
        this.renderField(
          `${STATUS_LABEL}:`,
          this.theme.fg("warning", "⚠ Hotkey conflict."),
        ),
      );
    }

    if (this.loadedPreset.hotkeyShadowsBuiltin === true) {
      lines.push(
        this.renderField(
          `${STATUS_LABEL}:`,
          this.theme.fg("warning", "⚠ Hotkey shadows a Pi built-in."),
        ),
      );
    }

    const availabilityStatus = formatAvailabilityStatus(this.loadedPreset);

    if (availabilityStatus.length > 0) {
      lines.push(
        this.renderField(
          `${STATUS_LABEL}:`,
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
            `⚠ Dirty: ${this.options.driftReasons.join(", ")} differ`,
          ),
        ),
      );
    }

    if (this.loadedPreset.shadowed && this.options.showShadowed !== false) {
      lines.push(
        this.renderField(
          "Shadowing:",
          this.theme.fg("dim", "Project preset takes precedence"),
        ),
      );
    }

    return lines.map((line) => truncateToWidth(line, width, "…"));
  }

  private renderField(label: string, value: string): string {
    const padding = " ".repeat(Math.max(0, FIELD_LABEL_WIDTH - label.length));

    return `  ${this.theme.fg("muted", label)}${padding} ${value}`;
  }

  /**
   * Render the thinking level in its theme color.
   *
   * The `thinkingMax` color exists in Pi 0.80.6 and later. Earlier bundles
   * throw `Unknown theme color` from `fg()` and would take the picker
   * render path down, so `"max"` falls back to `thinkingXhigh` there, the
   * same way Pi itself does.
   */
  private thinkingLevelValue(): string {
    const level = this.loadedPreset.thinkingLevel ?? "off";
    const text = formatThinkingLevel(level);

    try {
      return this.theme.fg(thinkingColor(level), text);
    } catch (error) {
      if (
        level === "max" &&
        error instanceof Error &&
        error.message.includes("Unknown theme color")
      ) {
        return this.theme.fg("thinkingXhigh", text);
      }

      throw error;
    }
  }
}

/** Describe why a preset cannot run right now, or return an empty string. */
export function formatAvailabilityStatus(loadedPreset: LoadedPreset): string {
  switch (loadedPreset.unavailable) {
    case "no-key":
      return "⚠ This preset's provider has no API key configured.";
    case "no-model":
      return "⚠ This preset's model is no longer available.";
    case undefined:
      return "";
    default:
      return "";
  }
}

/** Flatten preset instructions to one line, clipped to the preview width. */
export function formatInstructionsPreview(
  instructions: string | undefined,
): string {
  if (!instructions) return "";

  const singleLine = instructions.replaceAll(/\s+/g, " ").trim();

  if (singleLine.length <= PROMPT_PREVIEW_WIDTH) return singleLine;

  return `${singleLine.slice(0, PROMPT_PREVIEW_WIDTH - 1).trimEnd()}…`;
}

/** Render a scope as the `User` or `Project` label users see. */
export function formatScopeName(scope: LoadedPreset["scope"]): string {
  return scope === "project" ? "Project" : "User";
}

/** Render the scope row value for one preset. */
export function formatScopeValue(loadedPreset: LoadedPreset): string {
  return formatScopeName(loadedPreset.scope);
}

/** Return the dot that marks the active preset in the list. */
export function formatStatusDot(active: boolean): string {
  return active ? "●" : " ";
}

/** Render a thinking level as its display label. */
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
    case "max":
      return "Max";
    case "off":
      return "Off";
  }
}

/** Summarize the tools a preset sets, or the session tools it inherits. */
export function formatToolsSummary(
  tools: readonly string[] | undefined,
  inheritedTools: readonly string[] = [],
): string {
  if (tools && tools.length > 0) return `Preset: ${tools.join(", ")}`;
  if (inheritedTools.length === 0) return "Session";

  return `Session: ${inheritedTools.join(", ")}`;
}

/**
 * Build the multi-line card component for one loaded preset.
 *
 * The card is stateless: callers pass the active and selected flags at
 * construction and rebuild the card when that state changes, which keeps
 * rendering deterministic.
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
    case "max":
      return "thinkingMax";
    case "off":
      return "thinkingOff";
  }
}
