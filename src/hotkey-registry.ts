/**
 * Runtime hotkey registry for pi-presets-plus.
 *
 * Owns hotkey conflict analysis, session shortcut binding, and reload-prompt
 * baseline state. It does NOT own preset storage, editor UI, or activation
 * decision logic beyond invoking the injected apply flow for shortcuts.
 */
import { apply } from "./activation/apply.js";
import type { ActivePresetSession } from "./activation/session.js";
import { findPreset, type PresetIdentity } from "./preset-identity.js";
import type { LoadedPreset } from "./types.js";
import {
  isPiBuiltin,
  parseHotkey,
  type ParsedHotkey,
} from "./ui/hotkey-input.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";

export type { PresetIdentity } from "./preset-identity.js";
export { findPreset } from "./preset-identity.js";

export interface HotkeyAnalysis {
  readonly conflicts: HotkeyConflict[];
  readonly invalid: HotkeyDiagnostic[];
  readonly parsed: ReadonlyMap<LoadedPreset, ParsedHotkey>;
}

export interface HotkeyConflict {
  readonly loser: LoadedPreset & { hotkey: string };
  readonly winner: PresetIdentity;
}

export interface HotkeyDiagnostic {
  readonly preset: LoadedPreset & { hotkey: string };
  readonly reason: string;
}

export type CurrentPresetsLoader = (
  ctx: ExtensionContext,
) => Promise<LoadedPreset[]>;

/** Owns runtime hotkey-binding state and reload-prompt baseline tracking. */
export class HotkeyRegistry {
  private readonly acknowledgedPendingHotkeys = new Map<
    string,
    string | undefined
  >();
  private readonly runtimeHotkeys = new Map<string, string | undefined>();

  /** Bind session-start shortcuts and capture the runtime hotkey baseline. */
  bindForSession(
    presets: LoadedPreset[],
    hotkeyAnalysis: HotkeyAnalysis,
    ctx: Pick<ExtensionContext, "ui">,
    pi: ExtensionAPI,
    loadCurrentPresets: CurrentPresetsLoader,
    session: ActivePresetSession,
  ): void {
    // Defensive clear: bindForSession is called once per presetsPlus(pi)
    // invocation today, but a future re-bind flow (e.g. reload-without-
    // restart) would need this to start from a clean baseline.
    this.setRuntimeHotkeyBaseline(presets);

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

    for (const preset of presets) {
      const parsed = hotkeyAnalysis.parsed.get(preset);

      if (!parsed) continue;
      if (preset.shadowed || preset.hotkeyConflict === true) continue;

      if (isPiBuiltin(parsed)) {
        ctx.ui.notify(
          `${formatPresetSubject(preset)} hotkey "${preset.hotkey}" shadows a Pi built-in. The preset binding will take precedence.`,
          "info",
        );
      }

      const registeredName = preset.name;
      const registeredScope = preset.scope;

      pi.registerShortcut(parsed.normalized as KeyId, {
        description: `Activate preset "${registeredName}"`,
        handler: async (handlerCtx) => {
          try {
            const currentPresets = await loadCurrentPresets(handlerCtx);
            const current = findPreset(currentPresets, {
              name: registeredName,
              scope: registeredScope,
            });

            if (!current) {
              handlerCtx.ui.notify(
                `Preset "${registeredName}" no longer exists.`,
                "warning",
              );

              return;
            }

            const result = await apply(current, handlerCtx, pi, session);

            if (!result.ok) handlerCtx.ui.notify(result.reason, "error");
          } catch (err) {
            handlerCtx.ui.notify(
              `pi-presets-plus failed to activate preset "${registeredName}" from hotkey: ${err instanceof Error ? err.message : String(err)}.`,
              "error",
            );
          }
        },
      });
    }
  }

  /** Return whether deleting `identity` leaves runtime bindings out of date. */
  deleteNeedsReload(identity: PresetIdentity): boolean {
    return this.commitNeedsHotkeyReload(identity, undefined);
  }

  /** Remember a declined prompt so the same pending state is not re-prompted. */
  recordReloadPromptDeclined(
    identity: PresetIdentity & { readonly hotkey?: string | undefined },
    hotkey = identity.hotkey,
  ): void {
    this.acknowledgedPendingHotkeys.set(presetKey(identity), hotkey);
  }

  /** Return whether saving `saved` leaves runtime bindings out of date. */
  saveNeedsReload(
    initial: PresetIdentity | undefined,
    saved: PresetIdentity & { readonly hotkey?: string | undefined },
  ): boolean {
    if (!this.commitNeedsHotkeyReload(saved, saved.hotkey)) return false;

    const initialRuntimeHotkey = this.runtimeHotkeyFor(initial);

    if (!hotkeyChanged(initialRuntimeHotkey, saved.hotkey)) {
      return (
        Boolean(initialRuntimeHotkey?.trim()) && identityChanged(initial, saved)
      );
    }

    return true;
  }

