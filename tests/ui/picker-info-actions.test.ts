/**
 * Integration tests for picker info actions and command failure reporting.
 *
 * These tests exercise picker key routing, overlay restoration, and error
 * notifications; command formatter details are covered elsewhere.
 */
import type { ApplyResult } from "../../src/activation/apply.js";
import { ActivePresetSession } from "../../src/activation/session.js";
import { HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { PickerCommandHost } from "../../src/ui/picker-commands.js";
import type { Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clearReturning = vi.fn();
const formatStatusBody = vi.fn();
const loadAll = vi.fn();
const openConfirm = vi.fn();
const openInfoDialog = vi.fn();
const renderClearSummary = vi.fn();
const reorderWithinScope = vi.fn();

vi.mock("../../src/activation/clear.js", () => ({
  clearReturning,
}));

vi.mock("../../src/ui/clear-summary.js", () => ({
  renderClearSummary,
}));

vi.mock("../../src/commands/presets/status.js", () => ({
  formatStatusBody,
}));

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset: vi.fn(),
    loadAll,
    removePreset: vi.fn(),
    reorderWithinScope,
  };
});

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

vi.mock("../../src/ui/info-dialog.js", () => ({
  openInfoDialog,
}));

const { PickerCommands: pickerCommandsClass } =
  await import("../../src/ui/picker-commands.js");
const { openPicker } = await import("../../src/ui/picker.js");

const selected: LoadedPreset = {
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};

interface PickerHarness {
  readonly done: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
  readonly handleInput: (input: string) => void;
  readonly notify: ReturnType<typeof vi.fn>;
  readonly requestRender: ReturnType<typeof vi.fn>;
  readonly setHidden: ReturnType<typeof vi.fn>;
}

interface RunPickerOptions {
  readonly active?: boolean;
  readonly onActivate?: (preset: LoadedPreset) => Promise<ApplyResult>;
  readonly presets?: LoadedPreset[];
  readonly withPi?: boolean;
}

function makeCtx(
  input: string,
): PickerHarness & Parameters<typeof openPicker>[0] {
  const done = vi.fn();
  const focus = vi.fn();
  const notify = vi.fn();
  const requestRender = vi.fn();
  const setHidden = vi.fn();
  let picker: Component | undefined;

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
            picker = factory(
              { requestRender, terminal: { rows: 24 } },
              {
                bold: (text: string) => text,
                fg: (_name: string, text: string) => text,
              },
              {},
              (result: unknown) => {
                done(result);
                resolve(result);
              },
            );

            options.onHandle?.({ focus, setHidden });
            picker.handleInput?.(input);
            setTimeout(() => resolve(undefined), 10);
          }),
      ),
      notify,
      setStatus: vi.fn(),
      theme: {
        fg: (_color: string, text: string) => text,
      },
    },
    done,
    focus,
    handleInput: (nextInput: string) => picker?.handleInput?.(nextInput),
    notify,
    requestRender,
    setHidden,
  } as unknown as PickerHarness & Parameters<typeof openPicker>[0];
}

