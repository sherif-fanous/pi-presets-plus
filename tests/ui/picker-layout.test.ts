/**
 * Tests for pure variable-height picker viewport layout.
 *
 * These cover line budgeting, card packing, and selection visibility without
 * constructing Pi presets or terminal components.
 */
import {
  layoutPickerViewport,
  pickerFallbackPageSize,
  pickerListLineBudget,
} from "../../src/ui/picker-layout.js";
import { describe, expect, it, vi } from "vitest";

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
