/**
 * Durable TUI-only command reports for pi-presets-plus.
 *
 * Owns report entry data, rendering, and mode-aware delivery; it does NOT
 * format preset status or policy data.
 */
import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export const COMMAND_REPORT_ENTRY_TYPE = "presets-plus:command-report";

export interface CommandReportData {
  readonly body: string;
  readonly severity: "info" | "warning";
}

export const renderCommandReport: EntryRenderer<CommandReportData> = (
  entry,
  _options,
  theme,
) => new Text(styleReportText(entry.data?.body ?? "", theme), 1, 0);

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

export function registerCommandReportRenderer(
  pi: Pick<ExtensionAPI, "registerEntryRenderer">,
): void {
  pi.registerEntryRenderer(COMMAND_REPORT_ENTRY_TYPE, renderCommandReport);
}

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
