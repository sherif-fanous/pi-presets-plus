/**
 * Pure viewport layout for variable-height picker cards.
 *
 * Owns terminal-height budgeting, card packing, and scroll correction; it
 * does NOT own preset data, card rendering, themes, or picker state changes.
 */

/** Average card height used until the picker has measured a rendered page. */
const FALLBACK_AVERAGE_CARD_LINES = 7;
/** Lines used by borders, status, filter, rules, and footer. */
const PICKER_CHROME_LINES = 7;
const MINIMUM_PAGE_SIZE = 1;
const SEPARATOR_LINES = 1;

export type PickerViewportLayout = {
  readonly endIndex: number;
  readonly pageSize: number;
  readonly scrollOffset: number;
  readonly startIndex: number;
};

/**
 * Pack a variable-height viewport and re-anchor it when selection is outside.
 *
 * Card heights are read lazily because rendering every preset merely to find
 * the visible range would make each picker render scale with the full list.
 */
export function layoutPickerViewport(
  itemCount: number,
  selectedIndex: number,
  scrollOffset: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): PickerViewportLayout {
  if (itemCount === 0) {
    return { endIndex: 0, pageSize: 0, scrollOffset: 0, startIndex: 0 };
  }

  const lastIndex = itemCount - 1;
  const selection = Math.max(0, Math.min(selectedIndex, lastIndex));
  let startIndex = Math.max(0, Math.min(scrollOffset, lastIndex));
  let endIndex = packEndIndex(itemCount, startIndex, lineBudget, cardHeightAt);

  if (selection < startIndex) {
    startIndex = selection;
    endIndex = packEndIndex(itemCount, startIndex, lineBudget, cardHeightAt);
  } else if (selection >= endIndex) {
    startIndex = scrollOffsetForSelection(selection, lineBudget, cardHeightAt);
    endIndex = packEndIndex(itemCount, startIndex, lineBudget, cardHeightAt);
  }

  return {
    endIndex,
    pageSize: endIndex - startIndex,
    scrollOffset: startIndex,
    startIndex,
  };
}

/** Estimate page size before the first variable-height layout pass. */
export function pickerFallbackPageSize(terminalRows: number): number {
  return Math.max(
    MINIMUM_PAGE_SIZE,
    Math.floor(
      pickerListLineBudget(terminalRows) / FALLBACK_AVERAGE_CARD_LINES,
    ),
  );
}

/** Return the card-line budget inside the picker's 80% height overlay. */
export function pickerListLineBudget(terminalRows: number): number {
  return Math.max(
    MINIMUM_PAGE_SIZE,
    Math.floor(terminalRows * 0.8) - PICKER_CHROME_LINES,
  );
}

function cardLines(
  index: number,
  cardHeightAt: (index: number) => number,
): number {
  return Math.max(0, cardHeightAt(index));
}

function packEndIndex(
  itemCount: number,
  startIndex: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): number {
  let endIndex = startIndex;
  let usedLines = 0;

  while (endIndex < itemCount) {
    const separatorLines = endIndex > startIndex ? SEPARATOR_LINES : 0;
    const nextLines = separatorLines + cardLines(endIndex, cardHeightAt);

    if (endIndex > startIndex && usedLines + nextLines > lineBudget) break;

    usedLines += nextLines;
    endIndex++;
  }

  return endIndex;
}

function scrollOffsetForSelection(
  selectedIndex: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): number {
  let scrollOffset = selectedIndex;
  let usedLines = cardLines(selectedIndex, cardHeightAt);

  while (scrollOffset > 0) {
    const previousIndex = scrollOffset - 1;
    const previousLines =
      SEPARATOR_LINES + cardLines(previousIndex, cardHeightAt);

    if (usedLines + previousLines > lineBudget) break;

    usedLines += previousLines;
    scrollOffset = previousIndex;
  }

  return scrollOffset;
}
