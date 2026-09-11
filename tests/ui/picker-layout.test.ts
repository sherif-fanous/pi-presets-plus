/**
 * Covers the picker viewport layout: the line budget left for the list,
 * packing cards of mixed height into it, and keeping the selected card
 * visible as the viewport scrolls.
 */
import {
  layoutPickerViewport,
  pickerFallbackPageSize,
  pickerListLineBudget,
} from "../../src/ui/picker-layout.js";
import { describe, expect, it, vi } from "vitest";

/** Reads card heights by index, treating anything past the end as zero. */
function heights(values: readonly number[]): (index: number) => number {
  return (index) => values[index] ?? 0;
}

describe("picker layout", () => {
  it("reserves picker chrome and provides a usable tiny-terminal budget", () => {
    expect(pickerListLineBudget(86)).toBe(61);
    expect(pickerListLineBudget(1)).toBe(1);
    expect(pickerFallbackPageSize(1)).toBe(1);
  });

  it("packs mixed card heights with separators", () => {
    expect(layoutPickerViewport(5, 1, 0, 6, heights([2, 3, 1, 4, 2]))).toEqual({
      endIndex: 2,
      pageSize: 2,
      scrollOffset: 0,
      startIndex: 0,
    });
  });

  it("re-anchors below the viewport and returns the measured page size", () => {
    expect(layoutPickerViewport(5, 4, 0, 5, heights([2, 2, 2, 2, 2]))).toEqual({
      endIndex: 5,
      pageSize: 2,
      scrollOffset: 3,
      startIndex: 3,
    });
  });

  it("anchors selection above the viewport at the first visible card", () => {
    expect(layoutPickerViewport(5, 1, 3, 5, heights([2, 2, 2, 2, 2]))).toEqual({
      endIndex: 3,
      pageSize: 2,
      scrollOffset: 1,
      startIndex: 1,
    });
  });

  it("allows the first card to exceed the line budget", () => {
    expect(layoutPickerViewport(3, 0, 0, 1, heights([5, 1, 1]))).toEqual({
      endIndex: 1,
      pageSize: 1,
      scrollOffset: 0,
      startIndex: 0,
    });
  });

  it("keeps selection visible when the line budget is zero", () => {
    expect(layoutPickerViewport(3, 2, 0, 0, heights([1, 1, 1]))).toEqual({
      endIndex: 3,
      pageSize: 1,
      scrollOffset: 2,
      startIndex: 2,
    });
  });

  it("balances the selected card near the vertical midpoint on open", () => {
    expect(
      layoutPickerViewport(20, 10, 0, 9, heights(Array(20).fill(1)), true),
    ).toEqual({
      endIndex: 13,
      pageSize: 5,
      scrollOffset: 8,
      startIndex: 8,
    });
  });

  it("balances by rendered lines rather than by card count", () => {
    // The tall card at index 3 fills the space a count-halving anchor would
    // have spent on three short cards.
    const tallAbove = heights([1, 1, 1, 9, 1, 1, 1, 1, 1, 1]);
    const layout = layoutPickerViewport(10, 5, 0, 11, tallAbove, true);

    expect(layout).toEqual({
      endIndex: 10,
      pageSize: 6,
      scrollOffset: 4,
      startIndex: 4,
    });
    expect(layout.startIndex).not.toBe(5 - Math.floor(layout.pageSize / 2));
  });

  it("keeps a later card visible instead of centering exactly", () => {
    expect(
      layoutPickerViewport(20, 10, 0, 9, heights(Array(20).fill(3)), true),
    ).toEqual({
      endIndex: 12,
      pageSize: 2,
      scrollOffset: 10,
      startIndex: 10,
    });
  });

  it("clamps a balanced opening viewport at the start of the list", () => {
    expect(
      layoutPickerViewport(20, 1, 0, 9, heights(Array(20).fill(1)), true),
    ).toEqual({
      endIndex: 5,
      pageSize: 5,
      scrollOffset: 0,
      startIndex: 0,
    });
  });

  it("clamps a balanced opening viewport at the end of the list", () => {
    expect(
      layoutPickerViewport(20, 18, 0, 9, heights(Array(20).fill(1)), true),
    ).toEqual({
      endIndex: 20,
      pageSize: 4,
      scrollOffset: 16,
      startIndex: 16,
    });
  });

  it("renders an oversized selected card alone when balancing on open", () => {
    expect(layoutPickerViewport(3, 1, 0, 5, heights([1, 10, 1]), true)).toEqual(
      {
        endIndex: 2,
        pageSize: 1,
        scrollOffset: 1,
        startIndex: 1,
      },
    );
  });

  it("returns an empty viewport without reading card heights", () => {
    const cardHeightAt = vi.fn(() => 1);

    expect(layoutPickerViewport(0, 0, 0, 10, cardHeightAt)).toEqual({
      endIndex: 0,
      pageSize: 0,
      scrollOffset: 0,
      startIndex: 0,
    });
    expect(cardHeightAt).not.toHaveBeenCalled();
  });
});
