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
const openConfirm = vi.fn<() => Promise<boolean>>();
const openInfoDialog =
  vi.fn<
    (
      ctx: unknown,
      options: { readonly body: string; readonly title: string },
    ) => Promise<void>
  >();

vi.mock("../../src/ui/confirm.js", () => ({
  openConfirm,
}));

vi.mock("../../src/ui/info-dialog.js", () => ({
  openInfoDialog,
}));

vi.mock("../../src/store/api.js", () => ({
  addPreset,
  loadAll,
  removePreset,
  updatePreset,
}));

const { EDITOR_ROWS, openEditor } = await import("../../src/ui/editor.js");

interface EditorHarness extends Component {
  handleInput(input: string): void;
}

const f1Input = "\u001bOP";
const promptNewlineHint = "Enter inserts a newline. Tab exits.";

const passthroughTheme = {
  bold: (text: string) => text,
  fg: (_name: string, text: string) => text,
};

const model = { id: "claude-opus-4.5", provider: "anthropic" };

function expectBottomMessagesNotToContain(
  editor: EditorHarness,
  text: string,
): void {
  const lines = editor.render(100);
  const hotkeyIndex = lines.findIndex((line) => line.includes("Hotkey"));
  const actionsIndex = lines.findIndex((line) => line.includes("Actions"));

  expect(hotkeyIndex).toBeGreaterThanOrEqual(0);
  expect(actionsIndex).toBeGreaterThan(hotkeyIndex);
  expect(lines.slice(hotkeyIndex + 1, actionsIndex).join("\n")).not.toContain(
    text,
  );
}

function expectErrorAfterLabel(
  editor: EditorHarness,
  label: string,
  error: string,
): void {
  const lines = editor.render(100);
  const labelIndex = lines.findIndex((line) => line.includes(label));
  const errorIndex = lines.findIndex((line) => line.includes(error));

  expect(labelIndex).toBeGreaterThanOrEqual(0);
  expect(errorIndex).toBeGreaterThan(labelIndex);
}

function lineContaining(editor: EditorHarness, text: string): string {
  const line = editor.render(100).find((candidate) => candidate.includes(text));

  if (!line)
    throw new Error(`Could not find rendered line containing ${text}.`);

  return line;
}

