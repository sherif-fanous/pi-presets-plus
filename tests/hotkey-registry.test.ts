/**
 * Tests for hotkey registry analysis, binding, and reload-prompt decisions.
 */
import { ActivePresetSession } from "../src/activation/session.js";
import {
  analyzeHotkeys,
  formatPresetIdentity,
  hotkeyChanged,
  HotkeyRegistry,
} from "../src/hotkey-registry.js";
import type { LoadedPreset } from "../src/types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyMock = vi.hoisted(() => vi.fn());

vi.mock("../src/activation/apply.js", () => ({
  apply: applyMock,
}));

interface RegisteredShortcut {
  readonly description?: string;
  readonly handler: (ctx: ExtensionContext) => unknown;
}

function bind(
  registry: HotkeyRegistry,
  presets: LoadedPreset[],
  loadCurrentPresets = () => Promise.resolve(presets),
) {
  const { ctx, notify } = fakeCtx();
  const { pi, registerShortcut, shortcuts } = fakePi();
  const session = new ActivePresetSession();

  registry.bindForSession(
    presets,
    analyzeHotkeys(presets),
    ctx,
    pi,
    loadCurrentPresets,
    session,
  );

  return { ctx, notify, pi, registerShortcut, session, shortcuts };
}

function fakeCtx() {
  const notify = vi.fn();

  return {
    ctx: {
      cwd: "/tmp/project",
      modelRegistry: {},
      ui: { notify },
    } as unknown as Pick<ExtensionContext, "ui">,
    notify,
  };
}

function fakePi() {
  const shortcuts = new Map<string, RegisteredShortcut>();
  const registerShortcut = vi.fn(
    (key: KeyId, options: RegisteredShortcut): void => {
      shortcuts.set(key, options);
    },
  );

  return {
    pi: { registerShortcut } as unknown as ExtensionAPI,
    registerShortcut,
    shortcuts,
  };
}

function preset(
  name: string,
  hotkey: string | undefined,
  scope: LoadedPreset["scope"] = "user",
  extra: Partial<LoadedPreset> = {},
): LoadedPreset {
  return {
    ...extra,
    hotkey,
    model: "claude-opus-4.5",
    name,
    provider: "anthropic",
    scope,
  };
}

beforeEach(() => {
  applyMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
});

describe("hotkeyChanged", () => {
  it.each([
    ["both empty", "", "", false],
    ["both undefined", undefined, undefined, false],
    ["one empty and one whitespace", "", "   ", false],
    ["same hotkey", "ctrl+1", "ctrl+1", false],
    ["equivalent hotkey casing", "Ctrl+1", "ctrl+1", false],
    ["equivalent modifier order", "shift+ctrl+1", "ctrl+shift+1", false],
    ["different hotkeys", "ctrl+1", "ctrl+2", true],
    ["removed hotkey", "ctrl+1", "", true],
    ["added hotkey", "", "ctrl+1", true],
  ])("detects %s", (_label, prev, next, expected) => {
    expect(hotkeyChanged(prev, next)).toBe(expected);
  });
});

describe("formatPresetIdentity", () => {
  it("formats name and scope without making scope look like part of the name", () => {
    expect(formatPresetIdentity({ name: "plan", scope: "project" })).toBe(
      '"plan" (project)',
    );
  });
});

