/**
 * "Model" row factory.
 *
 * Owns model cycling within the current provider, help payload, and
 * render (with availability hinting). It does NOT own auth resolution
 * or provider switching; those live on the host.
 */
import { MODEL_LABEL } from "../../labels.js";
import {
  renderValueRow,
  withFieldDiagnostic,
  wrapIndex,
} from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

export function makeModelRow(host: EditorRowHost): EditorRow {
  return {
    id: "model",
    help: {
      body: [
        "Pick which model Pi should use whenever this preset is active.",
        "Models marked (no key) don't have an API key set up yet, but you can still pick them \u2014 handy if you need to repair a preset whose key was removed.",
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

      host.setState({ ...state, model: next.id });
      host.clearFieldDiagnosticsFor("model");
      host.snapThinkingIfInvalid();
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

/**
 * Render the right-hand value with an availability hint appended for
 * unavailable entries. Mirrors the picker card's `unavailable` status
 * row in intent but stays inline to keep the row compact.
 */
function renderModelValue(host: EditorRowHost): string {
  const state = host.getState();

  if (state.model.length === 0) return "none";

  const item = host.models.find(
    (candidate) =>
      candidate.provider === state.provider && candidate.id === state.model,
  );

  if (!item) {
    // Model id didn't resolve at all (e.g. the preset references a
    // provider not present in the registry). Mark it so the user isn't
    // left staring at a seemingly-fine value.
    return `${state.model} ${host.theme.fg("dim", "(unknown)")}`;
  }

  return item.available
    ? state.model
    : `${state.model} ${host.theme.fg("dim", "(no key)")}`;
}
