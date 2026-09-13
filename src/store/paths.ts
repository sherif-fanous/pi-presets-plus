/**
 * Resolves the consolidated configuration paths and legacy migration inputs for
 * both storage scopes.
 */
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** File name for the legacy user-global access policy. */
const POLICY_FILE_NAME = "policy.json";
/** File name for the user-global extension configuration. */
const CONFIG_FILE_NAME = "config.json";
/** File name for legacy preset lists within `PRESETS_PLUS_SUBDIR`. */
const PRESETS_FILE_NAME = "presets.json";
/** Subdirectory under both scopes that contains preset-related files. */
const PRESETS_PLUS_SUBDIR = "presets-plus";
/** Project-scope parent directory under the project root. */
const PROJECT_PI_DIR = ".pi";

/** Absolute path to the user-global version 2 configuration file. */
export function getGlobalConfigPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, CONFIG_FILE_NAME);
}

/** Absolute path to the user-global legacy policy file. */
export function getGlobalPolicyPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, POLICY_FILE_NAME);
}

/** Absolute path to the user-scope legacy preset file. */
export function getGlobalPresetsPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}

/** Absolute path to the project-scope version 2 configuration file. */
export function getProjectConfigPath(cwd: string): string {
  return join(cwd, PROJECT_PI_DIR, PRESETS_PLUS_SUBDIR, CONFIG_FILE_NAME);
}

/** Absolute path to the project-scope legacy preset file. */
export function getProjectPresetsPath(cwd: string): string {
  return join(cwd, PROJECT_PI_DIR, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}