describe("analyzeHotkeys", () => {
  it("marks only later presets with the same normalized hotkey", () => {
    const presets = [
      preset("plan", "ctrl+shift+1", "user"),
      preset("review", "shift+ctrl+1", "project"),
      preset("ship", "alt+s", "user"),
    ];

    const analysis = analyzeHotkeys(presets);

    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBe(true);
    expect(presets[2]?.hotkeyConflict).toBeUndefined();
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0]?.winner).toEqual({
      name: "plan",
      scope: "user",
    });
    expect(analysis.parsed.size).toBe(3);
    expect(analysis.invalid).toEqual([]);
  });

  it("clears stale conflict markers before recomputing", () => {
    const presets = [
      { ...preset("plan", "ctrl+shift+1"), hotkeyConflict: true as const },
      { ...preset("review", "ctrl+shift+2"), hotkeyConflict: true as const },
    ];

    const analysis = analyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(presets[0]?.hotkeyConflict).toBeUndefined();
    expect(presets[1]?.hotkeyConflict).toBeUndefined();
  });

  it("reports invalid hotkeys and excludes them from parsed hotkeys", () => {
    const presets = [preset("plan", "ctrl+ctrl+p")];
    const analysis = analyzeHotkeys(presets);

    expect(analysis.conflicts).toEqual([]);
    expect(analysis.invalid).toHaveLength(1);
    expect(analysis.invalid[0]?.reason).toBe('duplicate modifier "ctrl"');
    expect(analysis.parsed.size).toBe(0);
  });

  it("annotates Pi built-in shadowing and clears stale markers", () => {
    const builtin = preset("plan", "ctrl+l");
    const ordinary = preset("review", "ctrl+shift+9");
    const empty = preset("ship", undefined);
    const malformed = preset("debug", "ctrl+ctrl+p");

    analyzeHotkeys([builtin, ordinary, empty, malformed]);

    expect(builtin.hotkeyShadowsBuiltin).toBe(true);
    expect(ordinary.hotkeyShadowsBuiltin).toBeUndefined();
    expect(empty.hotkeyShadowsBuiltin).toBeUndefined();
    expect(malformed.hotkeyShadowsBuiltin).toBeUndefined();

    builtin.hotkey = "ctrl+shift+9";

    analyzeHotkeys([builtin]);

    expect(builtin.hotkeyShadowsBuiltin).toBeUndefined();
  });

  it("annotates shadowed presets that use Pi built-in hotkeys", () => {
    const shadowed = { ...preset("plan", "ctrl+l"), shadowed: true };

    analyzeHotkeys([shadowed]);

    expect(shadowed.hotkeyShadowsBuiltin).toBe(true);
  });
});

