/**
 * The editor's hotkey row, which takes the typed key combination and asks
 * the host to recheck it for conflicts after every keystroke.
 */
import { renderTextInputRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";

/** Build the hotkey row. */
export function makeHotkeyRow(host: EditorRowHost): EditorRow {
  return {
    id: "hotkey",
    help: {
      body: [
        "Hotkeys let you switch to this preset with a single key combination.",
        "Use Pi's format, like ctrl+shift+1 or ctrl+m. Leave it blank if you don't want a hotkey.",
        "If your choice conflicts with another preset or a Pi built-in, you'll see a warning, but you can still save.",
      ],
      title: "Hotkey",
    },
    handleInput(input) {
      host.hotkeyInput.handleInput(input);
      host.setState({
        ...host.getState(),
        hotkey: host.hotkeyInput.getValue(),
      });
      host.recomputeHotkeyDiagnostic();
    },
    renderLines(width) {
      return renderTextInputRow(
        host,
        "Hotkey",
        "hotkey",
        host.hotkeyInput,
        host.getState().hotkey,
        width,
      );
    },
  };
}
