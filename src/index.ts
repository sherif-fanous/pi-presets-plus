/**
 * pi-presets-plus extension entry point.
 *
 * Owns lifecycle wiring with the pi host: command registration, custom
 * message renderers, session-start pre-warming and restore, instruction
 * injection, and self-call guards. It does NOT own storage, activation,
 * or UI internals — those live in their dedicated modules.
 */

import {
  clearActive,
  getActive,
  setActive,
} from "./activation/active-state.js";
import {
  handleModelSelectDrift,
  syncDirtyFromCurrentState,
} from "./activation/drift-handlers.js";
import { snapshotPresetForDrift } from "./activation/drift.js";
import {
  getArgumentCompletions,
  handlePresetsCommand,
  surfaceWarnings,
} from "./commands/presets/index.js";
import { ACTIVATED_MESSAGE_TYPE, renderActivatedMessage } from "./messages.js";
import { loadAll } from "./store/api.js";
import type { LoadedPreset, PresetScope } from "./types.js";
import { updateStatus } from "./ui/status.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

interface ActiveEntryData {
  name: string | null;
  scope?: PresetScope;
}

export default function presetsPlus(pi: ExtensionAPI) {
  pi.registerMessageRenderer(ACTIVATED_MESSAGE_TYPE, renderActivatedMessage);

  pi.registerCommand("presets", {
    description:
      "Browse and switch presets that bundle a model, thinking level, tools, and system prompt. Run `/presets` to open the picker, or use `reload`, `clear`, or `status`.",
    getArgumentCompletions: (prefix) => getArgumentCompletions(prefix),
    handler: (args, ctx) => handlePresetsCommand(args, ctx, pi),
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      const { presets, warnings } = await loadAll(ctx);

      surfaceWarnings(ctx, warnings);
      restoreActiveFromBranch(ctx, presets);
      updateStatus(ctx, getActive(), (name, scope) =>
        presets.find(
          (preset) => preset.name === name && preset.scope === scope,
        ),
      );
    } catch (err) {
      ctx.ui.notify(
        `pi-presets-plus failed to load preset files: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const active = getActive();

    if (!active) return undefined;

    // Don't re-surface warnings here. They were already shown at
    // session_start and on /presets reload; emitting them on every
    // agent turn would be noisy when a preset file has issues.
    const { presets } = await loadAll(ctx);

    const preset = presets.find(
      (candidate) =>
        candidate.name === active.name && candidate.scope === active.scope,
    );

    if (!preset?.instructions) return undefined;

    return { systemPrompt: `${event.systemPrompt}\n\n${preset.instructions}` };
  });

  pi.on("model_select", async (event, ctx) => {
    await handleModelSelectDrift(event, ctx, pi);
  });

  pi.on("thinking_level_select", async (_event, ctx) => {
    await syncDirtyFromCurrentState(ctx, pi);
  });

  pi.on("turn_start", async (_event, ctx) => {
    await syncDirtyFromCurrentState(ctx, pi);
  });
}

function restoreActiveFromBranch(
  ctx: Pick<ExtensionContext, "sessionManager" | "ui">,
  presets: readonly LoadedPreset[],
): void {
  const activeEntry = [...ctx.sessionManager.getBranch()]
    .reverse()
    .find(
      (entry): entry is Extract<typeof entry, { type: "custom" }> =>
        entry.type === "custom" && entry.customType === "presets-plus:active",
    );

  if (!activeEntry) {
    clearActive();

    return;
  }

  const data = activeEntry.data as ActiveEntryData | undefined;

  if (!data || data.name === null) {
    clearActive();

    return;
  }

  const preset = presets.find(
    (candidate) =>
      candidate.name === data.name &&
      candidate.scope === (data.scope ?? "user"),
  );

  if (!preset) {
    ctx.ui.notify(
      `restored session referenced preset "${data.name}" which is not loaded. not attaching.`,
      "warning",
    );
    clearActive();

    return;
  }

  if (preset.unavailable) {
    ctx.ui.notify(
      `restored session referenced preset "${data.name}" which is unavailable (${preset.unavailable}). not attaching.`,
      "warning",
    );
    clearActive();

    return;
  }

  setActive({
    declared: snapshotPresetForDrift(preset),
    dirty: false,
    name: preset.name,
    restore: { kind: "unknown" },
    scope: preset.scope,
  });
}
