/**
 * Set-equality helpers shared across activation modules.
 *
 * Owns the tiny comparison primitives used by clear-decision and
 * state-match logic; it does NOT carry any activation state or side
 * effects. Lives here (rather than inline in each caller) because the
 * `sameSet` literal was copy-pasted verbatim across two modules — one
 * source of truth is easier to reason about when the comparison rules
 * change (e.g. if we ever need to ignore case or treat `undefined` as
 * empty).
 */

/**
 * Compare two string arrays as unordered sets.
 *
 * Returns `true` when both sides contain the same distinct values.
 * Order and duplicate entries do not affect the result.
 */
export function sameSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}
