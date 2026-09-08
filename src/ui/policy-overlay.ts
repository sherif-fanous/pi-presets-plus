/**
 * Asks the user to confirm an activation that the directory's access
 * policy does not permit.
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
