/**
 * Public entry points for the `/presets` command.
 *
 * `src/index.ts` imports only from this barrel so the router structure
 * stays an internal detail.
 */

export { getArgumentCompletions, handlePresetsCommand } from "./router.js";
export { surfaceWarnings } from "./notify.js";
