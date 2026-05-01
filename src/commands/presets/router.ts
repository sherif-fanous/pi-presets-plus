/**
 * `/presets` subcommand router.
 *
 * Owns command token dispatch and autocomplete for change
 * `add-preset-activation`; storage, activation, and clear semantics live in
 * their dedicated modules. Future quoted-name support can replace tokenization
 * here while preserving the single registry consumed by runtime and complete.
 */
import { runActivate } from "./activate.js";
import { runClear } from "./clear.js";
import { runList } from "./list.js";
import { runReload } from "./reload.js";
import { runStatus } from "./status.js";
import { showStubNotice } from "./stub.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

interface Subcommand {
  readonly value: string;
  readonly label: string;
  run(ctx: ExtensionCommandContext, pi?: ExtensionAPI): Promise<void>;
}

const SUBCOMMANDS: readonly Subcommand[] = [
  { value: "list", label: "list: print loaded presets", run: runListWrapper },
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

let completionPresetNames: readonly string[] = [];

export function getArgumentCompletions(
  prefix: string,
): { value: string; label: string }[] {
  const subcommands = SUBCOMMANDS.filter((subcommand) =>
    subcommand.value.startsWith(prefix),
  ).map(({ value, label }) => ({ value, label }));
  const presets = completionPresetNames
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ value: name, label: `${name}: activate preset` }));

  return [...subcommands, ...presets];
}

export async function handlePresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
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

  if (target) {
    await target.run(ctx, pi);

    return;
  }

  if (!pi) {
    ctx.ui.notify(
      `unknown subcommand "${subCommand ?? ""}". try /presets list, /presets reload, /presets clear, or /presets status.`,
      "warning",
    );

    return;
  }

  await runActivate(subCommand ?? "", ctx, pi);
}

export function setCompletionPresetNames(names: readonly string[]): void {
  completionPresetNames = [...names].sort();
}

async function runClearWrapper(
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
): Promise<void> {
  if (!pi) return;
  await runClear(ctx, pi);
}

async function runListWrapper(ctx: ExtensionCommandContext): Promise<void> {
  await runList(ctx);
}

async function runReloadWrapper(ctx: ExtensionCommandContext): Promise<void> {
  await runReload(ctx);
}

async function runStatusWrapper(
  ctx: ExtensionCommandContext,
  pi?: ExtensionAPI,
): Promise<void> {
  if (!pi) return;
  await runStatus(ctx, pi);
}
