/**
 * The editor's thinking row, which cycles through the levels the selected
 * model supports and renders the rest dimmed.
 */
import { validThinkingLevels } from "../../../activation/thinking.js";
import { THINKING_LEVELS } from "../../../types.js";
import type { EditorFormState } from "../../editor-types.js";
import { THINKING_LABEL } from "../../labels.js";
import { renderValueRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";

/** Build the thinking row. */
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
 * Render the thinking row for `state` against `model`, dimming the levels
 * that model does not support and adding a legend when any are dimmed.
 */
export function renderThinkingRowsForState(
  theme: Pick<Theme, "fg">,
  state: EditorFormState,
  model: Model<Api> | undefined,
  focused: boolean,
): string[] {
  const valid = validThinkingLevels(model);
  // Unsupported levels carry no suffix, only dim color, so the legend
  // below the row is what conveys their state without color.
  const options = THINKING_LEVELS.map((level) => {
    const label = level;
    const rendered = valid.includes(level) ? label : theme.fg("dim", label);

    return state.thinkingLevel === level ? `● ${rendered}` : `○ ${rendered}`;
  });
  const lines = [
    renderValueRow(theme, THINKING_LABEL, options.join("  "), focused),
  ];

  if (valid.length < THINKING_LEVELS.length) {
    // An undefined model reports every level as valid, so reaching here
    // means `model` is set and its reasoning flag decides the wording.
    const message =
      model?.reasoning === false
        ? "This model does not support thinking."
        : "Dimmed levels are unavailable for this model.";

    lines.push(theme.fg("dim", `    ${message}`));
  }

  return lines;
}
