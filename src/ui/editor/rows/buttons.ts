/**
 * The editor's action row, which moves the highlight across Save, Cancel,
 * and Test and asks the host to run the highlighted action.
 */
import type { ButtonAction } from "../../editor-types.js";
import { CANCEL_LABEL, SAVE_LABEL, TEST_LABEL } from "../../labels.js";
import { renderChoiceRow, wrapIndex } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

/** Buttons in the order the row cycles through them. */
const ALL_BUTTONS: readonly ButtonAction[] = ["save", "cancel", "test"];

/** Build the action row, dropping Test when the host cannot run it. */
export function makeButtonsRow(host: EditorRowHost): EditorRow {
  const buttonOrder: readonly ButtonAction[] = host.canTest
    ? ALL_BUTTONS
    : ALL_BUTTONS.filter((button) => button !== "test");
  let buttonAction: ButtonAction = "save";

  function moveButton(direction: -1 | 1): void {
    const currentIndex = buttonOrder.indexOf(buttonAction);
    const next =
      buttonOrder[wrapIndex(currentIndex, buttonOrder.length, direction)];

    if (next) buttonAction = next;
  }

  return {
    id: "buttons",
    help: {
      body: [
        "Save writes this preset to disk after checking the values you entered.",
        "Cancel closes the editor and discards any changes you made.",
        "Test applies this preset to the current session without saving it, so you can try it first.",
      ],
      title: "Actions",
    },
    handleInput(input) {
      if (matchesKey(input, Key.left)) {
        moveButton(-1);
      } else if (matchesKey(input, Key.right)) {
        moveButton(1);
      } else if (matchesKey(input, Key.enter) || input === " ") {
        host.activateButton(buttonAction);
      }
    },
    renderLines() {
      return [
        renderChoiceRow(
          host.theme,
          "Actions",
          buttonOrder.map(formatButton),
          formatButton(buttonAction),
          host.currentRow() === "buttons",
        ),
      ];
    },
  };
}

/** Map a button action to the label shown for it. */
function formatButton(action: ButtonAction): string {
  switch (action) {
    case "cancel":
      return CANCEL_LABEL;
    case "save":
      return SAVE_LABEL;
    case "test":
      return TEST_LABEL;
  }
}
