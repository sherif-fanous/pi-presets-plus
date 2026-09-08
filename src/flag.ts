/**
 * Registers the `--preset` command-line flag and activates the preset it
 * names when the session starts.
 */
import { requestActivation } from "./activation/request.js";
import type { ActivePresetSession } from "./activation/session.js";
import type { LoadedPreset } from "./types.js";
import { notifyApplyResult } from "./ui/apply-result.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Name of the command-line flag, without the leading dashes. */
const PRESET_FLAG = "preset";

/**
 * Activate the preset named by `--preset` and report whether it took
 * effect. Returns `false` when the flag is absent, names a preset that
 * does not exist, or the user cancels the activation prompt.
 */
export async function applyPresetFlag(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  presets: readonly LoadedPreset[],
  session: ActivePresetSession,
): Promise<boolean> {
  const value = pi.getFlag(PRESET_FLAG);

  if (typeof value !== "string") return false;

  const name = value.trim();

  if (name.length === 0) return false;

  const preset = findPresetForFlag(presets, name);

  if (!preset) {
    ctx.ui.notify(
      `--preset: Unknown preset "${name}". Available: ${formatAvailableNames(presets)}.`,
      "warning",
    );

    return false;
  }

  const result = await requestActivation(preset, ctx, pi, session);

  if (!result.ok && result.kind === "cancelled") return false;

  notifyApplyResult(ctx, preset, result);

  return result.ok;
}

/** Declare the `--preset` flag so Pi accepts and parses it. */
export function registerPresetFlag(
  pi: Pick<ExtensionAPI, "registerFlag">,
): void {
  pi.registerFlag(PRESET_FLAG, {
    description: "Activate the named pi-presets-plus preset on session start.",
    type: "string",
  });
}

/**
 * Find the preset a flag value names, preferring the project scope over
 * the user scope and skipping shadowed entries.
 */
function findPresetForFlag(
  presets: readonly LoadedPreset[],
  name: string,
): LoadedPreset | undefined {
  return (
    presets.find(
      (preset) =>
        preset.name === name && preset.scope === "project" && !preset.shadowed,
    ) ??
    presets.find(
      (preset) =>
        preset.name === name && preset.scope === "user" && !preset.shadowed,
    )
  );
}

/** List one entry per preset name for the unknown-preset warning. */
function formatAvailableNames(presets: readonly LoadedPreset[]): string {
  const byName = new Map<string, LoadedPreset>();

  for (const preset of presets) {
    const existing = byName.get(preset.name);

    if (!existing || existing.shadowed) byName.set(preset.name, preset);
  }

  if (byName.size === 0) return "none";

  return [...byName.values()]
    .map((preset) =>
      preset.unavailable
        ? `${preset.name} (Unavailable: ${preset.unavailable})`
        : preset.name,
    )
    .join(", ");
}
