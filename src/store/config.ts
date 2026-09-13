/**
 * Loads the optional user-global extension configuration and its inactive
 * footer preference.
 */
import { readFile } from "node:fs/promises";

import { getGlobalConfigPath } from "./paths.js";

/** Effective configuration and warnings produced while reading it. */
export interface ConfigLoadResult extends ExtensionConfig {
  readonly warnings: string[];
}

/** Effective extension preferences loaded from disk. */
export interface ExtensionConfig {
  readonly showInactiveStatus: boolean;
}

const DEFAULT_CONFIG: ExtensionConfig = { showInactiveStatus: true };

/** Read the user-global extension configuration, failing open on errors. */
export async function loadConfig(agentDir?: string): Promise<ConfigLoadResult> {
  const path = getGlobalConfigPath(agentDir);
  let rawData: string;

  try {
    rawData = await readFile(path, "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) return { ...DEFAULT_CONFIG, warnings: [] };

    return invalidConfig(
      `The extension could not read config file ${path}: ${describeError(error)}.`,
    );
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawData);
  } catch (error) {
    return invalidConfig(
      `The config file ${path} contains invalid JSON: ${describeError(error)}.`,
    );
  }

  if (!isRecord(parsedData)) {
    return invalidConfig(
      `The config file ${path} top-level must be an object with a "version" field.`,
    );
  }

  if (parsedData.version !== 1) {
    return invalidConfig(
      `The config file ${path} uses unsupported version ${JSON.stringify(parsedData.version)}; expected 1. The extension ignored the file and used defaults.`,
    );
  }

  if (
    parsedData.showInactiveStatus !== undefined &&
    typeof parsedData.showInactiveStatus !== "boolean"
  ) {
    return invalidConfig(
      `The config file ${path} has an invalid "showInactiveStatus" value; expected a boolean. The extension used the default.`,
    );
  }

  return {
    showInactiveStatus:
      typeof parsedData.showInactiveStatus === "boolean"
        ? parsedData.showInactiveStatus
        : true,
    warnings: [],
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function invalidConfig(warning: string): ConfigLoadResult {
  return { ...DEFAULT_CONFIG, warnings: [warning] };
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
