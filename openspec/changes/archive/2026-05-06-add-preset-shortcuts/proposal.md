## Why

This change adds the _muscle-memory_ layer on top of the existing `/presets` command surface: alternative entry points that make presets fast to use without expanding the subcommand surface. It introduces two:

1. A `--preset <name>` CLI flag that activates a preset on session start.
2. Per-preset hotkeys: when a preset declares a `hotkey` field, pressing that combination activates the preset directly. Because pi has no `unregisterShortcut`, hotkey _changes_ require `/reload` — a documented limitation, surfaced in the editor.

## What Changes

- Register a `--preset <name>` CLI flag. In `session_start`, if the flag is set, look up the named preset and run a full apply. The flag overrides any session-restored preset (replacing a `priorUnknown` attachment with a real apply).
- Add `src/hotkeys.ts` exporting `registerHotkeys(pi, presetsLookup)` called once during `session_start`. For each preset with a non-empty `hotkey`, register a `pi.registerShortcut` whose handler activates that preset via the standard apply flow. The handler closes over a getter that reads the _current_ preset definition so editing the preset's behavior takes effect without `/reload`; only changes to the hotkey _itself_ require `/reload`.
- Conflict policy: if two loaded presets declare the same hotkey, the first one registered wins; the second SHALL be flagged with a `hotkeyConflict: true` indicator on the in-memory preset, which the picker renders as `⚠ hotkey conflict`.
- Built-in conflict warning at registration time: if a hotkey matches a documented pi built-in (Ctrl+L, Ctrl+P, etc.), emit a warning notification on session start naming the preset and the built-in it shadows. We still register the binding (the user said yes to the editor's warning at save time); we just remind them once per session.
- Update the editor's hotkey-changed notice from change 5 to be more concrete: "Hotkey takes effect after `/reload`. Existing binding (if any) remains until then."

## Capabilities

### New Capabilities

- `preset-shortcuts`: `--preset` CLI flag, per-preset hotkey registration, conflict detection (preset-vs-preset and preset-vs-built-in), and the documented `/reload` limitation for hotkey changes.

### Modified Capabilities

(None in delta-spec form.)

## Impact

- **One new CLI flag** parsed by pi at startup. No conflict with pi built-ins.
- **`pi.registerShortcut` is now called** for each preset with a hotkey, once per session at `session_start`. No new dependencies.
- **One known limitation**: per-preset hotkey changes (add, change, remove) require `/reload`. The editor surfaces a notice; this change does not work around it (no available API).
- **Coexistence note**: the `--preset` flag has the same name as the example `examples/extensions/preset.ts` flag. Pi assigns numeric suffixes when two extensions register the same flag, so users with both installed need to know which one handles bare `--preset`.
