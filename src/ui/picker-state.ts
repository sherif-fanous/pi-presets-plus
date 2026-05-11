/**
 * Pure state transitions for the preset picker.
 *
 * Owns focus, scope, selection, and scroll invariants for the picker; it
 * does NOT own terminal input decoding, rendering, activation side
 * effects, or pi-tui component wiring.
 */
import type { LoadedPreset } from "../types.js";
import { applyScopeFilter, rankPresets, type ScopeFilter } from "./filter.js";

export interface PickerState {
  readonly focusMode: PickerFocusMode;
  readonly scopeFilter: ScopeFilter;
  readonly selectedIndex: number;
  readonly scrollOffset: number;
}

export type PickerFocusMode = "list" | "filter";

const SCOPE_ORDER: readonly ScopeFilter[] = ["all", "user", "project"];

/**
 * Re-anchors scroll after the render layer measures how many cards fit.
 *
 * `packedCount` and `visibleCount` come from the just-rendered view. Empty
 * counts are treated as non-actionable render measurements, so selection is
 * left unchanged for the caller that owns empty-list normalization.
 */
export function clampScrollToFit(
  state: PickerState,
  packedCount: number,
  visibleCount: number,
): PickerState {
  if (packedCount === 0 || visibleCount === 0) return state;

  const lastPackedIndex = state.scrollOffset + packedCount - 1;

  if (
    state.selectedIndex >= state.scrollOffset &&
    state.selectedIndex <= lastPackedIndex
  ) {
    return state;
  }

  if (state.selectedIndex < state.scrollOffset) {
    return { ...state, scrollOffset: state.selectedIndex };
  }

  const maxOffset = Math.max(0, visibleCount - packedCount);
  const scrollOffset = Math.max(
    0,
    Math.min(maxOffset, state.selectedIndex - packedCount + 1),
  );

  return { ...state, scrollOffset };
}

export function cycleScope(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
  direction: -1 | 1,
  pageSize: number,
): PickerState {
  const currentIndex = SCOPE_ORDER.indexOf(state.scopeFilter);
  const nextIndex =
    (currentIndex + direction + SCOPE_ORDER.length) % SCOPE_ORDER.length;
  const nextScope = SCOPE_ORDER[nextIndex];

  if (!nextScope) return state;

  const previousSelection = selectedPresetKey(state, allPresets, query);

  return preserveSelectionOrFirst(
    { ...state, scopeFilter: nextScope },
    allPresets,
    query,
    previousSelection,
    pageSize,
  );
}

export function initialPickerState(): PickerState {
  return {
    focusMode: "list",
    scopeFilter: "all",
    scrollOffset: 0,
    selectedIndex: 0,
  };
}

export function moveSelection(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
  delta: number,
  pageSize: number,
  options: { wrap: boolean } = { wrap: true },
): PickerState {
  const visibleCount = visiblePresets(state, allPresets, query).length;

  if (visibleCount === 0) return state;

  const nextIndex = state.selectedIndex + delta;
  const selectedIndex = options.wrap
    ? ((nextIndex % visibleCount) + visibleCount) % visibleCount
    : Math.max(0, Math.min(nextIndex, visibleCount - 1));

  return ensureSelectionVisible({ ...state, selectedIndex }, pageSize);
}

export function preserveSelectionOrFirst(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
  previousSelection: string | undefined,
  pageSize: number,
): PickerState {
  const visible = visiblePresets(state, allPresets, query);

  if (visible.length === 0) {
    return { ...state, scrollOffset: 0, selectedIndex: 0 };
  }

  const nextIndex = previousSelection
    ? visible.findIndex((preset) => presetKey(preset) === previousSelection)
    : -1;
  const selectedIndex = nextIndex >= 0 ? nextIndex : 0;

  return ensureSelectionVisible({ ...state, selectedIndex }, pageSize);
}

export function selectedPreset(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
): LoadedPreset | undefined {
  return visiblePresets(state, allPresets, query)[state.selectedIndex];
}

export function selectedPresetKey(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
): string | undefined {
  const preset = selectedPreset(state, allPresets, query);

  return preset ? presetKey(preset) : undefined;
}

export function setFocusMode(
  state: PickerState,
  focusMode: PickerFocusMode,
): PickerState {
  return { ...state, focusMode };
}

export function visiblePresets(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
): readonly LoadedPreset[] {
  return rankPresets(applyScopeFilter(allPresets, state.scopeFilter), query);
}

function ensureSelectionVisible(
  state: PickerState,
  pageSize: number,
): PickerState {
  let scrollOffset = state.scrollOffset;

  if (state.selectedIndex < scrollOffset) {
    scrollOffset = state.selectedIndex;
  }

  const lastVisibleIndex = scrollOffset + pageSize - 1;

  if (state.selectedIndex > lastVisibleIndex) {
    scrollOffset = state.selectedIndex - pageSize + 1;
  }

  return { ...state, scrollOffset };
}

function presetKey(loadedPreset: LoadedPreset): string {
  return `${loadedPreset.scope}:${loadedPreset.name}`;
}
