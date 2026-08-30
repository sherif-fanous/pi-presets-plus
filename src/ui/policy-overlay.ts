/**
 * Confirmation overlay for policy-discouraged preset activations.
 *
 * Owns policy warning copy and outcome labels; it does NOT evaluate policy or
 * apply presets.
 */
import type { LoadedPreset } from "../types.js";
import { openConfirm } from "./confirm.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Ask whether a policy-discouraged activation should proceed. */
export async function openPolicyOverride(
  ctx: Pick<ExtensionCommandContext, "ui">,
  preset: Pick<LoadedPreset, "name">,
): Promise<boolean> {
  return openConfirm(
    ctx,
    "Preset Doesn't Match Policy",
    `The access policy for this directory does not permit preset "${preset.name}". Activate it anyway?`,
    { no: "Cancel", yes: "Override" },
  );
}
