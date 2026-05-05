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
 * Returns `true` when both sides contain exactly the same set of
 * distinct values, ignoring order. Duplicate entries within either
 * array are tolerated because the length-first guard rejects any case
 * where duplicates would matter for set-equality purposes: if both
 * sides have the same length and every element of `left` appears in
 * `right`, the sets are equal.
 */
export function sameSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);

  return left.every((value) => rightSet.has(value));
}
