/**
 * "Name" row factory.
 *
 * Owns the name text-input behavior, help payload, and render. It does
 * NOT own validation, persistence, or the focus chain.
 */
import { renderTextInputRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";

export function makeNameRow(host: EditorRowHost): EditorRow {
  return {
    id: "name",
    help: {
      body: [
        "Give your preset a short, memorable name.",
        "Names need to be unique within their scope, so two user-scope presets can't share a name.",
      ],
      editAddendum: [
        "If you rename this preset, its file is renamed automatically too.",
      ],
      title: "Name",
    },
    handleInput(input) {
      host.nameInput.handleInput(input);
      host.setState({ ...host.getState(), name: host.nameInput.getValue() });
      host.clearFieldDiagnosticsFor("name");
    },
    renderLines(width) {
      return renderTextInputRow(
        host,
        "Name",
        "name",
        host.nameInput,
        host.getState().name,
        width,
      );
    },
  };
}
