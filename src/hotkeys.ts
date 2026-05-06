/**
 * Per-preset shortcut registration for pi-presets-plus.
 *
 * Owns session-start shortcut registration, conflict/invalid notifications,
 * and shortcut activation guardrails. It does NOT own hotkey parsing,
 * conflict marking, persistent storage, or the core preset apply implementation.
 */
import { apply } from "./activation/apply.js";
import {
  formatPresetIdentity,
  type HotkeyAnalysis,
} from "./hotkey-conflicts.js";
import type { LoadedPreset } from "./types.js";
import { isPiBuiltin } from "./ui/hotkey-input.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";

export type CurrentPresetsLoader = (
  ctx: ExtensionContext,
) => Promise<LoadedPreset[]>;

export function registerHotkeys(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "ui">,
  presets: LoadedPreset[],
  hotkeyAnalysis: HotkeyAnalysis,
  loadCurrentPresets: CurrentPresetsLoader,
): void {
  for (const conflict of hotkeyAnalysis.conflicts) {
    ctx.ui.notify(
      `${formatPresetSubject(conflict.loser)} hotkey "${conflict.loser.hotkey}" conflicts with preset ${formatPresetIdentity(conflict.winner)}. The first registered wins.`,
      "warning",
    );
  }

  for (const invalid of hotkeyAnalysis.invalid) {
    ctx.ui.notify(
      `${formatPresetSubject(invalid.preset)}: invalid hotkey "${invalid.preset.hotkey}" — ignored (${invalid.reason}). It will not be registered or considered for conflicts until fixed.`,
      "warning",
    );
  }

  // Registration is intentionally one-shot because pi exposes no
  // unregisterShortcut API. loadAll() marks conflicts on every read for the
  // picker; this notification pass only explains the session-start bindings.
  for (const preset of presets) {
    const parsed = hotkeyAnalysis.parsed.get(preset);

    if (!parsed) continue;
    if (preset.shadowed || preset.hotkeyConflict === true) continue;

    if (isPiBuiltin(parsed)) {
      ctx.ui.notify(
        `${formatPresetSubject(preset)} hotkey "${preset.hotkey}" shadows a pi built-in. The preset binding will take precedence.`,
        "info",
      );
    }

    const registeredName = preset.name;
    const registeredScope = preset.scope;

    pi.registerShortcut(parsed.normalized as KeyId, {
      description: `Activate preset "${registeredName}"`,
      handler: async (handlerCtx) => {
        try {
          // Re-read on every press so edits/removals made after session-start
          // are honored without re-registering shortcuts. This trades a small
          // amount of I/O for correctness until pi exposes unregister support.
          const currentPresets = await loadCurrentPresets(handlerCtx);
          const current = currentPresets.find(
            (candidate) =>
              candidate.name === registeredName &&
              candidate.scope === registeredScope,
          );

          if (!current) {
            handlerCtx.ui.notify(
              `Preset "${registeredName}" no longer exists.`,
              "warning",
            );

            return;
          }

          if (current.unavailable) {
            handlerCtx.ui.notify(
              `Preset "${registeredName}" is unavailable (${current.unavailable}).`,
              "warning",
            );

            return;
          }

          await apply(current, handlerCtx, pi);
        } catch (err) {
          handlerCtx.ui.notify(
            `pi-presets-plus failed to activate preset "${registeredName}" from hotkey: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
      },
    });
  }
}

function formatPresetSubject(preset: Pick<LoadedPreset, "name">): string {
  return `Preset "${preset.name}"`;
}
