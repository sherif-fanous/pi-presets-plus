/**
 * Reads Pi's file-backed startup defaults and compares them with the values
 * observed when preset processing begins.
 */
import { THINKING_LEVELS, type ThinkingLevel } from "../types.js";
import { sameModel, type ModelIdentity } from "./same-model.js";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  SettingsManager,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PI_STARTUP_THINKING_FALLBACK: ThinkingLevel = "medium";

/** File-backed provider, model, and configured thinking defaults. */
export interface FileBackedDefaults {
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly thinkingLevel: string | undefined;
}

/** Model and thinking values observed before preset processing. */
export interface StartupSelection {
  readonly model: ModelIdentity | undefined;
  readonly thinkingLevel: ThinkingLevel;
}

/** Minimal settings reader used by the file-backed defaults loader. */
export interface StartupSettingsReader {
  drainErrors(): readonly unknown[];
  getDefaultModel(): string | undefined;
  getDefaultProvider(): string | undefined;
  getDefaultThinkingLevel(): string | undefined;
}

/** Factory seam for constructing a fresh settings reader in tests. */
export type StartupSettingsReaderFactory = (
  cwd: string,
  agentDir: string,
  options: { projectTrusted: boolean },
) => StartupSettingsReader;

/** Capture startup values from the extension context and API. */
export function captureStartupSelection(
  ctx: Pick<ExtensionContext, "model">,
  pi: { getThinkingLevel(): ThinkingLevel },
): StartupSelection {
  return {
    model: ctx.model
      ? { id: ctx.model.id, provider: ctx.model.provider }
      : undefined,
    thinkingLevel: pi.getThinkingLevel(),
  };
}

/** Decide whether this startup may receive an automatic directory default. */
export function isAutomaticDefaultEligible(
  startup: StartupSelection,
  ctx: Pick<
    ExtensionContext,
    "cwd" | "isProjectTrusted" | "mode" | "modelRegistry"
  >,
  readDefaults: (
    cwd: string,
    projectTrusted: boolean,
  ) => FileBackedDefaults | undefined = readFileBackedDefaults,
): boolean {
  return (
    ctx.mode === "tui" &&
    startupSelectionMatchesDefaults(startup, ctx, readDefaults)
  );
}

/** Read merged global and trusted-project defaults from disk. */
export function readFileBackedDefaults(
  cwd: string,
  projectTrusted: boolean,
  agentDir = getAgentDir(),
  createSettings: StartupSettingsReaderFactory = (
    settingsCwd,
    settingsAgentDir,
    options,
  ) => SettingsManager.create(settingsCwd, settingsAgentDir, options),
): FileBackedDefaults | undefined {
  let settings: StartupSettingsReader;

  try {
    settings = createSettings(cwd, agentDir, { projectTrusted });
  } catch {
    return undefined;
  }

  if (settings.drainErrors().length > 0) return undefined;

  return {
    model: settings.getDefaultModel(),
    provider: settings.getDefaultProvider(),
    thinkingLevel: settings.getDefaultThinkingLevel(),
  };
}

/** Decide whether captured values match resolved file-backed Pi defaults. */
export function startupSelectionMatchesDefaults(
  startup: StartupSelection,
  ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted" | "modelRegistry">,
  readDefaults: (
    cwd: string,
    projectTrusted: boolean,
  ) => FileBackedDefaults | undefined = readFileBackedDefaults,
): boolean {
  const defaults = readDefaults(ctx.cwd, ctx.isProjectTrusted());

  if (!defaults?.provider || !defaults.model) return false;

  if (
    defaults.thinkingLevel !== undefined &&
    !isThinkingLevel(defaults.thinkingLevel)
  ) {
    return false;
  }

  const defaultModel = { id: defaults.model, provider: defaults.provider };

  if (!sameModel(startup.model ?? null, defaultModel)) return false;

  const model = ctx.modelRegistry.find(defaultModel.provider, defaultModel.id);

  if (!model) return false;

  const requestedThinking =
    defaults.thinkingLevel ?? PI_STARTUP_THINKING_FALLBACK;
  const expectedThinking = clampThinkingLevel(model, requestedThinking);

  return startup.thinkingLevel === expectedThinking;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value);
}
