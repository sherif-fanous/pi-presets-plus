/**
 * `/presets <name>` activation command runner.
 *
 * Owns preset lookup and user-facing unknown-name errors for OpenSpec change
 * `add-preset-activation`; it delegates actual state mutation to
 * `activation/apply.ts`. Future fuzzy matching can extend lookup here without
 * changing the activation engine.
 */
import { apply } from "../../activation/apply.js";
import { loadAll } from "../../store/api.js";
import { surfaceWarnings } from "./notify.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

export async function runActivate(
  name: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const { presets, warnings } = await loadAll(ctx);

  surfaceWarnings(ctx, warnings);

  // mergeScopes returns user entries first (with `shadowed: true` on
  // collision) then project entries, so a plain `find` would resolve to the
  // shadowed user entry whenever both scopes define `name`. Filter shadowed
  // entries out so the project (winning) entry resolves correctly.
  const preset = presets.find(
    (candidate) => candidate.name === name && !candidate.shadowed,
  );

  if (!preset) {
    const available = presets
      .filter((candidate) => !candidate.unavailable && !candidate.shadowed)
      .map((candidate) => candidate.name)
      .join(", ");

    ctx.ui.notify(
      `no preset named "${name}". available presets: ${available || "none"}.`,
      "error",
    );

    return;
  }

  await apply(preset, ctx, pi);
}
