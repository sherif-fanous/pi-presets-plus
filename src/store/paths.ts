/**
 * Path resolution for preset storage files.
 *
 * Owns resolving the absolute on-disk location of each scope's presets
 * file (global under the agent dir, project under `<cwd>/.pi/`); it does
 * NOT perform any I/O.
 */
import { join } from "node:path";

import { getAgentDir } from "@mariozechner/pi-coding-agent";

/** File name for the preset list within `PRESETS_PLUS_SUBDIR`. */
const PRESETS_FILE_NAME = "presets.json";
/** Subdirectory under both scopes that contains preset-related files. */
const PRESETS_PLUS_SUBDIR = "presets-plus";
/** Project-scope parent directory under the project root. */
const PROJECT_PI_DIR = ".pi";

/**
 * Absolute path to the global / user-scope preset file.
 *
 * Uses pi's `getAgentDir()` by default (typically `~/.pi/agent`); pass an
 * override only from tests that want to point at a tmp dir without
 * patching environment variables.
 */
export function getGlobalPresetsPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}

/**
 * Absolute path to the project-scope preset file for the given working dir.
 *
 * Mirrors pi's convention of placing project-local config under `<cwd>/.pi/`.
 * The caller is expected to pass `ctx.cwd` from the extension context.
 */
export function getProjectPresetsPath(cwd: string): string {
  return join(cwd, PROJECT_PI_DIR, PRESETS_PLUS_SUBDIR, PRESETS_FILE_NAME);
}
