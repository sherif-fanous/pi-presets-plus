/**
 * Prompt editor delegation tests.
 *
 * Covers the preset-specific wrapper around Pi's built-in multi-line editor.
 */
import {
  cancelPromptEditor,
  confirmPromptEditorText,
  openPromptEditor,
  promptEditorTitle,
} from "../../src/ui/prompt-editor.js";
import { describe, expect, it } from "vitest";

describe("prompt editor helpers", () => {
  it("builds a named prompt title", () => {
    expect(promptEditorTitle({ presetName: "plan" })).toBe("Edit prompt: plan");
  });

  it("builds an unnamed prompt title", () => {
    expect(promptEditorTitle({ presetName: undefined })).toBe("Edit prompt");
  });

  it("returns the confirmed result shape", () => {
    expect(confirmPromptEditorText("# Prompt")).toEqual({
      confirmed: true,
      text: "# Prompt",
    });
  });

  it("returns the cancelled result shape", () => {
    expect(cancelPromptEditor()).toEqual({ confirmed: false });
  });

  it("delegates to Pi's built-in editor with title and initial text", async () => {
    const editorCalls: Array<[string, string | undefined]> = [];
    const ctx = {
      ui: {
        editor: (title: string, prefill?: string) => {
          editorCalls.push([title, prefill]);

          return Promise.resolve("updated");
        },
      },
    };

    await expect(
      openPromptEditor(ctx as never, {
        initialText: "initial",
        presetName: "plan",
      }),
    ).resolves.toEqual({ confirmed: true, text: "updated" });
    expect(editorCalls).toEqual([["Edit prompt: plan", "initial"]]);
  });

  it("maps built-in editor cancellation to the cancelled result", async () => {
    const ctx = {
      ui: {
        editor: () => Promise.resolve(undefined),
      },
    };

    await expect(
      openPromptEditor(ctx as never, {
        initialText: "initial",
        presetName: undefined,
      }),
    ).resolves.toEqual({ confirmed: false });
  });
});
