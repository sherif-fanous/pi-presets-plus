## Context

This change adds the muscle-memory layer on top of the now-feature-complete `pi-presets-plus`. Two entry points are introduced — CLI flag and per-preset hotkeys — neither of which adds new core capability. They both hook into the existing activation flow from change 3 without expanding the `/presets` subcommand surface.

The most interesting design constraint here is the absence of `pi.unregisterShortcut`. We ship per-preset hotkeys anyway by deciding upfront how to live with that gap, and surfacing it honestly in the editor.

## Goals / Non-Goals

**Goals**

- `--preset <name>` works at startup and overrides any session-restored attachment.
- Per-preset hotkeys work without `/reload` for behavior changes; require `/reload` only for hotkey-string changes.
- Conflict detection is honest: preset-vs-preset and preset-vs-pi-built-in.

**Non-Goals**

- A workaround for `unregisterShortcut`. Pi doesn't expose one; we don't fake one.
- `/presets next` / `/presets prev` cycle commands. The dialog remains the command surface for browsing/switching presets; this change does not add cycling subcommands.
- Global hotkey for opening the picker (`Ctrl+Shift+L` style). Easy to add later if users ask; not in v1.
- Hotkey _re-registration_ on file edit. Even if we could detect a save, we can't unregister the old binding. Saves take effect on `/reload`.

## Decisions

### `--preset <name>` CLI flag

```ts
pi.registerFlag("preset", {
  description: "Activate the named pi-presets-plus preset on session start.",
  type: "string",
});

pi.on("session_start", async (event, ctx) => {
  // … existing reload, restore, hotkey-register flow …

  const flagValue = pi.getFlag("--preset");
  if (typeof flagValue === "string" && flagValue.length > 0) {
    const preset = lookup(flagValue); // try project then user scope
    if (!preset) {
      ctx.ui.notify(
        `--preset: unknown preset "${flagValue}". Available: ${availableNames().join(", ")}`,
        "warning",
      );
      return;
    }
    if (preset.unavailable) {
      ctx.ui.notify(
        `--preset: "${flagValue}" is unavailable (${preset.unavailable}).`,
        "warning",
      );
      return;
    }
    // Override any priorUnknown attachment from restore.
    await activation.apply(preset); // full apply, not soft attach
  }
});
```

The override-on-restore behavior is important: if the user runs `pi --resume some-session --preset plan` and the restored session already had `plan` attached, restore would build a `priorUnknown` attachment, but the flag tells us the user wants the preset _actually applied_. So the flag wins and triggers a full apply that captures a real snapshot.

If two extensions register `--preset` (e.g. the example `preset.ts` is installed alongside this package), pi assigns numeric suffixes. We document this; the recommendation is to uninstall the example.

### Per-preset hotkeys

```ts
// src/hotkeys.ts
export function registerHotkeys(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  getPresets: () => LoadedPreset[],
) {
  const claimed = new Map<string, string>(); // hotkey → first preset's name
  const conflicts = new Set<string>(); // preset names that lost a conflict

  for (const preset of getPresets()) {
    if (!preset.hotkey) continue;
    const parsed = parseHotkey(preset.hotkey);
    if (!parsed.ok) {
      ctx.ui.notify(
        `Preset "${preset.name}": invalid hotkey "${preset.hotkey}" — ignored.`,
        "warning",
      );
      continue;
    }

    const normalized = parsed.normalized;
    if (claimed.has(normalized)) {
      conflicts.add(preset.name);
      ctx.ui.notify(
        `Preset "${preset.name}" hotkey "${preset.hotkey}" conflicts with preset "${claimed.get(normalized)}". The first registered wins.`,
        "warning",
      );
      continue; // do NOT register the losing one
    }
    claimed.set(normalized, preset.name);

    if (isPiBuiltin(parsed)) {
      ctx.ui.notify(
        `Preset "${preset.name}" hotkey "${preset.hotkey}" shadows a pi built-in. The preset's binding will take precedence.`,
        "info",
      );
    }

    pi.registerShortcut(preset.hotkey, {
      description: `Activate preset "${preset.name}"`,
      handler: async (handlerCtx) => {
        // Re-fetch the current preset definition (handles edit-without-reload).
        const current = getPresets().find(
          (p) => p.name === preset.name && p.scope === preset.scope,
        );
        if (!current) {
          handlerCtx.ui.notify(
            `Preset "${preset.name}" no longer exists.`,
            "warning",
          );
          return;
        }
        if (current.unavailable) {
          handlerCtx.ui.notify(
            `Preset "${preset.name}" is unavailable (${current.unavailable}).`,
            "warning",
          );
          return;
        }
        await activation.apply(current);
      },
    });
  }

  // Mark the loaded list with conflict indicators for the picker.
  for (const preset of getPresets()) {
    if (conflicts.has(preset.name)) (preset as any).hotkeyConflict = true;
  }
}
```

Two key properties of this design:

1. **Closure over `getPresets()`, not over `preset`.** The handler reads the current definition each time it fires. If the user edits the preset's model/thinking/tools/instructions, the next press of the hotkey applies the _new_ definition. No `/reload` needed.
2. **Hotkey changes still need `/reload`.** Pi has no `unregisterShortcut`, so we cannot remove the old binding. The editor's notice (added in change 5; clarified in this change) makes this clear: "Hotkey takes effect after `/reload`. Existing binding (if any) remains until then."

### Conflict indicators

`hotkeyConflict: true` is added to the in-memory `LoadedPreset` for any preset that lost a conflict. Add the field to the type extension list. The picker (change 4 with change 5 extensions) renders `⚠ hotkey conflict` in the right column similar to `⚠ no key`.

### Built-in conflict warning

A static list of pi built-ins is maintained in `src/ui/hotkey-input.ts` (change 5). At registration time we cross-check; if the preset's hotkey matches a built-in, we emit an info-level notification once at session start. We do NOT refuse to register — the user has already confirmed in the editor at save time; reminding them is sufficient.

### Editor copy update (change-5 hold-over)

Change 5 introduced a "/reload required" notice for hotkey changes. This change refines the wording to be precise:

```
Hotkey changed:
  Old: ctrl+shift+1
  New: ctrl+shift+2

Takes effect after /reload. The old binding (ctrl+shift+1) remains active
until you /reload, because pi has no API to unregister shortcuts.
```

Same notice when a hotkey is removed:

```
Hotkey removed (was: ctrl+shift+1).
Takes effect after /reload. The old binding remains active until then.
```

## Risks / Trade-offs

- **`--preset` flag collision** with the example `preset.ts`. Mitigation: documented; recommend uninstalling the example.
- **Hotkey conflicts that the user resolves silently** (rename one preset's hotkey) still require `/reload` to take effect. Mitigation: documented; just one of the consequences of the no-unregister API.
- **A preset can lose its conflict during edit**: e.g. preset A wins over B; user removes A's hotkey via the editor; `loadAll` rebuilds the in-memory list with B no longer marked as conflicting; but B's hotkey is still not registered until `/reload`. Mitigation: editor's notice covers this case ("Hotkey takes effect after /reload"); if needed, run `/reload`.
- **Built-in conflict notification can be noisy** in sessions with multiple presets that override built-ins. Mitigation: emitted once per session at registration time; we do not re-emit per keypress.
