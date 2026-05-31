/**
 * "Thinking" row factory + shared pure helpers.
 *
 * Owns thinking-level cycling (gated by the current model's valid set),
 * help payload, and render. Re-exports two pure helpers that the editor
 * also consumes (`snapThinkingSelection` for model/provider changes and
 * `renderThinkingRowsForState` for headless render coverage in tests).
 */
import { validThinkingLevels } from "../../../activation/thinking.js";
import type { ThinkingLevel } from "../../../types.js";
import type { EditorFormState } from "../../editor-types.js";
import { THINKING_LABEL } from "../../labels.js";
import { renderValueRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ThinkingLevel[];

export function makeThinkingRow(host: EditorRowHost): EditorRow {
  return {
    id: "thinking",
    help: {
      body: [
        "Thinking is how much extra reasoning effort Pi asks the model to spend. Higher levels can produce better answers but take longer and cost more.",
        "Off means no extra reasoning. Some models support fewer levels than others.",
      ],
      title: "Thinking",
    },
    handleInput(input) {
      if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

      const state = host.getState();
      const valid = validThinkingLevels(host.currentModel());
      const selectable = THINKING_LEVELS.filter((level) =>
        valid.includes(level),
      );
      const currentIndex = selectable.indexOf(state.thinkingLevel);
      const direction = matchesKey(input, Key.right) ? 1 : -1;
      const length = selectable.length;
      const wrappedIndex =
        length <= 0
          ? 0
          : (((currentIndex + direction) % length) + length) % length;
      const next = selectable[wrappedIndex];

      if (next) host.setState({ ...state, thinkingLevel: next });
    },
    renderLines() {
      const lines = renderThinkingRowsForState(
        host.theme,
        host.getState(),
        host.currentModel(),
        host.currentRow() === "thinking",
      );
      const diagnostic = host.getFieldDiagnostic("thinking");

      if (!diagnostic) return lines;

      const color = diagnostic.severity === "warning" ? "warning" : "error";

      return [...lines, host.theme.fg(color, `    ${diagnostic.message}`)];
    },
  };
}

/**
 * Render the thinking row body for `state` against `model`.
 *
 * Exported so tests can exercise the dimmed-level + "not supported"
 * legend without instantiating the interactive editor; the row's
 * `renderLines` delegates here.
 */
export function renderThinkingRowsForState(
  theme: Pick<Theme, "fg">,
  state: EditorFormState,
  model: Model<Api> | undefined,
  focused: boolean,
): string[] {
  const valid = validThinkingLevels(model);
  // Disabled options are conveyed by dim color alone (no " disabled"
  // suffix). The disabled-state legend below the row explains the
  // convention so screen-reader users still get a hint.
  const options = THINKING_LEVELS.map((level) => {
    const label = level;
    const rendered = valid.includes(level) ? label : theme.fg("dim", label);

    return state.thinkingLevel === level ? `● ${rendered}` : `○ ${rendered}`;
  });
  const lines = [
    renderValueRow(theme, THINKING_LABEL, options.join("  "), focused),
  ];

  if (valid.length < THINKING_LEVELS.length) {
    // Undefined models return the full set of valid levels, so this
    // dimmed branch can only fire when the model is defined; the
    // reasoning flag is therefore the complete branch condition.
    const message =
      model?.reasoning === false
        ? "This model does not support thinking."
        : "Dimmed levels are unavailable for this model.";

    lines.push(theme.fg("dim", `    ${message}`));
  }

  return lines;
}

/**
 * Pure helper: consume the returned form state directly after a
 * user-driven model/provider change. If the selected level is still
 * valid for the new model, return the same state object as the
 * explicit no-op signal; otherwise snap the selection to `"off"`.
 */
export function snapThinkingSelection(
  state: EditorFormState,
  model: Model<Api> | undefined,
): EditorFormState {
  if (validThinkingLevels(model).includes(state.thinkingLevel)) {
    return state;
  }

  return { ...state, thinkingLevel: "off" };
}
