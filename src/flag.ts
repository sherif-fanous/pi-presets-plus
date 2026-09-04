/**
 * Startup preset flag registration and handling.
 *
 * Owns the `--preset` CLI flag entry point and startup lookup messages. It
 * does NOT own session restore, preset storage, or the apply implementation.
 */
import { apply } from "./activation/apply.js";
import { gateActivation } from "./activation/policy-gate.js";
import type { ActivePresetSession } from "./activation/session.js";
import type { LoadedPreset } from "./types.js";
import { notifyApplyResult } from "./ui/apply-result.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PRESET_FLAG = "preset";

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

  if (!(await gateActivation(preset, ctx))) return false;

  const result = await apply(preset, ctx, pi, session);

  notifyApplyResult(ctx, preset, result);

  return result.ok;
}

export function registerPresetFlag(
  pi: Pick<ExtensionAPI, "registerFlag">,
): void {
  pi.registerFlag(PRESET_FLAG, {
    description: "Activate the named pi-presets-plus preset on session start.",
    type: "string",
  });
}

// Intentionally bespoke: the project-then-user fallback with shadowed
// filter is unique to flag activation and is not modelled by the shared
// findPreset helper. Don't "consolidate" without preserving the
// scope-precedence and shadowed semantics.
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
