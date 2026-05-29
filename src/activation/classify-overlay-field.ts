/**
 * Three-way classification for a single Pi state channel under the active
 * overlay.
 *
 * Owns the shared decision rule used by `/presets status` and
 * `/presets clear` when they compare a current Pi value against the
 * baseline (pre-activation) and last-applied (preset-written) snapshots.
 * It does NOT own the per-channel vocabulary, restoration writes, or any
 * field-specific display: callers map the classification onto their own
 * presentation.
 *
 * Centralizing the comparison keeps the two surfaces in lockstep so a
 * future rule change (e.g. tolerating tools-set drift below a threshold)
 * lands in one place rather than two.
 */

/**
 * - `already-baseline`: the current value matches the pre-activation
 *   baseline. Clear is a no-op for this field; status reports nothing
 *   needs to change.
 * - `matches-last-applied`: the current value matches what the preset
 *   wrote at apply time. Clear will restore the baseline; status reports
 *   the field as managed by the active preset.
 * - `user-override`: the current value matches neither. Clear leaves it
 *   alone; status reports the user changed it after activation.
 */
export type OverlayFieldClassification =
  | "already-baseline"
  | "matches-last-applied"
  | "user-override";

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
