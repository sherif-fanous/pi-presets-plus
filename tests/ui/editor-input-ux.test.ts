/**
 * Regression tests for preset editor text-row rendering and shortcuts.
 *
 * Covers interactive component behavior through `openEditor`; it does NOT
 * exercise storage parsing or picker orchestration beyond mocked seams.
 */
import type { LoadedPreset, Preset } from "../../src/types.js";
import { Input, type Component } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addPreset = vi.fn();
const loadAll = vi.fn();
const removePreset = vi.fn();
const updatePreset = vi.fn();

vi.mock("../../src/store/api.js", () => ({
  addPreset,
  loadAll,
  removePreset,
  updatePreset,
}));

const { openEditor } = await import("../../src/ui/editor.js");

interface EditorHarness extends Component {
  handleInput(input: string): void;
}

const passthroughTheme = {
  bold: (text: string) => text,
  fg: (_name: string, text: string) => text,
};

const model = { id: "claude-opus-4.5", provider: "anthropic" };

function lineContaining(editor: EditorHarness, text: string): string {
  const line = editor.render(100).find((candidate) => candidate.includes(text));

  if (!line)
    throw new Error(`Could not find rendered line containing ${text}.`);

  return line;
}

function makeCtx(capture: (editor: EditorHarness) => void) {
  return {
    modelRegistry: {
      getAll: () => [model],
      hasConfiguredAuth: () => true,
    },
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
              passthroughTheme,
              {},
              resolve,
            ) as EditorHarness;

            capture(editor);
          }),
      ),
    },
  };
}

function moveFocus(editor: EditorHarness, count: number): void {
  for (let index = 0; index < count; index++) editor.handleInput("\t");
}

async function openHarness(
  options: {
    readonly initial?: LoadedPreset;
    readonly onTest?: (preset: LoadedPreset) => Promise<{ ok: boolean }>;
  } = {},
): Promise<{
  readonly editor: EditorHarness;
  readonly result: Promise<unknown>;
}> {
  let editor: EditorHarness | undefined;
  const ctx = makeCtx((nextEditor) => {
    editor = nextEditor;
  });
  const result = openEditor(ctx as never, options.initial, {
    onTest: options.onTest,
    presets: options.initial ? [options.initial] : [],
  });

  await Promise.resolve();

  if (!editor) throw new Error("Editor was not created.");

  return { editor, result };
}

function preset(overrides: Partial<LoadedPreset> = {}): LoadedPreset {
  return {
    hotkey: "ctrl+1",
    instructions: "keep the prompt stable",
    model: model.id,
    name: "plan",
    provider: model.provider,
    scope: "user",
    ...overrides,
  };
}

function renderText(editor: EditorHarness): string {
  return editor.render(100).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  addPreset.mockResolvedValue({ ok: true });
  loadAll.mockResolvedValue({ presets: [preset()], warnings: [] });
  removePreset.mockResolvedValue({ ok: true });
  updatePreset.mockResolvedValue({ ok: true });
});

describe("preset editor input UX", () => {
  it("renders unfocused Name and Hotkey as plain rows without Input cursor", async () => {
    const { editor } = await openHarness({ initial: preset() });

    moveFocus(editor, 1);

    const nameLine = lineContaining(editor, "Name");
    const hotkeyLine = lineContaining(editor, "Hotkey");

    expect(nameLine).not.toContain("\x1b[7m");
    expect(nameLine).not.toContain("> ");
    expect(hotkeyLine).not.toContain("\x1b[7m");
    expect(hotkeyLine).not.toContain("> ");
  });

  it("preserves typed Name text across focus changes", async () => {
    const { editor } = await openHarness();

    editor.handleInput("p");
    editor.handleInput("l");
    editor.handleInput("a");
    editor.handleInput("n");
    moveFocus(editor, 1);

    expect(lineContaining(editor, "Name")).toContain("plan");

    moveFocus(editor, 8);

    const nameLine = lineContaining(editor, "Name");

    expect(nameLine).toContain("plan");
    expect(nameLine).toContain("> ");
    expect(nameLine).toContain("\x1b[7m");
  });

  it("renders the empty Name placeholder only while unfocused", async () => {
    const { editor } = await openHarness();

    moveFocus(editor, 1);

    expect(lineContaining(editor, "Name")).toContain("—");

    moveFocus(editor, 8);

    const nameLine = lineContaining(editor, "Name");

    expect(nameLine).toContain("> ");
    expect(nameLine).toContain("\x1b[7m");
    expect(nameLine).not.toContain("—");
  });

  it("saves with Ctrl+S from the Prompt row without mutating the prompt", async () => {
    const initial = preset();
    const { editor, result } = await openHarness({ initial });

    moveFocus(editor, 6);
    editor.handleInput("\x13");

    await result;

    expect(updatePreset).toHaveBeenCalledOnce();
    expect((updatePreset.mock.calls[0]?.[2] as Preset).instructions).toBe(
      initial.instructions,
    );
  });

  it("surfaces Save validation errors from Ctrl+S", async () => {
    const { editor } = await openHarness();

    editor.handleInput("\x13");

    await Promise.resolve();

    expect(renderText(editor)).toContain("Name is required.");
    expect(addPreset).not.toHaveBeenCalled();
  });

  it("keeps the visible button selection unchanged when Ctrl+S fails validation", async () => {
    const { editor } = await openHarness();

    moveFocus(editor, 8);
    editor.handleInput("\u001b[C");
    editor.handleInput("\x13");

    await Promise.resolve();

    expect(lineContaining(editor, "Actions")).toContain("● Cancel");
    expect(renderText(editor)).toContain("Name is required.");
  });

  it("runs Ctrl+T only when a test callback is wired", async () => {
    const onTest = vi.fn().mockResolvedValue({ ok: true });
    const withTest = await openHarness({ initial: preset(), onTest });

    withTest.editor.handleInput("\x14");
    await withTest.result;

    expect(onTest).toHaveBeenCalledOnce();

    const withoutTest = await openHarness({ initial: preset() });
    const handleInput = vi.spyOn(Input.prototype, "handleInput");

    withoutTest.editor.handleInput("\x14");
    await Promise.resolve();

    expect(handleInput).toHaveBeenCalledWith("\x14");
    expect(() => withoutTest.editor.render(100)).not.toThrow();

    handleInput.mockRestore();
  });

  it("renders shortcut-aware footer hints on one line", async () => {
    const withoutTest = await openHarness({ initial: preset() });
    const withTest = await openHarness({
      initial: preset(),
      onTest: vi.fn().mockResolvedValue({ ok: false }),
    });
    const footerWithoutTestCallback = lineContaining(
      withoutTest.editor,
      "⇥/↑/↓ Move",
    );
    const footerWithTestCallback = lineContaining(
      withTest.editor,
      "⇥/↑/↓ Move",
    );

    expect(footerWithoutTestCallback).toContain(
      "⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · ^S Save · Esc Cancel",
    );
    expect(footerWithoutTestCallback).not.toContain("^T Test");
    expect(footerWithoutTestCallback).not.toContain("Tab/↑/↓ Move");
    expect(footerWithTestCallback).toContain(
      "⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · ^S Save · ^T Test · Esc Cancel",
    );
  });

  it("renders the prompt inline hint", async () => {
    const { editor } = await openHarness({ initial: preset() });

    expect(renderText(editor)).toContain("Enter inserts a newline. Tab exits.");
  });

  it("renders the session tools inline hint", async () => {
    const { editor } = await openHarness({ initial: preset() });

    expect(renderText(editor)).toContain(
      "Session: inherits the active tool set.",
    );
  });
});
