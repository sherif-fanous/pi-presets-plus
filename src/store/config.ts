/**
 * Loads and validates one consolidated version 2 configuration document.
 * Section warnings preserve fail-open reads while marking the document unsafe to rewrite.
 */
import { readFile } from "node:fs/promises";

import type {
  Preset,
  PresetScope,
  ScopeConfig,
  ScopeWarnings,
} from "../types.js";
import { parsePresetArray } from "./load.js";
import { getGlobalConfigPath, getProjectConfigPath } from "./paths.js";

/** File-system seam used by scope loading tests. */
export interface ConfigFs {
  readonly readFile: typeof readFile;
}

const defaultFs: ConfigFs = { readFile };

/** Load one scope's complete version 2 document and validated preset section. */
export async function loadScope(
  scope: PresetScope,
  cwd: string,
  agentDir?: string,
  fs: ConfigFs = defaultFs,
): Promise<ScopeConfig> {
  const path =
    scope === "user"
      ? getGlobalConfigPath(agentDir)
      : getProjectConfigPath(cwd);
  let rawData: string;

  try {
    rawData = await fs.readFile(path, "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        document: { version: 2 },
        presets: [],
        warnings: emptyWarnings(),
      };
    }

    return invalidScope(
      `The extension could not read config file ${path}: ${describeError(error)}.`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    return invalidScope(
      `The config file ${path} contains invalid JSON: ${describeError(error)}.`,
    );
  }

  if (!isRecord(parsed)) {
    return invalidScope(
      `The config file ${path} top-level must be an object with a "version" field.`,
    );
  }

  if (parsed.version !== 2) {
    return invalidScope(
      `The config file ${path} uses unsupported version ${JSON.stringify(parsed.version)}; expected 2. The extension ignored the file and used defaults.`,
    );
  }

  const document = parsed as ScopeConfig["document"];
  const warnings = emptyWarnings();
  let showInactiveStatus: boolean | undefined;

  if (document.showInactiveStatus !== undefined) {
    if (typeof document.showInactiveStatus !== "boolean") {
      warnings.settings.push(
        `The config file ${path} has an invalid "showInactiveStatus" value; expected a boolean.`,
      );
    } else {
      showInactiveStatus = document.showInactiveStatus;
    }
  }

  let presets: Preset[] = [];

  if (document.presets !== undefined) {
    if (!Array.isArray(document.presets)) {
      warnings.presets.push(
        `The config file ${path} has an invalid "presets" value; expected an array.`,
      );
    } else {
      const result = parsePresetArray(document.presets, path);

      presets = result.presets;
      warnings.presets.push(...result.warnings);
    }
  }

  if (scope === "project" && document.policy !== undefined) {
    warnings.policy.push(
      `The project config file ${path} contains policy, but policy is supported only in the user configuration.`,
    );
  } else if (scope === "user" && document.policy !== undefined) {
    if (!isRecord(document.policy) || !Array.isArray(document.policy.rules)) {
      warnings.policy.push(
        `The config file ${path} has an invalid "policy" section; expected an object with a "rules" array.`,
      );
    }
  }

  return {
    document,
    presets,
    ...(showInactiveStatus === undefined ? {} : { showInactiveStatus }),
    warnings,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyWarnings(): ScopeWarnings {
  return { file: [], settings: [], presets: [], policy: [] };
}

function invalidScope(warning: string): ScopeConfig {
  return {
    document: { version: 2 },
    presets: [],
    warnings: { ...emptyWarnings(), file: [warning] },
  };
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
