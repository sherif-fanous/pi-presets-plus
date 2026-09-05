/**
 * Unexpected UI action error formatting shared by editor and picker flows.
 *
 * Owns conversion of thrown values into one user-facing sentence; it does
 * NOT report errors or decide where the UI displays them.
 */

/** Format an unexpected action failure with stable terminal punctuation. */
export function formatActionError(error: unknown): string {
  const detail = describeThrownValue(error);
  const punctuatedDetail = /[.!?]$/u.test(detail) ? detail : `${detail}.`;

  return `Pi Presets Plus could not complete the action. ${punctuatedDetail}`;
}

function describeThrownValue(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  try {
    const detail = String(error).trim();

    return detail.length > 0 ? detail : "Unknown error.";
  } catch {
    return "Unknown error.";
  }
}
