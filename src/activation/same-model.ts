/**
 * Model-identity equality used across activation and status reporting.
 *
 * Owns the single definition of "are these two `(provider, id)` pairs the
 * same model?" Sits next to `sameSet` because both helpers answer the
 * same question for the canonical Pi state channels (model and tools)
 * that clear, drift, and status all compare against.
 *
 * Treats `null` on either side as a distinct value: two `null` models
 * compare equal (no model is the same as no model), and any non-null
 * model is unequal to `null`.
 */

/** Reference shape of a Pi model identity used by activation snapshots. */
export interface ModelIdentity {
  readonly provider: string;
  readonly id: string;
}

export function sameModel(
  left: ModelIdentity | null,
  right: ModelIdentity | null,
): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}
