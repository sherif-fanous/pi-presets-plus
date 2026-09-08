/**
 * The editor's model row, which cycles through the models of the selected
 * provider and marks the ones that have no API key.
 */
import { MODEL_LABEL } from "../../labels.js";
import { selectModel } from "../draft.js";
import {
  renderValueRow,
  withFieldDiagnostic,
  wrapIndex,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

/** Build the model row. */
export function makeModelRow(host: EditorRowHost): EditorRow {
  return {
    id: "model",
    help: {
      body: [
        "Pick which model Pi should use whenever this preset is active.",
        "Models marked (no key) don't have an API key set up yet. You can still pick one if you need to repair a preset whose key was removed.",
      ],
      title: "Model",
    },
    handleInput(input) {
      if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

      const state = host.getState();
      const providerModels = host.modelsForProvider(state.provider);
      const currentIndex = providerModels.findIndex(
        (item) => item.id === state.model,
      );
      const direction = matchesKey(input, Key.right) ? 1 : -1;
      const nextIndex = wrapIndex(
        currentIndex,
        providerModels.length,
        direction,
      );
      const next = providerModels[nextIndex];

      if (!next) return;

      host.setState(selectModel(state, next));
      host.clearFieldDiagnosticsFor("model");
    },
    renderLines() {
      return withFieldDiagnostic(
        host,
        "model",
        renderValueRow(
          host.theme,
          MODEL_LABEL,
          renderModelValue(host),
          host.currentRow() === "model",
        ),
      );
    },
  };
}

/** Render the selected model, hinting when it has no key or no match. */
function renderModelValue(host: EditorRowHost): string {
  const state = host.getState();

  if (state.model.length === 0) return "none";

  const item = host.models.find(
    (candidate) =>
      candidate.provider === state.provider && candidate.id === state.model,
  );

  if (!item) {
    return `${state.model} ${host.theme.fg("dim", "(unknown)")}`;
  }

  return item.available
    ? state.model
    : `${state.model} ${host.theme.fg("dim", "(no key)")}`;
}
