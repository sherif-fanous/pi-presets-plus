/**
 * pi-presets-plus extension entry point.
 *
 * Owns lifecycle wiring with the pi host: command registration, custom
 * message renderers, session-start pre-warming and restore, instruction
 * injection, and self-call guards. It does NOT own storage, activation,
 * or UI internals — those live in their dedicated modules.
 */

import {
  handleModelSelectDrift,
  syncDirtyFromCurrentState,
} from "./activation/drift-handlers.js";
import { ActivePresetSession } from "./activation/session.js";
import {
  getArgumentCompletions,
  handlePresetsCommand,
  surfaceWarnings,
} from "./commands/presets/index.js";
import { applyPresetFlag, registerPresetFlag } from "./flag.js";
import {
  HotkeyRegistry,
  type CurrentPresetsLoader,
} from "./hotkey-registry.js";
import { ACTIVATED_MESSAGE_TYPE, renderActivatedMessage } from "./messages.js";
import { findPreset } from "./preset-identity.js";
import { loadAll } from "./store/api.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function presetsPlus(pi: ExtensionAPI) {
  const session = new ActivePresetSession();
  const hotkeys = new HotkeyRegistry();
  const presetNamesLoader: { fn: () => Promise<readonly string[]> } = {
    fn: () => Promise.resolve([]),
  };

  pi.registerMessageRenderer(ACTIVATED_MESSAGE_TYPE, renderActivatedMessage);
  registerPresetFlag(pi);

  pi.registerCommand("presets", {
    description:
      "Browse and switch presets that bundle a model, thinking level, tools, and system prompt. Run `/presets` to open the picker, or use `reload`, `clear`, or `status`.",
    getArgumentCompletions: (prefix) =>
      getArgumentCompletions(prefix, () => presetNamesLoader.fn()),
    handler: (args, ctx) =>
      handlePresetsCommand(args, ctx, pi, session, hotkeys),
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      const { hotkeyAnalysis, presets, warnings } = await loadAll(ctx);

      surfaceWarnings(ctx, warnings);

      const { warnings: restoreWarnings } = session.restoreFromBranch(
        ctx.sessionManager.getBranch(),
        presets,
        ctx,
      );

      surfaceWarnings(ctx, restoreWarnings);
      await applyPresetFlag(pi, ctx, presets, session);

      presetNamesLoader.fn = async () => {
        try {
          return (await loadAll(ctx)).presets.map((preset) => preset.name);
        } catch {
          return [];
        }
      };

      const loadCurrentPresets: CurrentPresetsLoader = async (handlerCtx) =>
        (await loadAll(handlerCtx)).presets;

      hotkeys.bindForSession(
        presets,
        hotkeyAnalysis,
        ctx,
        pi,
        loadCurrentPresets,
        session,
      );
    } catch (err) {
      ctx.ui.notify(
        `pi-presets-plus failed to load preset files: ${err instanceof Error ? err.message : String(err)}.`,
        "error",
      );
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const active = session.current();

    if (!active) return undefined;

    // Don't re-surface warnings here. They were already shown at
    // session_start and on /presets reload; emitting them on every
    // agent turn would be noisy when a preset file has issues.
    const { presets } = await loadAll(ctx);
    const preset = findPreset(presets, active);

    if (!preset?.instructions) return undefined;

    return { systemPrompt: `${event.systemPrompt}\n\n${preset.instructions}` };
  });

  pi.on("model_select", async (event, ctx) => {
    await handleModelSelectDrift(event, ctx, pi, session);
  });

  pi.on("thinking_level_select", async (_event, ctx) => {
    await syncDirtyFromCurrentState(ctx, pi, session);
  });

  pi.on("turn_start", async (_event, ctx) => {
    await syncDirtyFromCurrentState(ctx, pi, session);
  });
}
