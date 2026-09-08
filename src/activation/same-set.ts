/**
 * Compares string arrays as unordered sets for the activation modules that
 * match tool lists.
 */

/**
 * Compare two string arrays as unordered sets.
 *
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