describe("HotkeyRegistry.bindForSession", () => {
  it("registers normalized keys, skips losing conflicts, and captures baseline", () => {
    const registry = new HotkeyRegistry();
    const presets = [
      preset("plan", "Shift + CTRL + 1"),
      preset("review", "ctrl+shift+1"),
      preset("ship", "alt+s"),
    ];

    const { notify, registerShortcut } = bind(registry, presets);

    expect(registerShortcut).toHaveBeenCalledTimes(2);
    expect(registerShortcut).toHaveBeenCalledWith(
      "ctrl+shift+1",
      expect.objectContaining({ description: 'Activate preset "plan"' }),
    );

    expect(registerShortcut).toHaveBeenCalledWith(
      "alt+s",
      expect.objectContaining({ description: 'Activate preset "ship"' }),
    );

    expect(notify).toHaveBeenCalledWith(
      'Preset "review" hotkey "ctrl+shift+1" conflicts with preset "plan" (user). The first registered wins.',
      "warning",
    );

    expect(registry.deleteNeedsReload({ name: "plan", scope: "user" })).toBe(
      true,
    );
  });

  it("warns about invalid hotkeys", () => {
    const registry = new HotkeyRegistry();
    const presets = [preset("plan", "ctrl+ctrl+p")];

    const { notify, registerShortcut } = bind(registry, presets);

    expect(registerShortcut).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan": invalid hotkey "ctrl+ctrl+p" — ignored (duplicate modifier "ctrl"). It will not be registered or considered for conflicts until fixed.',
      "warning",
    );
  });

  it("notifies when a hotkey shadows a Pi built-in", () => {
    const registry = new HotkeyRegistry();

    const { notify } = bind(registry, [preset("plan", "ctrl+l")]);

    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" hotkey "ctrl+l" shadows a Pi built-in. The preset binding will take precedence.',
      "warning",
    );
  });

  it("uses warning severity for both collision-style notifications", () => {
    const registry = new HotkeyRegistry();

    const { notify } = bind(registry, [
      preset("plan", "ctrl+l"),
      preset("review", "ctrl+l"),
    ]);

    expect(notify.mock.calls).toEqual([
      [
        'Preset "review" hotkey "ctrl+l" conflicts with preset "plan" (user). The first registered wins.',
        "warning",
      ],
      [
        'Preset "plan" hotkey "ctrl+l" shadows a Pi built-in. The preset binding will take precedence.',
        "warning",
      ],
    ]);
  });

  it("skips shadowed presets", () => {
    const registry = new HotkeyRegistry();
    const presets = [
      preset("plan", "ctrl+shift+1", "user", { shadowed: true }),
      preset("plan", "ctrl+shift+2", "project"),
    ];

    const { registerShortcut } = bind(registry, presets);

    expect(registerShortcut).toHaveBeenCalledTimes(1);
    expect(registerShortcut).toHaveBeenCalledWith(
      "ctrl+shift+2",
      expect.objectContaining({ description: 'Activate preset "plan"' }),
    );
  });

  it("loads current preset data when a hotkey is pressed", async () => {
    const registry = new HotkeyRegistry();
    const stale = preset("plan", "ctrl+shift+1");
    const current = { ...stale, model: "new-model" };
    const loadCurrentPresets = vi.fn(() => Promise.resolve([current]));

    const { ctx, pi, session, shortcuts } = bind(
      registry,
      [stale],
      loadCurrentPresets,
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(loadCurrentPresets).toHaveBeenCalledWith(ctx);
    expect(applyMock).toHaveBeenCalledWith(current, ctx, pi, session);
  });

  it("notifies once when hotkey activation is refused", async () => {
    const registry = new HotkeyRegistry();
    const stale = preset("plan", "ctrl+shift+1");
    const current = preset("plan", "ctrl+shift+1", "user", {
      unavailable: "no-key",
    });

    applyMock.mockResolvedValueOnce({
      kind: "no-key",
      ok: false,
      reason:
        'Preset "plan" is unavailable: missing API key. Activation skipped.',
    });

    const { ctx, notify, pi, session, shortcuts } = bind(
      registry,
      [stale],
      () => Promise.resolve([current]),
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(applyMock).toHaveBeenCalledWith(current, ctx, pi, session);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" is unavailable: missing API key. Activation skipped.',
      "error",
    );
  });

  it("reports apply errors from the defense-in-depth handler guard", async () => {
    const registry = new HotkeyRegistry();
    const current = preset("plan", "ctrl+shift+1");

    applyMock.mockRejectedValue(new Error("boom"));

    const { ctx, notify, shortcuts } = bind(registry, [current], () =>
      Promise.resolve([current]),
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(notify).toHaveBeenCalledWith(
      'pi-presets-plus failed to activate preset "plan" from hotkey: boom.',
      "error",
    );
  });

  it("warns instead of applying when the current preset disappeared", async () => {
    const registry = new HotkeyRegistry();
    const presets = [preset("plan", "ctrl+shift+1")];

    const { ctx, notify, shortcuts } = bind(registry, presets, () =>
      Promise.resolve([]),
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" no longer exists.',
      "warning",
    );
  });
});

describe("HotkeyRegistry reload decisions", () => {
  it("reports save/delete reload needs and suppresses repeated declined prompts", () => {
    const registry = new HotkeyRegistry();
    const initial = preset("plan", "ctrl+1");

    bind(registry, [initial]);

    const changed = { ...initial, hotkey: "ctrl+2" };

    expect(registry.saveNeedsReload(initial, changed)).toBe(true);

    registry.recordReloadPromptDeclined(changed);

    expect(registry.saveNeedsReload(initial, changed)).toBe(false);
    expect(registry.deleteNeedsReload(initial)).toBe(true);
  });

  it("prompts when identity moves with an unchanged runtime hotkey", () => {
    const registry = new HotkeyRegistry();
    const initial = preset("plan", "ctrl+1", "user");

    bind(registry, [initial]);

    expect(
      registry.saveNeedsReload(initial, preset("plan", "ctrl+1", "project")),
    ).toBe(true);
  });
});