  private acknowledgedPendingHotkeyMatches(
    identity: PresetIdentity & { readonly hotkey?: string | undefined },
  ): boolean {
    if (!this.acknowledgedPendingHotkeys.has(presetKey(identity))) return false;

    return !hotkeyChanged(
      this.acknowledgedPendingHotkeys.get(presetKey(identity)),
      identity.hotkey,
    );
  }

  private commitNeedsHotkeyReload(
    identity: PresetIdentity,
    hotkey: string | undefined,
  ): boolean {
    if (this.runtimeMatches(identity, hotkey)) {
      this.acknowledgedPendingHotkeys.delete(presetKey(identity));

      return false;
    }

    return !this.acknowledgedPendingHotkeyMatches({ ...identity, hotkey });
  }

  private runtimeHotkeyFor(
    identity: PresetIdentity | undefined,
  ): string | undefined {
    if (!identity) return undefined;

    return this.runtimeHotkeys.get(presetKey(identity));
  }

  private runtimeMatches(
    identity: PresetIdentity,
    hotkey: string | undefined,
  ): boolean {
    return !hotkeyChanged(this.runtimeHotkeyFor(identity), hotkey);
  }

  private setRuntimeHotkeyBaseline(presets: readonly LoadedPreset[]): void {
    this.acknowledgedPendingHotkeys.clear();
    this.runtimeHotkeys.clear();

    for (const preset of presets) {
      this.runtimeHotkeys.set(presetKey(preset), preset.hotkey);
    }
  }
}

/**
 * Annotate presets with hotkey conflict markers and return parsed hotkey data.
 *
 * Free function because the analysis does not read or write any registry
 * instance state. Keeping it free lets storage layers (`loadAll`) call it
 * without taking a `HotkeyRegistry` import edge purely to allocate a
 * throwaway instance, and makes the no-state property compile-checkable.
 *
 * The function mutates each preset's `hotkeyConflict` and
 * `hotkeyShadowsBuiltin` annotations. mergeScopes currently produces
 * fresh objects on every load so prior annotations cannot leak in via
 * shared references, but we still clear-then-recompute defensively to
 * honor the documented contract: this annotation is the single source
 * of truth, callers may not rely on prior values surviving across
 * analyzeHotkeys invocations.
 */
export function analyzeHotkeys(presets: LoadedPreset[]): HotkeyAnalysis {
  const claimed = new Map<string, PresetIdentity>();
  const conflicts: HotkeyConflict[] = [];
  const invalid: HotkeyDiagnostic[] = [];
  const parsedHotkeys = new Map<LoadedPreset, ParsedHotkey>();

  for (const preset of presets) {
    preset.hotkeyConflict = undefined;
    preset.hotkeyShadowsBuiltin = undefined;

    const { hotkey } = preset;

    if (!hotkey) continue;

    const presetWithHotkey: LoadedPreset & { hotkey: string } = {
      ...preset,
      hotkey,
    };
    const parsed = parseHotkey(hotkey);

    if (!parsed.ok) {
      invalid.push({ preset: presetWithHotkey, reason: parsed.reason });

      continue;
    }

    parsedHotkeys.set(preset, parsed.parsed);

    if (isPiBuiltin(parsed.parsed)) {
      preset.hotkeyShadowsBuiltin = true;
    }

    if (preset.shadowed) continue;

    const winner = claimed.get(parsed.parsed.normalized);

    if (winner) {
      preset.hotkeyConflict = true;
      conflicts.push({ loser: presetWithHotkey, winner });

      continue;
    }

    claimed.set(parsed.parsed.normalized, {
      name: preset.name,
      scope: preset.scope,
    });
  }

  return { conflicts, invalid, parsed: parsedHotkeys };
}

/** Returns `"<name>" (<scope>)`, including the quotes around the name. */
export function formatPresetIdentity(identity: PresetIdentity): string {
  return `"${identity.name}" (${identity.scope})`;
}

/** Return whether two hotkey declarations differ after commit-time cleanup. */
export function hotkeyChanged(
  prev: string | undefined,
  next: string | undefined,
): boolean {
  return normalizeHotkeyForChange(prev) !== normalizeHotkeyForChange(next);
}

function formatPresetSubject(preset: Pick<LoadedPreset, "name">): string {
  return `Preset "${preset.name}"`;
}

function identityChanged(
  prev: PresetIdentity | undefined,
  next: PresetIdentity,
): boolean {
  if (!prev) return false;

  return prev.name !== next.name || prev.scope !== next.scope;
}

function normalizeHotkeyForChange(hotkey: string | undefined): string {
  const trimmed = hotkey?.trim() ?? "";

  if (trimmed.length === 0) return "";

  const parsed = parseHotkey(trimmed);

  return parsed.ok ? parsed.parsed.normalized : trimmed;
}

function presetKey(identity: PresetIdentity): string {
  return `${identity.scope}:${identity.name}`;
}
