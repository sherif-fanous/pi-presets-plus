/**
 * Delivers a command report as a durable transcript entry in TUI mode and
 * as a notification everywhere else.
 */
import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/** Entry type the report renderer registers under. */
export const COMMAND_REPORT_ENTRY_TYPE = "presets-plus:command-report";

/** Body text and severity of one command report. */
export interface CommandReportData {
  readonly body: string;
  readonly severity: "info" | "warning";
}

/** Render a stored report entry as themed transcript text. */
export const renderCommandReport: EntryRenderer<CommandReportData> = (
  entry,
  _options,
  theme,
) => new Text(styleReportText(entry.data?.body ?? "", theme), 1, 0);

/** Show a report through the transcript in TUI mode, or a notification. */
export function deliverCommandReport(
  ctx: Pick<ExtensionContext, "mode" | "ui">,
  pi: Pick<ExtensionAPI, "appendEntry">,
  report: CommandReportData,
): void {
  if (ctx.mode === "tui") {
    pi.appendEntry(COMMAND_REPORT_ENTRY_TYPE, report);

    return;
  }

  ctx.ui.notify(styleReportText(report.body, ctx.ui.theme), report.severity);
}

/** Register the report renderer so stored entries survive a reload. */
export function registerCommandReportRenderer(
  pi: Pick<ExtensionAPI, "registerEntryRenderer">,
): void {
  pi.registerEntryRenderer(COMMAND_REPORT_ENTRY_TYPE, renderCommandReport);
}

/**
 * Apply report styling: an accent heading, a warning-colored `Warnings:`
 * line, and muted labels on every `label: value` row.
 */
export function styleReportText(
  body: string,
  theme?: Pick<Theme, "bold" | "fg">,
): string {
  const safeTheme = theme ?? {
    bold: (text: string) => text,
    fg: (_color: Parameters<Theme["fg"]>[0], text: string) => text,
  };

  return body
    .split("\n")
    .map((line, index) => {
      if (index === 0 && line.startsWith("Preset ")) {
        return safeTheme.bold(safeTheme.fg("accent", line));
      }

      if (line === "Warnings:") return safeTheme.fg("warning", line);

      const match = line.match(/^(\s*)([^:]+:)(.*)$/);

      if (!match) return line;

      return `${match[1]}${safeTheme.fg("muted", match[2] ?? "")}${match[3]}`;
    })
    .join("\n");
}
