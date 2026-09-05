/**
 * `/presets` subcommand router.
 *
 * Owns command token dispatch and autocomplete for the `/presets` command;
 * storage, activation, picker, and clear semantics live in their dedicated
 * modules.
 */
import { clear } from "../../activation/clear.js";
import { requestActivation } from "../../activation/request.js";
import type { ActivePresetSession } from "../../activation/session.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { loadAll } from "../../store/api.js";
import { notifyApplyResult } from "../../ui/apply-result.js";
import { openPicker } from "../../ui/picker.js";
import { surfaceWarnings } from "./notify.js";
import { runPolicy } from "./policy.js";
import { runReload } from "./reload.js";
import { runShowPrompt } from "./show-prompt.js";
import { runStatus } from "./status.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

interface Subcommand {
  readonly value: string;
  readonly label: string;
  run(
    ctx: ExtensionCommandContext,
    args: readonly string[],
    pi: ExtensionAPI | undefined,
    session: ActivePresetSession,
    hotkeys: HotkeyRegistry,
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
  {
    value: "policy",
    label: "policy: show access policy for this directory",
    run: runPolicyWrapper,
  },
  {
    value: "show-prompt",
    label: "show-prompt: show the active preset's prompt (or [name])",
    run: runShowPrompt,
  },
] as const;

export async function getArgumentCompletions(
  prefix: string,
  getPresetNames: () => Promise<readonly string[]> = () => Promise.resolve([]),
): Promise<{ value: string; label: string }[]> {
  const trimmedPrefix = prefix.trimStart();
  const showPromptPrefix = "show-prompt ";

  if (trimmedPrefix.startsWith(showPromptPrefix)) {
    const namePrefix = trimmedPrefix.slice(showPromptPrefix.length).trimStart();
    const names = await getPresetNames();

    return names
      .filter((name) => name.startsWith(namePrefix))
      .map((name) => ({ label: name, value: name }));
  }

  if (trimmedPrefix.includes(" ")) return [];

  return SUBCOMMANDS.filter((subcommand) =>
    subcommand.value.startsWith(trimmedPrefix),
  ).map(({ value, label }) => ({ value, label }));
}

export async function handlePresetsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    await runPicker(ctx, pi, session, hotkeys);

    return;
  }

  const tokens = trimmedArgs.split(/\s+/);
  const subCommand = tokens[0] ?? "";

  if (subCommand === "list") {
    ctx.ui.notify(
      '"list" is not a supported /presets subcommand. Run /presets to open the picker.',
      "warning",
    );

    return;
  }

  const target = SUBCOMMANDS.find(
    (subcommand) => subcommand.value === subCommand,
  );

  if (target) {
    await target.run(ctx, tokens.slice(1), pi, session, hotkeys);

    return;
  }

  if (pi && (await activateNamedPreset(trimmedArgs, ctx, pi, session))) return;

  ctx.ui.notify(
    `Unknown subcommand "${subCommand ?? ""}". Try ${formatSupportedCommandHint()}.`,
    "warning",
  );
}

async function activateNamedPreset(
  name: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  session: ActivePresetSession,
): Promise<boolean> {
  const { presets, warnings } = await loadAll(ctx);

  surfaceWarnings(ctx, warnings);

  const preset = presets.find(
    (candidate) => candidate.name === name && !candidate.shadowed,
  );

  if (!preset) return false;

  const result = await requestActivation(preset, ctx, pi, session);

  if (!result.ok && result.kind === "cancelled") return true;

  notifyApplyResult(ctx, preset, result);

  return true;
}

function formatSupportedCommandHint(): string {
  const commands = [
    "/presets",
    ...SUBCOMMANDS.map((subcommand) => `/presets ${subcommand.value}`),
  ];

  if (commands.length <= 1) return commands[0] ?? "/presets";

  return `${commands.slice(0, -1).join(", ")}, or ${commands[commands.length - 1]}`;
}

async function runClearWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void hotkeys;
  if (!pi) return;
  await clear(ctx, pi, session);
}

async function runPicker(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  if (!pi) {
    ctx.ui.notify(
      "Preset picker is only available in interactive mode.",
      "warning",
    );

    return;
  }

  await openPicker(ctx, {
    hotkeys,
    inheritedTools: pi.getActiveTools(),
    onActivate: async (preset) => {
      const result = await requestActivation(preset, ctx, pi, session);

      if (result.ok) notifyApplyResult(ctx, preset, result);

      return result;
    },
    pi,
    session,
  });
}

async function runPolicyWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  _session: ActivePresetSession,
  _hotkeys: HotkeyRegistry,
): Promise<void> {
  void _session;
  void _hotkeys;

  if (!pi) return;
  await runPolicy(ctx, pi);
}

async function runReloadWrapper(ctx: ExtensionCommandContext): Promise<void> {
  await runReload(ctx);
}

async function runStatusWrapper(
  ctx: ExtensionCommandContext,
  _args: readonly string[],
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void hotkeys;
  if (!pi) return;
  await runStatus(ctx, pi, session);
}
