/**
 * "Buttons" (Save / Cancel / Test) row factory.
 *
 * Owns the button-action cursor (Save → Cancel → Test cycling), help
 * payload, and render. Activation itself is delegated back to the
 * host so the same code path handles Ctrl+S / Ctrl+T shortcuts and
 * Enter on a focused button.
 *
 * `buttonAction` is private mutable state in this factory's closure
 * \u2014 only this row needs to know which button is highlighted.
 */
import type { ButtonAction } from "../../editor-types.js";
import { CANCEL_LABEL, SAVE_LABEL, TEST_LABEL } from "../../labels.js";
import { renderChoiceRow, wrapIndex } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

const ALL_BUTTONS: readonly ButtonAction[] = ["save", "cancel", "test"];

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
        "Test applies this preset to the current session without saving it \u2014 useful for trying things out.",
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