function makeCtx(
  capture: (editor: EditorHarness) => void,
  overlayHandle: {
    readonly focus: ReturnType<typeof vi.fn>;
    readonly setHidden: ReturnType<typeof vi.fn>;
  },
  models: readonly (typeof model)[] = [model],
) {
  return {
    modelRegistry: {
      getAll: () => models,
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
          options?: { onHandle?(handle: typeof overlayHandle): void },
        ) =>
          new Promise((resolve) => {
            const editor = factory(
              { requestRender: vi.fn() },
              passthroughTheme,
              {},
              resolve,
            ) as EditorHarness;

            capture(editor);
            options?.onHandle?.(overlayHandle);
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
    readonly models?: readonly (typeof model)[];
    readonly onTest?: (preset: LoadedPreset) => Promise<{ ok: boolean }>;
    readonly presets?: readonly LoadedPreset[];
  } = {},
): Promise<{
  readonly editor: EditorHarness;
  readonly overlayHandle: {
    readonly focus: ReturnType<typeof vi.fn>;
    readonly setHidden: ReturnType<typeof vi.fn>;
  };
  readonly result: Promise<unknown>;
}> {
  let editor: EditorHarness | undefined;
  const overlayHandle = { focus: vi.fn(), setHidden: vi.fn() };
  const ctx = makeCtx(
    (nextEditor) => {
      editor = nextEditor;
    },
    overlayHandle,
    options.models,
  );
  const result = openEditor(ctx as never, options.initial, {
    onTest: options.onTest,
    presets: options.presets ?? (options.initial ? [options.initial] : []),
  });

  await Promise.resolve();

  if (!editor) throw new Error("Editor was not created.");

  return { editor, overlayHandle, result };
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

async function waitForEditorUpdate(assertion: () => void): Promise<void> {
  await vi.waitFor(assertion);
}

beforeEach(() => {
  vi.clearAllMocks();
  addPreset.mockResolvedValue({ ok: true });
  loadAll.mockResolvedValue({ presets: [preset()], warnings: [] });
  removePreset.mockResolvedValue({ ok: true });
  openConfirm.mockResolvedValue(true);
  openInfoDialog.mockResolvedValue(undefined);
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

  it("surfaces all required Save validation errors inline from Ctrl+S", async () => {
    const { editor } = await openHarness({ models: [] });

    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expectErrorAfterLabel(editor, "Name", "Name is required.");
      expectErrorAfterLabel(editor, "Provider", "Provider is required.");
      expectErrorAfterLabel(editor, "Model", "Model is required.");
    });
    expect(addPreset).not.toHaveBeenCalled();
  });

  it("clears only the Name error when the user types into Name", async () => {
    const { editor } = await openHarness({ models: [] });

    editor.handleInput("\x13");
    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Name is required.");
    });
    editor.handleInput("p");

    const rendered = renderText(editor);

    expect(rendered).not.toContain("Name is required.");
    expect(rendered).toContain("Provider is required.");
    expect(rendered).toContain("Model is required.");
  });

  it("clears Provider and Model errors when Provider changes", async () => {
    const otherModel = { id: "gpt-5", provider: "openai" };
    const { editor } = await openHarness({
      initial: preset({ model: "", name: "draft", provider: "" }),
      models: [model, otherModel],
    });

    editor.handleInput("\x13");
    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Provider is required.");
      expect(renderText(editor)).toContain("Model is required.");
    });
    moveFocus(editor, 2);
    editor.handleInput("\u001b[C");

    const rendered = renderText(editor);

    expect(rendered).not.toContain("Provider is required.");
    expect(rendered).not.toContain("Model is required.");
  });

  it("keeps the visible button selection unchanged when Ctrl+S fails validation", async () => {
    const { editor } = await openHarness({ models: [] });

    moveFocus(editor, 8);
    editor.handleInput("\u001b[C");
    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expect(lineContaining(editor, "Actions")).toContain("● Cancel");
      expectErrorAfterLabel(editor, "Name", "Name is required.");
    });
  });

  it("renders name collisions inline without a bottom-strip error", async () => {
    const existing = preset({ name: "dupe" });
    const { editor } = await openHarness({ presets: [existing] });

    for (const char of "dupe") editor.handleInput(char);
    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expectErrorAfterLabel(
        editor,
        "Name",
        'A preset named "dupe" already exists in user.',
      );
    });

    expectBottomMessagesNotToContain(
      editor,
      'A preset named "dupe" already exists in user.',
    );
  });

  it("clears the Name collision error when Scope changes", async () => {
    const existing = preset({ name: "dupe" });
    const { editor } = await openHarness({ presets: [existing] });

    for (const char of "dupe") editor.handleInput(char);
    editor.handleInput("\x13");
    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain(
        'A preset named "dupe" already exists in user.',
      );
    });
    moveFocus(editor, 1);
    editor.handleInput(" ");

    expect(renderText(editor)).not.toContain(
      'A preset named "dupe" already exists in user.',
    );
  });

  it("keeps Save-cancelled flow errors in the bottom message strip", async () => {
    openConfirm.mockResolvedValueOnce(false);

    const { editor } = await openHarness({
      initial: preset({ hotkey: "ctrl+p" }),
    });

    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Save cancelled.");
    });

    expect(lineContaining(editor, "Actions")).not.toContain("Save cancelled.");
    expect(renderText(editor)).not.toContain("Hotkey is required.");
  });

  it("preserves field errors when a confirmation decline cancels Save", async () => {
    openConfirm.mockResolvedValueOnce(false);

    const { editor } = await openHarness({
      initial: preset({ hotkey: "ctrl+p", name: "" }),
    });

    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Save cancelled.");
      expectErrorAfterLabel(editor, "Name", "Name is required.");
    });
  });

  it("runs name-collision checks before confirmation declines", async () => {
    openConfirm.mockResolvedValueOnce(false);

    const existing = preset({ name: "dupe" });
    const { editor } = await openHarness({ presets: [existing] });

    for (const char of "dupe") editor.handleInput(char);
    moveFocus(editor, 7);
    for (const char of "ctrl+p") editor.handleInput(char);
    editor.handleInput("\x13");

    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Save cancelled.");
      expectErrorAfterLabel(
        editor,
        "Name",
        'A preset named "dupe" already exists in user.',
      );
    });
  });

  it("does not clear field errors when Thinking changes", async () => {
    const { editor } = await openHarness({ models: [] });

    editor.handleInput("\x13");
    await waitForEditorUpdate(() => {
      expect(renderText(editor)).toContain("Name is required.");
    });
    moveFocus(editor, 4);
    editor.handleInput("\u001b[C");

    const rendered = renderText(editor);

    expect(rendered).toContain("Name is required.");
    expect(rendered).toContain("Provider is required.");
    expect(rendered).toContain("Model is required.");
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

  it("opens focused-row help with F1", async () => {
    // Drive the loop by row identity (not positional index) so the test
    // stays correct if EDITOR_ROWS is reordered. The keyed lookup pairs
    // each EditorRowId with the title authored in EDITOR_ROW_HELP; if
    // a row's title or set of rows changes, this map must change too.
    const titlesByRow: Record<(typeof EDITOR_ROWS)[number], string> = {
      buttons: "Actions",
      hotkey: "Hotkey",
      instructions: "Prompt",
      model: "Model",
      name: "Name",
      provider: "Provider",
      scope: "Scope",
      thinking: "Thinking",
      tools: "Tools",
    };

    for (const row of EDITOR_ROWS) {
      const { editor } = await openHarness({ initial: preset() });
      const targetIndex = EDITOR_ROWS.indexOf(row);

      moveFocus(editor, targetIndex);
      editor.handleInput(f1Input);

      await Promise.resolve();

      const helpOptions = openInfoDialog.mock.calls.at(-1)?.[1];

      expect(helpOptions?.body).toEqual(expect.any(String));
      expect(helpOptions?.title).toBe(titlesByRow[row]);
    }
  });

  it("recognizes Kitty F1 sequences across terminals", async () => {
    // Two encodings cover the F-key forms pi-tui's matchesKey doesn't:
    //   - Legacy-with-event-info (observed in Ghostty):
    //       \x1b[1P, \x1b[1;1P, \x1b[1;1:1P
    //   - Codepoint form (per Kitty keyboard-protocol spec):
    //       \x1b[57364u, \x1b[57364;1u, \x1b[57364;1:1u
    for (const input of [
      "\u001b[1P",
      "\u001b[1;1P",
      "\u001b[1;1:1P",
      "\u001b[57364u",
      "\u001b[57364;1u",
      "\u001b[57364;1:1u",
    ]) {
      const { editor } = await openHarness({ initial: preset() });

      editor.handleInput(input);

      await Promise.resolve();

      const helpOptions = openInfoDialog.mock.calls.at(-1)?.[1];

      expect(helpOptions?.body).toEqual(expect.any(String));
      expect(helpOptions?.title).toBe("Name");
    }
  });

  it("opens Prompt help without changing the prompt buffer", async () => {
    const { editor } = await openHarness({ initial: preset() });

    moveFocus(editor, 6);
    editor.handleInput("!");

    const beforeHelp = renderText(editor);

    editor.handleInput(f1Input);

    await Promise.resolve();

    const helpOptions = openInfoDialog.mock.calls.at(-1)?.[1];

    expect(renderText(editor)).toBe(beforeHelp);
    expect(helpOptions?.body).toContain("added to Pi's system prompt");
    expect(helpOptions?.title).toBe("Prompt");
  });

  it("invokes the overlay-hide/show lifecycle when help is opened and resolved", async () => {
    const { editor, overlayHandle } = await openHarness({ initial: preset() });

    moveFocus(editor, 6);
    editor.handleInput(f1Input);

    await Promise.resolve();

    expect(overlayHandle.setHidden).toHaveBeenNthCalledWith(1, true);
    expect(overlayHandle.setHidden).toHaveBeenLastCalledWith(false);
    expect(overlayHandle.focus).toHaveBeenCalledOnce();
    expect(lineContaining(editor, "Prompt")).toContain(
      "keep the prompt stable",
    );
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
      "⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · F1 Help · ^S Save · Esc Cancel",
    );
    expect(footerWithoutTestCallback).not.toContain("^T Test");
    expect(footerWithoutTestCallback).not.toContain("Tab/↑/↓ Move");
    expect(footerWithTestCallback).toContain(
      "⇥/↑/↓ Move · ←/→ Change · Space Toggle · Enter Action · F1 Help · ^S Save · ^T Test · Esc Cancel",
    );
  });

  it("does not render the prompt inline hint", async () => {
    const { editor } = await openHarness({ initial: preset() });

    expect(renderText(editor)).not.toContain(promptNewlineHint);
  });

  it("renders the session tools inline hint", async () => {
    const { editor } = await openHarness({ initial: preset() });

    expect(renderText(editor)).toContain(
      "Session: inherits the active tool set.",
    );
  });
});
