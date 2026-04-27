/**
 * `/presets` subcommand router.
 *
 * The bare command is a dispatcher whose subcommand set grows across
 * the project plan. Splitting each subcommand into its own module
 * (`list.ts`, `reload.ts`, `stub.ts`, …) keeps this file small as new
 * subcommands land in later changes (activation, picker, editor,
 * shortcuts).
 *
 * Responsibilities kept here:
 * - Subcommand registry used by both `getArgumentCompletions` (editor
 *   autocomplete) and the router (runtime dispatch) so the two can't
 *   drift out of sync.
 * - Tokenization of the raw argument string.
 * - Unknown-subcommand fallback.
 */
import { runList } from "./list.js";
import { runReload } from "./reload.js";
import { showStubNotice } from "./stub.js";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

/** One entry per subcommand. Single source of truth for the registry. */
interface Subcommand {
  /** Literal token typed after `/presets `. */
  readonly value: string;
  /** Autocomplete label (value + one-line description). */
  readonly label: string;
  /** Handler invoked by the router. */
  run(ctx: ExtensionCommandContext): Promise<void>;
}

const SUBCOMMANDS: readonly Subcommand[] = [
  {
    value: "list",
    label: "list — print loaded presets",
    run: runList,
  },
  {
    value: "reload",
    label: "reload — re-read both scope files",
    run: runReload,
  },
] as const;

/**
 * Return autocomplete entries for `/presets <prefix>`.
 *
 * Filtered by exact prefix match against the subcommand value (e.g.
 * typing `re` shows only `reload`). Returns the full set when
 * `prefix` is empty.
 */
export function getArgumentCompletions(
  prefix: string,
): { value: string; label: string }[] {
  return SUBCOMMANDS.filter((subcommand) =>
    subcommand.value.startsWith(prefix),
  ).map(({ value, label }) => ({ value, label }));
}

/**
 * Route `/presets [args]` to the appropriate subcommand handler.
 *
 * Splits on whitespace; only the first token is interpreted. Later
 * changes adding `/presets <name>` activation will extend the router
 * (not the SUBCOMMANDS registry) so that arbitrary preset names can
 * include spaces via quoting rules.
 */
export async function handlePresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    showStubNotice(ctx);

    return;
  }

  const [subCommand] = trimmedArgs.split(/\s+/, 1);
  const target = SUBCOMMANDS.find(
    (subcommand) => subcommand.value === subCommand,
  );

  if (!target) {
    ctx.ui.notify(
      `Unknown subcommand "${subCommand ?? ""}". Try /presets list or /presets reload.`,
      "warning",
    );

    return;
  }

  await target.run(ctx);
}
