/**
 * Applies the picker's state transitions, holding the focus, scope,
 * selection, and scroll invariants together.
 */
import type { LoadedPreset } from "../types.js";
import { applyScopeFilter, rankPresets, type ScopeFilter } from "./filter.js";

/** Focus, scope filter, selection, and scroll position of the picker. */
export interface PickerState {
  readonly focusMode: PickerFocusMode;
  readonly scopeFilter: ScopeFilter;
  readonly selectedIndex: number;
  readonly scrollOffset: number;
}

/** Which of the picker's two panes receives keystrokes. */
export type PickerFocusMode = "list" | "filter";

/** Order the left and right keys walk through the scope filters. */
const SCOPE_ORDER: readonly ScopeFilter[] = ["all", "user", "project"];

/** Step to the next scope filter, keeping the current preset selected. */
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

/** Build the picker state for a freshly opened picker. */
export function initialPickerState(): PickerState {
  return {
    focusMode: "list",
    scopeFilter: "all",
    scrollOffset: 0,
    selectedIndex: 0,
  };
}

/**
 * Stable identity key for a `LoadedPreset`, used to compare selections
 * across re-renders, refreshes, and reorders.
 */
export function loadedPresetKey(
  preset: Pick<LoadedPreset, "name" | "scope">,
): string {
  return `${preset.scope}:${preset.name}`;
}

/** Move the selection by `delta` and scroll it back into view. */
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

  const moved = ensureSelectionVisible(
    { ...state, selectedIndex: options.wrap ? nextIndex : selectedIndex },
    pageSize,
  );

  return {
    ...moved,
    selectedIndex,
    scrollOffset: moved.scrollOffset + selectedIndex - moved.selectedIndex,
  };
}

/**
 * Re-select `previousSelection` after the visible list changes, falling
 * back to the first row when that preset is no longer visible.
 */
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
    ? visible.findIndex(
        (preset) => loadedPresetKey(preset) === previousSelection,
      )
    : -1;
  const selectedIndex = nextIndex >= 0 ? nextIndex : 0;

  return ensureSelectionVisible(
    {
      ...state,
      selectedIndex,
      scrollOffset: Math.max(
        0,
        Math.min(state.scrollOffset, visible.length - 1),
      ),
    },
    pageSize,
  );
}

/** Return the currently selected preset, if the visible list has one. */
export function selectedPreset(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
): LoadedPreset | undefined {
  return visiblePresets(state, allPresets, query)[state.selectedIndex];
}

/** Return the identity key of the currently selected preset. */
export function selectedPresetKey(
  state: PickerState,
  allPresets: readonly LoadedPreset[],
  query: string,
): string | undefined {
  const preset = selectedPreset(state, allPresets, query);

  return preset ? loadedPresetKey(preset) : undefined;
}

/** Move keyboard focus between the list and the filter input. */
export function setFocusMode(
  state: PickerState,
  focusMode: PickerFocusMode,
): PickerState {
  return { ...state, focusMode };
}

/** Return the presets the picker shows for the current scope and query. */
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
