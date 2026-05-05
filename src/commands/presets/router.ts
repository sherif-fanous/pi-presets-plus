/**
 * `/presets` subcommand router.
 *
 * Owns command token dispatch and autocomplete for the `/presets` command;
 * storage, activation, picker, and clear semantics live in their dedicated
 * modules.
 */
import { apply } from "../../activation/apply.js";
import { openPicker } from "../../ui/picker.js";
import { runClear } from "./clear.js";
import { runReload } from "./reload.js";
import { runStatus } from "./status.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

interface Subcommand {
  readonly value: string;
  readonly label: string;
  run(
    ctx: ExtensionCommandContext,
    args: readonly string[],
    pi?: ExtensionAPI,
  ): Promise<void>;
}

const SUBCOMMANDS: readonly Subcommand[] = [
  {
    value: "reload",
    label: "reload: re-read both scope files",
    run: runReloadWrapper,
  },
  {
    value: "clear",
    label: "clear: clear the active preset",
    run: runClearWrapper,
  },
  {
    value: "status",
    label: "status: show active preset details",
    run: runStatusWrapper,
  },
] as const;

export function getArgumentCompletions(
  prefix: string,
): { value: string; label: string }[] {
  const trimmedPrefix = prefix.trimStart();

  if (trimmedPrefix.includes(" ")) return [];

  return SUBCOMMANDS.filter((subcommand) =>
    subcommand.value.startsWith(trimmedPrefix),
  ).map(({ value, label }) => ({ value, label }));
}

export async function handlePresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
): Promise<void> {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    await runPicker(ctx, pi);

    return;
  }

  const tokens = trimmedArgs.split(/\s+/);
  const subCommand = tokens[0] ?? "";

  if (subCommand === "list") {
    ctx.ui.notify(
      '"list" is not a supported /presets subcommand. run /presets to open the picker.',
      "warning",
    );

    return;
  }

  const target = SUBCOMMANDS.find(
    (subcommand) => subcommand.value === subCommand,
  );

  if (target) {
    await target.run(ctx, tokens.slice(1), pi);

    return;
  }

  ctx.ui.notify(
    `unknown subcommand "${subCommand ?? ""}". try /presets, /presets reload, /presets clear, or /presets status.`,
    "warning",
  );
}

async function runClearWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi?: ExtensionAPI,
): Promise<void> {
  if (!pi) return;
  await runClear(ctx, pi);
}

async function runPicker(
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
): Promise<void> {
  if (!pi) {
    ctx.ui.notify(
      "preset picker is only available in interactive mode.",
      "warning",
    );

    return;
  }

  await openPicker(ctx, {
    inheritedTools: pi.getActiveTools(),
    onActivate: (preset) => apply(preset, ctx, pi),
    pi,
  });
}

async function runReloadWrapper(ctx: ExtensionCommandContext): Promise<void> {
  await runReload(ctx);
}

async function runStatusWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi?: ExtensionAPI,
): Promise<void> {
  if (!pi) return;
  await runStatus(ctx, pi);
}
