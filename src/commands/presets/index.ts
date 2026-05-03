/**
 * Public entry points for the `/presets` command.
 *
 * Owns the barrel that the extension entry point imports from; it does
 * NOT own subcommand routing or implementation details.
 */

export { getArgumentCompletions, handlePresetsCommand } from "./router.js";
export { surfaceWarnings } from "./notify.js";
