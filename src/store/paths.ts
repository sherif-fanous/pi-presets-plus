/**
 * Resolves the absolute on-disk location of the presets and policy files
 * for both the global scope (under the agent dir) and the project scope
 * (under `<cwd>/.pi/`).
 */
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** File name for the user-global access policy. */
const POLICY_FILE_NAME = "policy.json";
/** File name for the preset list within `PRESETS_PLUS_SUBDIR`. */
const PRESETS_FILE_NAME = "presets.json";
/** Subdirectory under both scopes that contains preset-related files. */
const PRESETS_PLUS_SUBDIR = "presets-plus";
/** Project-scope parent directory under the project root. */
const PROJECT_PI_DIR = ".pi";

/** Absolute path to the user-global preset access-policy file. */
export function getGlobalPolicyPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, POLICY_FILE_NAME);
}

/**
 * Absolute path to the user-scope preset file.
 *
 * Defaults to Pi's `getAgentDir()`, typically `~/.pi/agent`. Pass an
 * override from tests that point at a temporary directory instead of
 * patching environment variables.
 */
export function getGlobalPresetsPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}

/**
 * Absolute path to the project-scope preset file for a working directory.
 *
 * Follows Pi's convention of keeping project-local config under
 * `<cwd>/.pi/`. Callers pass `ctx.cwd` from the extension context.
 */
export function getProjectPresetsPath(cwd: string): string {
  return join(cwd, PROJECT_PI_DIR, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}
