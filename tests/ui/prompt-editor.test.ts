/**
 * Covers the prompt editor wrapper: the title it builds for a named or
 * unnamed preset, and how it turns Pi's built-in editor result into a
 * confirmed or cancelled outcome.
 */
import {
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
