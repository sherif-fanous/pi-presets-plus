/**
 * The editor's provider row, which cycles through the known providers and
 * moves the model and thinking selections along with each change.
 */
import { selectProvider } from "../draft.js";
import {
  renderValueRow,
  withFieldDiagnostic,
  wrapIndex,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

/** Build the provider row. */
export function makeProviderRow(host: EditorRowHost): EditorRow {
  return {
    id: "provider",
    help: {
      body: [
        "The provider is the service that hosts the model, like OpenAI or Anthropic.",
        "Only providers Pi knows about show up here. Switching providers refreshes the model list.",
      ],
      title: "Provider",
    },
    handleInput(input) {
      if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

      const providers = host.providers();
      const state = host.getState();
      const currentIndex = providers.indexOf(state.provider);
      const direction = matchesKey(input, Key.right) ? 1 : -1;
      const nextProvider =
        providers[wrapIndex(currentIndex, providers.length, direction)];

      if (!nextProvider) return;

      host.setState(selectProvider(state, nextProvider, host.models));
      host.clearFieldDiagnosticsFor("provider");
    },
    renderLines() {
      return withFieldDiagnostic(
        host,
        "provider",
        renderValueRow(
          host.theme,
          "Provider",
          host.getState().provider || "none",
          host.currentRow() === "provider",
        ),
      );
    },
  };
}
