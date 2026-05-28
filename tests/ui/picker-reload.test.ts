/**
 * Reload-prompt integration tests for picker Delete paths.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { analyzeHotkeys, HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { Component } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAll = vi.fn();
const removePreset = vi.fn();
const openConfirm = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset: vi.fn(),
    loadAll,
    removePreset,
    reorderWithinScope: vi.fn(),
  };
});

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

const { openPicker } = await import("../../src/ui/picker.js");

function makeCtx() {
  const reload = vi.fn();
  const notify = vi.fn();

  return {
    getActiveTools: () => [],
    reload,
    ui: {
      custom: vi.fn(
        async (
          factory: (
            tui: { requestRender(): void; terminal: { rows: number } },
            theme: unknown,
            keybindings: unknown,
            done: (result: unknown) => void,
          ) => Component,
        ) =>
          new Promise((resolve) => {
            const component = factory(
              { requestRender: vi.fn(), terminal: { rows: 24 } },
              {
                bold: (text: string) => text,
                fg: (_name: string, text: string) => text,
              },
              {},
              resolve,
            );

            component.handleInput?.("x");
            setTimeout(() => resolve(undefined), 10);
          }),
      ),
      notify,
    },
  };
}

function preset(hotkey?: string): LoadedPreset {
  return {
    hotkey,
    model: "claude-opus-4.5",
    name: "plan",
    provider: "anthropic",
    scope: "user",
  };
}

async function runDelete(hotkey: string | undefined, reloadAnswer = false) {
  const selected = preset(hotkey);

  const hotkeys = new HotkeyRegistry();
  const baseline = [selected];

  hotkeys.bindForSession(
    baseline,
    analyzeHotkeys(baseline),
    { ui: { notify: () => undefined } } as never,
    { registerShortcut: () => undefined } as never,
    () => Promise.resolve(baseline),
    {} as never,
  );

  const ctx = makeCtx();

  loadAll.mockResolvedValue({ presets: [selected], warnings: [] });
  removePreset.mockResolvedValue({ ok: true });
  openConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(reloadAnswer);

  const opened = openPicker(ctx as never, {
    hotkeys,
    onActivate: () => Promise.resolve({ ok: true }),
    pi: ctx as never,
    session: new ActivePresetSession(),
  });

  await vi.runAllTimersAsync();
  await opened;
  await vi.runAllTimersAsync();

  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

describe("openPicker delete reload prompt", () => {
  it("prompts after deleting a hotkey-bearing preset", async () => {
    const ctx = await runDelete("ctrl+1", true);

    expect(removePreset).toHaveBeenCalledOnce();
    expect(openConfirm).toHaveBeenCalledTimes(2);
    expect(ctx.reload).toHaveBeenCalledOnce();
    expect(loadAll).toHaveBeenCalledTimes(1);
  });

  it("does not prompt after deleting a preset without a hotkey", async () => {
    const ctx = await runDelete(undefined, true);

    expect(removePreset).toHaveBeenCalledOnce();
    expect(openConfirm).toHaveBeenCalledTimes(1);
    expect(ctx.reload).not.toHaveBeenCalled();
    expect(loadAll).toHaveBeenCalledTimes(2);
  });

  it("refreshes and stays open when the user declines reload", async () => {
    const ctx = await runDelete("ctrl+1", false);

    expect(openConfirm).toHaveBeenCalledTimes(2);
    expect(ctx.reload).not.toHaveBeenCalled();
    expect(loadAll).toHaveBeenCalledTimes(2);
  });
});
