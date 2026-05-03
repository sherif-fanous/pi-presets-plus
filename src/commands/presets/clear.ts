/**
 * `/presets clear` command runner.
 *
 * Owns command-bound delegation to the activation clear engine; restore
 * semantics live in `activation/clear.ts`.
 */
import { clear } from "../../activation/clear.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

export async function runClear(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  await clear(ctx, pi);
}
