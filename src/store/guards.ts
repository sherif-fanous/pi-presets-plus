/**
 * Type guards the store modules share for parsed JSON and file-system
 * errors.
 */

/** Whether a file-system error means the file does not exist. */
export function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

/** Whether a value is a plain object, excluding `null` and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
