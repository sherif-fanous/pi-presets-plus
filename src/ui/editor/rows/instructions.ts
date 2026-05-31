/**
 * "Instructions" (prompt) row factory.
 *
 * Owns the open-prompt-editor trigger, help payload, and render. The
 * actual multi-line editor lives in `prompt-editor.ts`; this row just
 * opens it via the host when Enter is pressed.
 */
import {
  EMPTY_INPUT_PLACEHOLDER,
  renderValueRow,
  withFieldDiagnostic,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export function makeInstructionsRow(host: EditorRowHost): EditorRow {
  return {
    id: "instructions",
    help: {
      body: [
        "Whatever you write here gets added to Pi's system prompt when this preset is active. It doesn't replace what Pi already has \u2014 it adds to it.",
        "Use it to describe your project's conventions, the tone you want, or any rules Pi should follow.",
        "Press Enter on the Prompt row to open the multi-line editor, then Ctrl-S to confirm or Esc to cancel.",
      ],
      title: "Prompt",
    },
    handleInput(input) {
      if (!matchesKey(input, Key.enter)) return;

      void host.runAsync(() => host.openPromptEditor());
    },
    renderLines(width) {
      const state = host.getState();
      const focused = host.currentRow() === "instructions";
      const preview =
        state.instructions.length === 0
          ? host.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER)
          : state.instructions.replaceAll("\n", " ↵ ");

      return withFieldDiagnostic(
        host,
        "instructions",
        renderValueRow(
          host.theme,
          focused ? "Prompt (Enter to edit)" : "Prompt",
          truncateToWidth(preview, Math.max(1, width - 16), "…"),
          focused,
        ),
      );
    },
  };
}
