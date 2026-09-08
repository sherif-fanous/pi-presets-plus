/**
 * Decides whether two `(provider, id)` pairs name the same model, for the
 * clear, drift, and status comparisons.
 */

/** Reference shape of a Pi model identity used by activation snapshots. */
export interface ModelIdentity {
  readonly provider: string;
  readonly id: string;
}

/**
 * Compare two model identities.
 *
 * Two absent models compare equal, and an absent model never equals a
 * present one.
 */
export function sameModel(
  left: ModelIdentity | null,
  right: ModelIdentity | null,
): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}