async function runPicker(
  input: string,
  options: RunPickerOptions = {},
): Promise<PickerHarness> {
  const {
    active = false,
    onActivate = () => Promise.resolve({ ok: true } as const),
    presets = [selected],
    withPi = true,
  } = options;
  const ctx = makeCtx(input);
  const session = new ActivePresetSession();

  loadAll.mockResolvedValue({ presets, warnings: [] });

  if (active) {
    session.restoreFromBranch(
      [
        {
          customType: "presets-plus:active",
          data: { name: selected.name, scope: selected.scope },
          type: "custom",
        },
      ] as never,
      [selected],
      ctx,
    );
  }

  const opened = openPicker(ctx, {
    hotkeys: new HotkeyRegistry(),
    onActivate,
    pi: withPi ? (ctx as never) : undefined,
    session,
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
    const ctx = await runPicker("\r", {
      onActivate: () =>
        Promise.resolve({
          kind: "no-key",
          ok: false,
          reason:
            'Preset "plan" is unavailable: missing API key. Activation skipped.',
        } as const),
    });

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
      body: "Warnings:\n- failed to read user presets\n\nstatus body",
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
    await runPicker("s", { withPi: false });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "Pi did not provide the API needed for this action.",
      title: "Status Unavailable",
      tone: "warning",
    });
  });

  it("short-circuits clear with an info-dialog when no preset is active", async () => {
    const ctx = await runPicker("c");

    expect(openConfirm).not.toHaveBeenCalled();
    expect(clearReturning).not.toHaveBeenCalled();
    expect(openInfoDialog).toHaveBeenCalledWith(ctx, {
      body: "No preset is active.",
      title: "Clear Unavailable",
      tone: "info",
    });
    expect(ctx.setHidden).toHaveBeenCalledWith(true);
    expect(ctx.setHidden).toHaveBeenCalledWith(false);
    expect(ctx.focus).toHaveBeenCalledOnce();
    expect(ctx.done).not.toHaveBeenCalled();
  });

  it("shows confirmed clear summary in an info-dialog, not notify", async () => {
    const ctx = await runPicker("c", { active: true });

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
    await runPicker("c", { withPi: false });

    expect(openInfoDialog).toHaveBeenCalledWith(expect.anything(), {
      body: "Pi did not provide the API needed for this action.",
      title: "Clear Unavailable",
      tone: "warning",
    });
  });

  it("does not open info-dialog when clear confirm is declined", async () => {
    openConfirm.mockResolvedValue(false);

    await runPicker("c", { active: true });

    expect(clearReturning).not.toHaveBeenCalled();
    expect(openInfoDialog).not.toHaveBeenCalled();
  });

  it("reports a thrown action, ignores pending input, and accepts a later action", async () => {
    let rejectStatus: ((reason?: unknown) => void) | undefined;
    const next = { ...selected, name: "ship" };
    const onActivate = vi.fn().mockResolvedValue({ ok: true });

    formatStatusBody.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectStatus = reject;
        }),
    );

    const ctx = await runPicker("s", {
      onActivate,
      presets: [selected, next],
    });

    ctx.handleInput("\u001b[B");
    ctx.handleInput("/");
    ctx.handleInput("x");
    ctx.handleInput("\r");

    expect(openConfirm).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    if (!rejectStatus) throw new Error("Status action did not start.");
    rejectStatus(new Error("Status failed"));
    await vi.runAllTimersAsync();

    expect(ctx.notify).toHaveBeenCalledOnce();
    expect(ctx.notify).toHaveBeenCalledWith(
      "Pi Presets Plus could not complete the action. Status failed.",
      "error",
    );

    ctx.handleInput("\r");
    await vi.runAllTimersAsync();

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(selected);
  });

  it("reports a rejected reorder without refreshing the picker", async () => {
    const reason =
      "Pi Presets Plus did not change the user preset file at /tmp/presets.json. It could not load the complete file. Fix the file and try again.";
    const notify = vi.fn();
    const refreshPresets = vi.fn();
    const next = { ...selected, name: "ship" };
    const host = {
      ctx: {},
      finish: vi.fn(),
      getAllPresets: () => [selected, next],
      hotkeys: new HotkeyRegistry(),
      onActivate: vi.fn(),
      pi: undefined,
      currentSelection: () => selected,
      refreshPresets,
      runWithHiddenOverlay: vi.fn(),
      session: new ActivePresetSession(),
      theme: {},
      ui: { notify },
    } as unknown as PickerCommandHost;

    reorderWithinScope.mockResolvedValue({ ok: false, reason });

    await new pickerCommandsClass(host).reorder(1);

    expect(notify).toHaveBeenCalledWith(reason, "error");
    expect(refreshPresets).not.toHaveBeenCalled();
  });
});
