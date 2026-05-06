/**
 * Tests for per-preset hotkey registration behavior.
 */
import { annotateAndAnalyzeHotkeys } from "../src/hotkey-conflicts.js";
import type { LoadedPreset } from "../src/types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyMock = vi.fn();

vi.mock("../src/activation/apply.js", () => ({
  apply: applyMock,
}));

const { registerHotkeys } = await import("../src/hotkeys.js");

interface RegisteredShortcut {
  readonly description?: string;
  readonly handler: (ctx: ExtensionContext) => unknown;
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
});

describe("registerHotkeys", () => {
  it("registers normalized keys and skips losing conflicts", () => {
    const { ctx, notify } = fakeCtx();
    const { pi, registerShortcut } = fakePi();

    const presets = [
      preset("plan", "Shift + CTRL + 1"),
      preset("review", "ctrl+shift+1"),
      preset("ship", "alt+s"),
    ];

    registerHotkeys(pi, ctx, presets, annotateAndAnalyzeHotkeys(presets), () =>
      Promise.resolve(presets),
    );

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
      expect.stringContaining('conflicts with preset "plan" (user)'),
      "warning",
    );
  });

  it("warns about invalid hotkeys", () => {
    const { ctx, notify } = fakeCtx();
    const { pi, registerShortcut } = fakePi();
    const presets = [preset("plan", "ctrl+ctrl+p")];

    registerHotkeys(pi, ctx, presets, annotateAndAnalyzeHotkeys(presets), () =>
      Promise.resolve(presets),
    );

    expect(registerShortcut).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan": invalid hotkey "ctrl+ctrl+p" — ignored (duplicate modifier "ctrl"). It will not be registered or considered for conflicts until fixed.',
      "warning",
    );
  });

  it("notifies when a hotkey shadows a pi built-in", () => {
    const { ctx, notify } = fakeCtx();
    const { pi } = fakePi();
    const presets = [preset("plan", "ctrl+l")];

    registerHotkeys(pi, ctx, presets, annotateAndAnalyzeHotkeys(presets), () =>
      Promise.resolve(presets),
    );

    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" hotkey "ctrl+l" shadows a pi built-in. The preset binding will take precedence.',
      "info",
    );
  });

  it("skips shadowed presets", () => {
    const { ctx } = fakeCtx();
    const { pi, registerShortcut } = fakePi();
    const presets = [
      preset("plan", "ctrl+shift+1", "user", { shadowed: true }),
      preset("plan", "ctrl+shift+2", "project"),
    ];

    registerHotkeys(pi, ctx, presets, annotateAndAnalyzeHotkeys(presets), () =>
      Promise.resolve(presets),
    );

    expect(registerShortcut).toHaveBeenCalledTimes(1);
    expect(registerShortcut).toHaveBeenCalledWith(
      "ctrl+shift+2",
      expect.objectContaining({ description: 'Activate preset "plan"' }),
    );
  });

  it("loads current preset data when a hotkey is pressed", async () => {
    const { ctx } = fakeCtx();
    const { pi, shortcuts } = fakePi();
    const stale = preset("plan", "ctrl+shift+1");
    const current = { ...stale, model: "new-model" };

    const loadCurrentPresets = vi.fn(() => Promise.resolve([current]));

    applyMock.mockResolvedValue({ ok: true });
    registerHotkeys(
      pi,
      ctx,
      [stale],
      annotateAndAnalyzeHotkeys([stale]),
      loadCurrentPresets,
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(loadCurrentPresets).toHaveBeenCalledWith(ctx);
    expect(applyMock).toHaveBeenCalledWith(current, ctx, pi);
  });

  it("warns instead of applying when the current preset becomes unavailable", async () => {
    const { ctx, notify } = fakeCtx();
    const { pi, shortcuts } = fakePi();
    const stale = preset("plan", "ctrl+shift+1");
    const current = preset("plan", "ctrl+shift+1", "user", {
      unavailable: "no-key",
    });

    registerHotkeys(pi, ctx, [stale], annotateAndAnalyzeHotkeys([stale]), () =>
      Promise.resolve([current]),
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" is unavailable (no-key).',
      "warning",
    );
  });

  it("reports apply errors from the defense-in-depth handler guard", async () => {
    const { ctx, notify } = fakeCtx();
    const { pi, shortcuts } = fakePi();
    const current = preset("plan", "ctrl+shift+1");

    applyMock.mockRejectedValue(new Error("boom"));
    registerHotkeys(
      pi,
      ctx,
      [current],
      annotateAndAnalyzeHotkeys([current]),
      () => Promise.resolve([current]),
    );

    await shortcuts.get("ctrl+shift+1")?.handler(ctx as ExtensionContext);

    expect(notify).toHaveBeenCalledWith(
      'pi-presets-plus failed to activate preset "plan" from hotkey: boom',
      "error",
    );
  });

  it("warns instead of applying when the current preset disappeared", async () => {
    const { ctx, notify } = fakeCtx();
    const { pi, shortcuts } = fakePi();

    const presets = [preset("plan", "ctrl+shift+1")];

    registerHotkeys(pi, ctx, presets, annotateAndAnalyzeHotkeys(presets), () =>
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
