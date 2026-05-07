/**
 * Runtime hotkey baseline used to decide whether `/reload` is still needed.
 *
 * Owns the in-memory snapshot of hotkeys registered for this extension runtime;
 * it does NOT own storage reads, conflict analysis, or shortcut registration.
 */
import { hotkeyChanged, type PresetIdentity } from "./hotkey-conflicts.js";
import type { LoadedPreset } from "./types.js";

const acknowledgedPendingHotkeys = new Map<string, string | undefined>();
const runtimeHotkeys = new Map<string, string | undefined>();

/** Clear runtime hotkey state for tests that exercise prompt decisions. */
export function clearRuntimeHotkeyBaseline(): void {
  acknowledgedPendingHotkeys.clear();
  runtimeHotkeys.clear();
}

/** Return whether deleting `identity` leaves runtime bindings out of date. */
export function deleteNeedsHotkeyReload(identity: PresetIdentity): boolean {
  return commitNeedsHotkeyReload(identity, undefined);
}

/** Remember a declined prompt so the same pending state is not re-prompted. */
export function recordReloadPromptDeclined(
  identity: PresetIdentity & { readonly hotkey?: string | undefined },
  hotkey = identity.hotkey,
): void {
  acknowledgedPendingHotkeys.set(presetKey(identity), hotkey);
}

/** Return whether saving `saved` leaves runtime bindings out of date. */
export function saveNeedsHotkeyReload(
  initial: PresetIdentity | undefined,
  saved: PresetIdentity & { readonly hotkey?: string | undefined },
): boolean {
  if (!commitNeedsHotkeyReload(saved, saved.hotkey)) return false;

  const initialRuntimeHotkey = runtimeHotkeyFor(initial);

  if (!hotkeyChanged(initialRuntimeHotkey, saved.hotkey)) {
    return (
      Boolean(initialRuntimeHotkey?.trim()) && identityChanged(initial, saved)
    );
  }

  return true;
}

/** Capture the hotkeys that are actually represented by this runtime. */
export function setRuntimeHotkeyBaseline(
  presets: readonly LoadedPreset[],
): void {
  acknowledgedPendingHotkeys.clear();
  runtimeHotkeys.clear();

  for (const preset of presets) {
    runtimeHotkeys.set(presetKey(preset), preset.hotkey);
  }
}

function acknowledgedPendingHotkeyMatches(
  identity: PresetIdentity & { readonly hotkey?: string | undefined },
): boolean {
  if (!acknowledgedPendingHotkeys.has(presetKey(identity))) return false;

  return !hotkeyChanged(
    acknowledgedPendingHotkeys.get(presetKey(identity)),
    identity.hotkey,
  );
}

function commitNeedsHotkeyReload(
  identity: PresetIdentity,
  hotkey: string | undefined,
): boolean {
  if (runtimeMatches(identity, hotkey)) {
    acknowledgedPendingHotkeys.delete(presetKey(identity));

    return false;
  }

  return !acknowledgedPendingHotkeyMatches({ ...identity, hotkey });
}

function identityChanged(
  prev: PresetIdentity | undefined,
  next: PresetIdentity,
): boolean {
  if (!prev) return false;

  return prev.name !== next.name || prev.scope !== next.scope;
}

function presetKey(identity: PresetIdentity): string {
  return `${identity.scope}:${identity.name}`;
}

function runtimeHotkeyFor(
  identity: PresetIdentity | undefined,
): string | undefined {
  if (!identity) return undefined;

  return runtimeHotkeys.get(presetKey(identity));
}

function runtimeMatches(
  identity: PresetIdentity,
  hotkey: string | undefined,
): boolean {
  return !hotkeyChanged(runtimeHotkeyFor(identity), hotkey);
}
