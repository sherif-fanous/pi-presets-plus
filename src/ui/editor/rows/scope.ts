/**
 * "Scope" row factory.
 *
 * Owns the user/project toggle behavior, help payload (including the
 * edit-mode addendum about cross-scope moves), and render.
 */
import { renderChoiceRow, withFieldDiagnostic } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

export function makeScopeRow(host: EditorRowHost): EditorRow {
  return {
    id: "scope",
    help: {
      body: [
        "User presets are available in every project on your machine. Project presets stay with this project, so you can share them with collaborators.",
      ],
      editAddendum: [
        "If you switch scope on an existing preset, its file moves to the new location.",
      ],
      title: "Scope",
    },
    handleInput(input) {
      if (
        matchesKey(input, Key.left) ||
        matchesKey(input, Key.right) ||
        input === " "
      ) {
        const state = host.getState();

        host.setState({
          ...state,
          scope: state.scope === "user" ? "project" : "user",
        });
        host.clearFieldDiagnosticsFor("scope");
      }
    },
    renderLines() {
      return withFieldDiagnostic(
        host,
        "scope",
        renderChoiceRow(
          host.theme,
          "Scope",
          ["user", "project"],
          host.getState().scope,
          host.currentRow() === "scope",
        ),
      );
    },
  };
}
