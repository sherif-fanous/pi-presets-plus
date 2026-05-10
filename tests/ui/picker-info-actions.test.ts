/**
 * Integration tests for picker Status/Clear info-dialog actions.
 *
 * These tests exercise picker key routing and overlay restoration with
 * mocked command runners; command formatter details are covered elsewhere.
 */
import type { ApplyResult } from "../../src/activation/apply.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { Component } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clearReturning = vi.fn();
const formatStatusBody = vi.fn();
const loadAll = vi.fn();
const openConfirm = vi.fn();
const openInfoDialog = vi.fn();
const renderClearSummary = vi.fn();

vi.mock("../../src/activation/clear.js", () => ({
  clearReturning,
}));

vi.mock("../../src/ui/clear-summary.js", () => ({
  renderClearSummary,
}));

vi.mock("../../src/commands/presets/status.js", () => ({
  formatStatusBody,
}));

vi.mock("../../src/store/api.js", () => ({
  addPreset: vi.fn(),
  loadAll,
  removePreset: vi.fn(),
  reorderWithinScope: vi.fn(),
}));

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

vi.mock("../../src/ui/info-dialog.js", () => ({
  openInfoDialog,
}));

const { openPicker } = await import("../../src/ui/picker.js");

const selected: LoadedPreset = {
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

interface PickerHarness {
  readonly focus: ReturnType<typeof vi.fn>;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly requestRender: ReturnType<typeof vi.fn>;
  readonly setHidden: ReturnType<typeof vi.fn>;
}

function makeCtx(
  input: string,
): PickerHarness & Parameters<typeof openPicker>[0] {
  const focus = vi.fn();
  const notify = vi.fn();
  const requestRender = vi.fn();
  const setHidden = vi.fn();

  return {
    getActiveTools: () => [],
    ui: {
      custom: vi.fn(
        async (
          factory: (
            tui: { requestRender(): void; terminal: { rows: number } },
            theme: unknown,
            keybindings: unknown,
            done: (result: unknown) => void,
          ) => Component,
          options: { onHandle?(handle: unknown): void },
        ) =>
          new Promise((resolve) => {
            const component = factory(
              { requestRender, terminal: { rows: 24 } },
              {
                bold: (text: string) => text,
                fg: (_name: string, text: string) => text,
              },
              {},
              resolve,
            );

            options.onHandle?.({ focus, setHidden });
            component.handleInput?.(input);
            setTimeout(() => resolve(undefined), 10);
          }),
      ),
      notify,
    },
    focus,
    notify,
    requestRender,
    setHidden,
  } as unknown as PickerHarness & Parameters<typeof openPicker>[0];
}

async function runPicker(
  input: string,
  withPi = true,
  onActivate: () => Promise<ApplyResult> = () =>
    Promise.resolve({ ok: true } as const),
): Promise<PickerHarness> {
  const ctx = makeCtx(input);

  loadAll.mockResolvedValue({ presets: [selected], warnings: [] });

  const opened = openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate,
    pi: withPi ? (ctx as never) : undefined,
    session: new ActivePresetSession(),
  });

  await vi.runAllTimersAsync();
  await opened;
  await vi.runAllTimersAsync();

  return ctx;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  formatStatusBody.mockResolvedValue({
    body: "status body",
    severity: "info",
    warnings: [],
  });
  openConfirm.mockResolvedValue(true);
  openInfoDialog.mockResolvedValue(undefined);
  clearReturning.mockResolvedValue({ name: "plan", parts: [] });
  renderClearSummary.mockReturnValue("clear body");
});

describe("openPicker info actions", () => {
  it("opens activation refusals in an error info-dialog", async () => {
    const ctx = await runPicker("\r", true, () =>
      Promise.resolve({
        kind: "no-key",
        ok: false,
        reason:
          'Preset "plan" is unavailable: missing API key. Activation skipped.',
      } as const),
    );

    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: 'Preset "plan" is unavailable: missing API key. Activation skipped.',
      title: "Activation failed",
      tone: "error",
    });
    expect(ctx.notify).not.toHaveBeenCalled();
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
  });

  it("opens status in an info-dialog and restores picker focus", async () => {
    const ctx = await runPicker("s");

    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: "status body",
      title: "Preset Status",
      tone: "info",
    });
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
  });

  it("prepends load warnings to picker status dialog output", async () => {
    formatStatusBody.mockResolvedValue({
      body: "status body",
      severity: "info",
      warnings: ["failed to read user presets"],
    });

    await runPicker("s");

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "warnings:\n- failed to read user presets\n\nstatus body",
      title: "Preset Status",
      tone: "info",
    });
  });

  it("opens no-active status body in an info-dialog", async () => {
    formatStatusBody.mockResolvedValue({
      body: "No preset is active.",
      severity: "info",
      warnings: [],
    });

    await runPicker("s");

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "No preset is active.",
      title: "Preset Status",
      tone: "info",
    });
  });

  it("explains status unavailability when pi is not provided", async () => {
    await runPicker("s", false);

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "This action is unavailable because the Pi API was not provided.",
      title: "Status Unavailable",
      tone: "warning",
    });
  });

  it("shows confirmed clear summary in an info-dialog, not notify", async () => {
    const ctx = await runPicker("c");

    expect(openConfirm).toHaveBeenCalledOnce();
    expect(clearReturning).toHaveBeenCalledOnce();
    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: "clear body",
      title: "Preset Cleared",
      tone: "info",
    });
    expect(ctx.notify).not.toHaveBeenCalledWith("clear body", "info");
  });

  it("explains clear unavailability when pi is not provided", async () => {
    await runPicker("c", false);

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "This action is unavailable because the Pi API was not provided.",
      title: "Clear Unavailable",
      tone: "warning",
    });
  });

  it("does not open info-dialog when clear confirm is declined", async () => {
    openConfirm.mockResolvedValue(false);

    await runPicker("c");

    expect(clearReturning).not.toHaveBeenCalled();
    expect(openInfoDialog).not.toHaveBeenCalled();
  });
});
