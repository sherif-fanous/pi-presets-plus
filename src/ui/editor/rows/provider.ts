/**
 * "Provider" row factory.
 *
 * Owns provider cycling (with side-effects on model selection and
 * thinking level), help payload, and render. It does NOT own the model
 * registry or auth checks; those live on the host.
 */
import {
  renderValueRow,
  withFieldDiagnostic,
  wrapIndex,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

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

      const nextModel = host.modelsForProvider(nextProvider)[0];

      host.setState({
        ...state,
        model: nextModel?.id ?? "",
        provider: nextProvider,
      });
      host.clearFieldDiagnosticsFor("provider");
      host.snapThinkingIfInvalid();
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
