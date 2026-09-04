/**
 * Tests for durable TUI-only command reports.
 *
 * Owns coverage for report delivery and rendering; it does NOT test status or
 * policy formatting.
 */
import {
  COMMAND_REPORT_ENTRY_TYPE,
  deliverCommandReport,
  registerCommandReportRenderer,
  renderCommandReport,
} from "../../src/ui/command-report.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

describe("command reports", () => {
  it("persists a report in TUI mode without notifying", () => {
    const appendEntry = vi.fn();
    const notify = vi.fn();

    deliverCommandReport(
      { mode: "tui", ui: { notify } } as unknown as ExtensionContext,
      { appendEntry },
      { body: "Preset Status", severity: "info" },
    );

    expect(appendEntry).toHaveBeenCalledWith(COMMAND_REPORT_ENTRY_TYPE, {
      body: "Preset Status",
      severity: "info",
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("uses the RPC notification path outside TUI mode", () => {
    const appendEntry = vi.fn();
    const notify = vi.fn();

    deliverCommandReport(
      { mode: "rpc", ui: { notify } } as unknown as ExtensionContext,
      { appendEntry },
      { body: "Preset Policy", severity: "warning" },
    );

    expect(notify).toHaveBeenCalledWith("Preset Policy", "warning");
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it("registers and renders the report entry", () => {
    const registerEntryRenderer = vi.fn();
    const theme = {
      bold: (text: string) => `<bold>${text}</bold>`,
      fg: (_color: string, text: string) => `<muted>${text}</muted>`,
    };

    registerCommandReportRenderer({ registerEntryRenderer });

    expect(registerEntryRenderer).toHaveBeenCalledWith(
      COMMAND_REPORT_ENTRY_TYPE,
      renderCommandReport,
    );

    const component = renderCommandReport(
      {
        data: { body: "Preset Status", severity: "info" },
      } as never,
      { expanded: false },
      theme as never,
    );

    expect(component?.render(80).join("\n")).toContain("Preset Status");
    expect(component?.render(80).join("\n")).toContain("<muted>");
  });
});
