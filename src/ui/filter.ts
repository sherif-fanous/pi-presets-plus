/**
 * Ranks loaded presets against the picker's free-text query and narrows
 * them to the selected scope.
 */
import type { LoadedPreset } from "../types.js";

/** Three-way scope toggle exposed by the picker header. */
export type ScopeFilter = "all" | "user" | "project";

/**
 * Hide presets outside the selected scope.
 *
 * `all` returns a shallow copy so callers can chain mutations safely.
 * Shadowed user presets still appear under `user` scope, where the user
 * can inspect and activate them directly.
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
 * An empty query preserves input order. Otherwise case-insensitive
 * substring matches come first and subsequence-only matches follow, with
 * stable order inside each group so the stored ordering still shows
 * through.
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
