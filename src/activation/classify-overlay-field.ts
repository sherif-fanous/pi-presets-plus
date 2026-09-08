/**
 * Holds the rule that `/presets status` and `/presets clear` share when
 * they compare one Pi state channel against the pre-activation baseline
 * and the value the active preset wrote.
 */

/**
 * How a current Pi value relates to the active preset overlay.
 *
 * `already-baseline` matches the pre-activation value, so a clear leaves
 * the field alone. `matches-last-applied` matches what the preset wrote,
 * so a clear restores the baseline. `user-override` matches neither, so a
 * clear leaves the user's value in place.
 */
export type OverlayFieldClassification =
  | "already-baseline"
  | "matches-last-applied"
  | "user-override";

/** Classify `current` against the baseline and last-applied values. */
export function classifyOverlayField<T>(
  current: T,
  baseline: T,
  lastApplied: T,
  equals: (left: T, right: T) => boolean,
): OverlayFieldClassification {
  if (equals(current, baseline)) return "already-baseline";
  if (equals(current, lastApplied)) return "matches-last-applied";

  return "user-override";
}
