/**
 * Budgets terminal height for variable-height picker cards, packing the
 * visible range and correcting the scroll offset around the selection.
 */

/** Average card height used until the picker has measured a rendered page. */
const FALLBACK_AVERAGE_CARD_LINES = 7;
/** Lines used by borders, status, filter, rules, and footer. */
const PICKER_CHROME_LINES = 7;
/** Smallest page the picker reports, so navigation always has a step. */
const MINIMUM_PAGE_SIZE = 1;
/** Blank line drawn between two cards. */
const SEPARATOR_LINES = 1;

/** Logical card range, with indices wrapping modulo the item count. */
export type PickerViewportLayout = {
  readonly endIndex: number;
  readonly pageSize: number;
  readonly scrollOffset: number;
  readonly startIndex: number;
};

/**
 * Pack a variable-height viewport and re-anchor it when selection is outside.
 *
 * Card heights are read lazily, because rendering every preset just to find
 * the visible range would make each picker render scale with the full list.
 * When `balanced` is set, the viewport instead places the selected card's
 * rendered midpoint as close to the middle of the budget as the list allows,
 * clamped to the list bounds, never wrapping, and always keeping one later
 * card visible when one fits.
 */
export function layoutPickerViewport(
  itemCount: number,
  selectedIndex: number,
  scrollOffset: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
  balanced = false,
): PickerViewportLayout {
  if (itemCount === 0) {
    return { endIndex: 0, pageSize: 0, scrollOffset: 0, startIndex: 0 };
  }

  const lastIndex = itemCount - 1;
  const selection = Math.max(0, Math.min(selectedIndex, lastIndex));
  const heightAt = (index: number): number =>
    cardHeightAt(((index % itemCount) + itemCount) % itemCount);

  if (balanced) {
    return balancedViewportForSelection(
      itemCount,
      selection,
      lineBudget,
      heightAt,
    );
  }

  const stopIndex = scrollOffset + itemCount;
  let startIndex = scrollOffset;
  let endIndex = packEndIndex(stopIndex, startIndex, lineBudget, heightAt);

  if (selection < startIndex) {
    startIndex = selection;
    endIndex = packEndIndex(
      startIndex + itemCount,
      startIndex,
      lineBudget,
      heightAt,
    );
  } else if (selection >= endIndex) {
    startIndex = scrollOffsetForSelection(
      selection,
      itemCount,
      lineBudget,
      heightAt,
    );

    endIndex = packEndIndex(
      startIndex + itemCount,
      startIndex,
      lineBudget,
      heightAt,
    );
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

/**
 * Choose the viewport whose selected-card midpoint sits closest to the
 * middle of the budget.
 *
 * The score falls and then rises as the start index walks back from the
 * selection, so the walk stops at the first candidate to reach the midpoint
 * instead of measuring every preceding card.
 */
function balancedViewportForSelection(
  itemCount: number,
  selectedIndex: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): PickerViewportLayout {
  const targetMidpoint = lineBudget / 2;
  const anchorEnd = packEndIndex(
    itemCount,
    selectedIndex,
    lineBudget,
    cardHeightAt,
  );
  const requireFollowingCard = anchorEnd > selectedIndex + 1;
  let midpoint = cardLines(selectedIndex, cardHeightAt) / 2;
  let bestScore = Math.abs(midpoint - targetMidpoint);
  let best: PickerViewportLayout = {
    endIndex: anchorEnd,
    pageSize: anchorEnd - selectedIndex,
    scrollOffset: selectedIndex,
    startIndex: selectedIndex,
  };

  for (
    let startIndex = selectedIndex - 1;
    startIndex >= 0 && midpoint < targetMidpoint;
    startIndex--
  ) {
    midpoint += SEPARATOR_LINES + cardLines(startIndex, cardHeightAt);

    const endIndex = packEndIndex(
      itemCount,
      startIndex,
      lineBudget,
      cardHeightAt,
    );
    const score = Math.abs(midpoint - targetMidpoint);

    if (endIndex <= selectedIndex) continue;
    if (requireFollowingCard && endIndex <= selectedIndex + 1) continue;
    if (score >= bestScore) continue;

    bestScore = score;
    best = {
      endIndex,
      pageSize: endIndex - startIndex,
      scrollOffset: startIndex,
      startIndex,
    };
  }

  return best;
}

function cardLines(
  index: number,
  cardHeightAt: (index: number) => number,
): number {
  return Math.max(0, cardHeightAt(index));
}

/** Pack cards from `startIndex` up to the exclusive `stopIndex`. */
function packEndIndex(
  stopIndex: number,
  startIndex: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): number {
  let endIndex = startIndex;
  let usedLines = 0;

  while (endIndex < stopIndex) {
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
  itemCount: number,
  lineBudget: number,
  cardHeightAt: (index: number) => number,
): number {
  let scrollOffset = selectedIndex;
  let usedLines = cardLines(selectedIndex, cardHeightAt);

  while (scrollOffset > selectedIndex - itemCount + 1) {
    const previousIndex = scrollOffset - 1;
    const previousLines =
      SEPARATOR_LINES + cardLines(previousIndex, cardHeightAt);

    if (usedLines + previousLines > lineBudget) break;

    usedLines += previousLines;
    scrollOffset = previousIndex;
  }

  return scrollOffset;
}
