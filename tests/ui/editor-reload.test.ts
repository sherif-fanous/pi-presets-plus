/**
 * Reload-prompt integration tests for editor Save paths.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import { analyzeHotkeys, HotkeyRegistry } from "../../src/hotkey-registry.js";
import type { LoadedPreset } from "../../src/types.js";
import type { EditorFormState } from "../../src/ui/editor.js";
import type { Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addPreset = vi.fn();
const loadAll = vi.fn();
const removePreset = vi.fn();
const updatePreset = vi.fn();
const openConfirm = vi.fn();

vi.mock("../../src/store/api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/store/api.js")>();

  return {
    ...actual,
    addPreset,
    loadAll,
    removePreset,
    updatePreset,
  };
});

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

const { openEditor } = await import("../../src/ui/editor.js");

interface EditorHarness extends Component {
  save(): Promise<void>;
  state: EditorFormState;
}

function makeCtx(mutate: (editor: EditorHarness) => void) {
  const reload = vi.fn();
  const notify = vi.fn();

  return {
    modelRegistry: {
      getAll: () => [{ id: "claude-opus-4.5", provider: "anthropic" }],
      hasConfiguredAuth: () => true,
    },
    reload,
    ui: {
      custom: vi.fn(
        async (
          factory: (
            tui: { requestRender(): void },
            theme: unknown,
            keybindings: unknown,
            done: (result: unknown) => void,
          ) => Component,
        ) =>
          new Promise((resolve) => {
            const editor = factory(
              { requestRender: vi.fn() },
              {
                bold: (text: string) => text,
                fg: (_name: string, text: string) => text,
              },
              {},
              resolve,
            ) as unknown as EditorHarness;

            mutate(editor);
            void editor.save().then(() => resolve(undefined));
          }),
      ),
      notify,
    },
  };
}

function preset(overrides: Partial<LoadedPreset> = {}): LoadedPreset {
  return {
    model: "claude-opus-4.5",
    name: "plan",
    provider: "anthropic",
    scope: "user",
    ...overrides,
  };
}

async function runSave(options: {
  readonly initial?: LoadedPreset;
  readonly nextHotkey: string;
  readonly nextName?: string;
  readonly confirmAnswer?: boolean;
  readonly acknowledged?: readonly LoadedPreset[];
  readonly baseline?: readonly LoadedPreset[];
  readonly confirmAnswers?: readonly boolean[];
  readonly scope?: LoadedPreset["scope"];
}) {
  const initial = options.initial;

  const hotkeys = new HotkeyRegistry();
  const baseline = [...(options.baseline ?? (initial ? [initial] : []))];

  hotkeys.bindForSession(
    baseline,
    analyzeHotkeys(baseline),
    { ui: { notify: () => undefined } } as never,
    { registerShortcut: () => undefined } as never,
    () => Promise.resolve(baseline),
    {} as never,
  );

  for (const acknowledged of options.acknowledged ?? []) {
    hotkeys.recordReloadPromptDeclined(acknowledged, acknowledged.hotkey);
  }

  const saved = preset({
    hotkey: options.nextHotkey || undefined,
    name: options.nextName ?? initial?.name ?? "plan",
    scope: options.scope ?? initial?.scope ?? "user",
  });
  const ctx = makeCtx((editor) => {
    editor.state = {
      ...editor.state,
      hotkey: options.nextHotkey,
      name: saved.name,
      scope: saved.scope,
    };
  });

  addPreset.mockResolvedValue({ ok: true });
  updatePreset.mockResolvedValue({ ok: true });
  removePreset.mockResolvedValue({ ok: true });
  loadAll.mockResolvedValue({ presets: [saved], warnings: [] });

  if (options.confirmAnswers) {
    for (const answer of options.confirmAnswers) {
      openConfirm.mockResolvedValueOnce(answer);
    }
  } else {
    openConfirm.mockResolvedValue(options.confirmAnswer ?? false);
  }

  const openOptions = initial
    ? { mode: "edit" as const, seed: initial, target: initial }
    : { mode: "new" as const };
  const result = await openEditor(ctx as never, openOptions, {
    hotkeys,
    presets: initial ? [initial] : [],
    session: new ActivePresetSession(),
  });

  return { ctx, result };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("openEditor reload prompt", () => {
  it.each([
    ["add-hotkey", undefined, "ctrl+1", true],
    ["change-hotkey", preset({ hotkey: "ctrl+1" }), "ctrl+2", true],
    ["remove-hotkey", preset({ hotkey: "ctrl+1" }), "", true],
    ["no-change", preset({ hotkey: "ctrl+1" }), "ctrl+1", false],
  ])("handles %s", async (_label, initial, nextHotkey, prompts) => {
    const { ctx, result } = await runSave({
      initial,
      nextHotkey,
      confirmAnswer: true,
    });

    expect(openConfirm).toHaveBeenCalledTimes(prompts ? 1 : 0);
    expect(result?.reloadRequested).toBe(prompts ? true : undefined);
    expect(ctx.reload).not.toHaveBeenCalled();
  });

  it("does not prompt when a pending hotkey add is reverted before reload", async () => {
    const initial = preset({ hotkey: "ctrl+1" });

    const { result } = await runSave({
      baseline: [],
      initial,
      nextHotkey: "",
    });

    expect(openConfirm).not.toHaveBeenCalled();
    expect(result?.reloadRequested).toBeUndefined();
  });

  it("prompts when a hotkey-bearing preset is renamed", async () => {
    const initial = preset({ hotkey: "ctrl+1" });

    const { result } = await runSave({
      initial,
      nextHotkey: "ctrl+1",
      nextName: "plan2",
      confirmAnswer: false,
    });

    expect(openConfirm).toHaveBeenCalledOnce();
    expect(result?.reloadRequested).toBe(false);
  });

  it("does not prompt when a pending rename is renamed back to runtime identity", async () => {
    const baseline = preset({ hotkey: "ctrl+1", name: "plan" });
    const initial = preset({ hotkey: "ctrl+1", name: "plan2" });

    const { result } = await runSave({
      baseline: [baseline],
      initial,
      nextHotkey: "ctrl+1",
      nextName: "plan",
    });

    expect(openConfirm).not.toHaveBeenCalled();
    expect(result?.reloadRequested).toBeUndefined();
  });

  it("does not prompt when a deleted hotkey preset is re-added at runtime identity", async () => {
    const baseline = preset({ hotkey: "ctrl+1", name: "plan" });

    const { result } = await runSave({
      baseline: [baseline],
      nextHotkey: "ctrl+1",
      nextName: "plan",
    });

    expect(openConfirm).not.toHaveBeenCalled();
    expect(result?.reloadRequested).toBeUndefined();
  });

  it("does not re-prompt for the same declined pending rename", async () => {
    const baseline = preset({ hotkey: "ctrl+1", name: "plan" });
    const initial = preset({ hotkey: "ctrl+1", name: "plan2" });

    const { result } = await runSave({
      acknowledged: [initial],
      baseline: [baseline],
      initial,
      nextHotkey: "ctrl+1",
    });

    expect(openConfirm).not.toHaveBeenCalled();
    expect(result?.reloadRequested).toBeUndefined();
  });

  it("prompts once for a scope move with a hotkey change", async () => {
    const initial = preset({ hotkey: "ctrl+1", scope: "user" });

    await runSave({
      initial,
      nextHotkey: "ctrl+2",
      scope: "project",
      confirmAnswers: [true, false],
    });

    expect(openConfirm).toHaveBeenCalledTimes(2);
    expect(removePreset).toHaveBeenCalledOnce();
  });

  it("prompts for a scope move with an unchanged hotkey", async () => {
    const initial = preset({ hotkey: "ctrl+1", scope: "user" });

    await runSave({
      initial,
      nextHotkey: "ctrl+1",
      scope: "project",
      confirmAnswers: [true],
    });

    expect(openConfirm).toHaveBeenCalledTimes(2);
  });

  it("does not prompt when persistence fails", async () => {
    const initial = preset({ hotkey: "ctrl+1" });
    const ctx = makeCtx((editor) => {
      editor.state = { ...editor.state, hotkey: "ctrl+2", name: initial.name };
    });

    updatePreset.mockResolvedValue({ ok: false, reason: "nope" });

    await openEditor(
      ctx as never,
      { mode: "edit", seed: initial, target: initial },
      {
        presets: [initial],
        session: new ActivePresetSession(),
      },
    );

    expect(openConfirm).not.toHaveBeenCalled();
    expect(ctx.reload).not.toHaveBeenCalled();
  });
});
