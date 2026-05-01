/**
 * `/presets clear` command runner.
 *
 * Owns only command-bound delegation for OpenSpec change
 * `add-preset-activation`; restore semantics live in `activation/clear.ts`.
 * Future confirmation prompts can be added here without widening the clear
 * engine's dependencies.
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
