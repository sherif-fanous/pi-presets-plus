/**
 * `/presets show-prompt` reader subcommand.
 *
 * Owns active/named prompt classification and notification formatting; it
 * does NOT own preset activation, mutation, or storage merge semantics.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import type { HotkeyRegistry } from "../../hotkey-registry.js";
import { findPreset } from "../../preset-identity.js";
import { loadAll } from "../../store/api.js";
import type { ActivePresetState, LoadedPreset } from "../../types.js";
import { openInfoDialog } from "../../ui/info-dialog.js";
import { PROMPT_DIALOG_TITLE } from "../../ui/labels.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";

export interface ShowPromptNotification {
  readonly body: string;
  readonly severity: "info" | "warning" | "error";
}

export type ShowPromptResult =
  | { kind: "active"; preset: LoadedPresetWithPrompt }
  | { kind: "named"; preset: LoadedPresetWithPrompt }
  | { kind: "no-active" }
  | { kind: "no-prompt-active"; name: string }
  | { kind: "no-prompt-named"; name: string }
  | { kind: "unknown"; name: string };

type LoadedPresetWithPrompt = LoadedPreset & { instructions: string };

export function findPresetForShowPrompt(
  name: string | undefined,
  active: ActivePresetState | null | undefined,
  loaded: readonly LoadedPreset[],
): ShowPromptResult {
  if (name !== undefined) {
    const preset = findPresetByNameWithScopePrecedence(loaded, name);

    if (!preset) return { kind: "unknown", name };

    const promptPreset = presetWithPrompt(preset);

    if (!promptPreset) return { kind: "no-prompt-named", name: preset.name };

    return { kind: "named", preset: promptPreset };
  }

  if (!active) return { kind: "no-active" };

  const preset = findPreset(loaded, active);
  const activeName = preset?.name ?? active.name;
  const promptPreset = preset ? presetWithPrompt(preset) : undefined;

  if (!promptPreset) return { kind: "no-prompt-active", name: activeName };

  return { kind: "active", preset: promptPreset };
}

export function formatShowPromptBody(
  result: ShowPromptResult,
  theme?: Theme,
): ShowPromptNotification {
  void theme;

  switch (result.kind) {
    case "active":
    case "named":
      return { body: result.preset.instructions, severity: "info" };
    case "no-active":
      return { body: "No preset is active.", severity: "info" };
    case "no-prompt-active":
      return {
        body: `Active preset "${result.name}" has no prompt.`,
        severity: "info",
      };
    case "no-prompt-named":
      return {
        body: `Preset "${result.name}" has no prompt.`,
        severity: "info",
      };
    case "unknown":
      return { body: `No preset named "${result.name}".`, severity: "error" };
  }
}

export async function runShowPrompt(
  ctx: ExtensionCommandContext,
  args: readonly string[],
  pi: ExtensionAPI | undefined,
  session: ActivePresetSession,
  hotkeys: HotkeyRegistry,
): Promise<void> {
  void pi;
  void hotkeys;

  const name = args[0];
  const { presets } = await loadAll(ctx);
  const result = findPresetForShowPrompt(name, session.current(), presets);
  const notification = formatShowPromptBody(result, ctx.ui.theme);

  if (result.kind === "active" || result.kind === "named") {
    // pi-tui exports a Markdown component, but this extension API does not
    // expose a markdown render hook for command-output dialogs. Use the
    // existing multi-line info overlay rather than short-form notifications,
    // preserving the literal prompt text in a readable dismissible surface.
    await openInfoDialog(ctx, {
      body: notification.body,
      title: PROMPT_DIALOG_TITLE,
      tone: notification.severity,
    });

    return;
  }

  ctx.ui.notify(notification.body, notification.severity);
}

function findPresetByNameWithScopePrecedence(
  loaded: readonly LoadedPreset[],
  name: string,
): LoadedPreset | undefined {
  return (
    findPreset(loaded, { name, scope: "project" }) ??
    findPreset(loaded, { name, scope: "user" })
  );
}

function presetWithPrompt(
  preset: LoadedPreset,
): LoadedPresetWithPrompt | undefined {
  if (
    preset.instructions === undefined ||
    preset.instructions.trim().length === 0
  ) {
    return undefined;
  }

  return { ...preset, instructions: preset.instructions };
}
