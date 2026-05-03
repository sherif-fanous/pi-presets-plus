/**
 * Pure preset filtering helpers for the picker UI.
 *
 * Owns ranking and scope filtering of loaded presets for OpenSpec change
 * `add-preset-picker`; it does NOT own rendering, picker state, or
 * activation. Future fuzzy scoring can replace the subsequence fallback
 * here while preserving the exported `rankPresets` contract and its stable
 * within-group ordering.
 */
import type { LoadedPreset } from "../types.js";

/** Three-way scope toggle exposed by the picker header. */
export type ScopeFilter = "all" | "user" | "project";

/**
 * Hide presets outside the selected scope.
 *
 * `all` returns a shallow copy so callers can chain mutations safely;
 * `user`/`project` apply a simple equality filter. Shadowed globals are
 * returned in `user` scope because their project shadow is hidden — the
 * user is still allowed to inspect/activate the global directly.
 */
export function applyScopeFilter(
  presets: readonly LoadedPreset[],
  scopeFilter: ScopeFilter,
): LoadedPreset[] {
  switch (scopeFilter) {
    case "all":
      return [...presets];
    case "user":
      return presets.filter((preset) => preset.scope === "user");
    case "project":
      return presets.filter((preset) => preset.scope === "project");
  }
}

/**
 * Rank presets by a free-text query.
 *
 * Empty queries preserve input order. Non-empty queries return literal
 * case-insensitive substring matches first, followed by subsequence-only
 * matches. Ordering within each group is stable so storage/user ordering
 * remains meaningful after filtering.
 */
export function rankPresets(
  items: readonly LoadedPreset[],
  query: string,
): LoadedPreset[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) return [...items];

  const literalMatches: LoadedPreset[] = [];
  const fuzzyMatches: LoadedPreset[] = [];

  for (const item of items) {
    const haystack =
      `${item.name} ${item.provider}/${item.model}`.toLowerCase();

    if (haystack.includes(normalizedQuery)) {
      literalMatches.push(item);
    } else if (subsequenceMatch(haystack, normalizedQuery)) {
      fuzzyMatches.push(item);
    }
  }

  return [...literalMatches, ...fuzzyMatches];
}

function subsequenceMatch(haystack: string, query: string): boolean {
  let queryIndex = 0;

  for (
    let haystackIndex = 0;
    haystackIndex < haystack.length && queryIndex < query.length;
    haystackIndex++
  ) {
    if (haystack[haystackIndex] === query[queryIndex]) queryIndex++;
  }

  return queryIndex === query.length;
}
