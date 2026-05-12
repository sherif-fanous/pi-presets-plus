/**
 * Prompt editor delegation for preset form instructions.
 *
 * Owns the preset-specific title and result shape around Pi's built-in
 * editor; it does NOT own text-editing mechanics, rendering, or storage.
 */
import { PROMPT_EDITOR_TITLE, PROMPT_EDITOR_TITLE_PREFIX } from "./labels.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export interface PromptEditorOptions {
  readonly initialText: string;
  readonly presetName: string | undefined;
}

export type PromptEditorResult =
  | { confirmed: true; text: string }
  | { confirmed: false };

export function cancelPromptEditor(): PromptEditorResult {
  return { confirmed: false };
}

export function confirmPromptEditorText(text: string): PromptEditorResult {
  return { confirmed: true, text };
}

export async function openPromptEditor(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: PromptEditorOptions,
): Promise<PromptEditorResult> {
  const text = await ctx.ui.editor(
    promptEditorTitle(options),
    options.initialText,
  );

  return text === undefined
    ? cancelPromptEditor()
    : confirmPromptEditorText(text);
}

export function promptEditorTitle(
  options: Pick<PromptEditorOptions, "presetName">,
): string {
  const name = options.presetName?.trim();

  return name ? `${PROMPT_EDITOR_TITLE_PREFIX}${name}` : PROMPT_EDITOR_TITLE;
}
