/**
 * Tests for startup `--preset` flag handling.
 */
import { ActivePresetSession } from "../src/activation/session.js";
import type { LoadedPreset } from "../src/types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyMock = vi.fn();

vi.mock("../src/activation/apply.js", () => ({
  apply: applyMock,
}));

const { applyPresetFlag } = await import("../src/flag.js");

function fakeCtx() {
  const notify = vi.fn();

  return {
    ctx: { ui: { notify } } as unknown as ExtensionContext,
    notify,
  };
}

function fakePi(value: string | undefined) {
  return {
    getFlag: vi.fn(() => value),
  } as unknown as ExtensionAPI;
}

function preset(
  name: string,
  scope: LoadedPreset["scope"],
  options: {
    shadowed?: boolean;
    unavailable?: LoadedPreset["unavailable"];
  } = {},
): LoadedPreset {
  return {
    ...(options.shadowed ? { shadowed: true as const } : {}),
    ...(options.unavailable ? { unavailable: options.unavailable } : {}),
    model: `${scope}-model`,
    name,
    provider: "anthropic",
    scope,
  };
}

beforeEach(() => {
  applyMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
});

describe("applyPresetFlag", () => {
  it("prefers project presets over shadowed user presets", async () => {
    const { ctx } = fakeCtx();
    const pi = fakePi("plan");
    const userPreset = preset("plan", "user", { shadowed: true });
    const projectPreset = preset("plan", "project");

    const session = new ActivePresetSession();

    await applyPresetFlag(pi, ctx, [userPreset, projectPreset], session);

    expect(applyMock).toHaveBeenCalledWith(projectPreset, ctx, pi, session);
  });

  it("deduplicates available names in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(
      fakePi("bad"),
      ctx,
      [
        preset("plan", "user", { shadowed: true }),
        preset("plan", "project"),
        preset("review", "user"),
      ],
      new ActivePresetSession(),
    );

    expect(notify).toHaveBeenCalledWith(
      '--preset: Unknown preset "bad". Available: plan, review.',
      "warning",
    );
  });

  it("marks unavailable entries in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(
      fakePi("bad"),
      ctx,
      [preset("plan", "project", { unavailable: "no-key" })],
      new ActivePresetSession(),
    );

    expect(notify).toHaveBeenCalledWith(
      '--preset: Unknown preset "bad". Available: plan (Unavailable: no-key).',
      "warning",
    );
  });

  it("notifies once when activation refuses a preset", async () => {
    const { ctx, notify } = fakeCtx();
    const pi = fakePi("plan");
    const selected = preset("plan", "project", { unavailable: "no-key" });

    applyMock.mockResolvedValueOnce({
      kind: "no-key",
      ok: false,
      reason:
        'Preset "plan" is unavailable: missing API key. Activation skipped.',
    });

    const session = new ActivePresetSession();

    await applyPresetFlag(pi, ctx, [selected], session);

    expect(applyMock).toHaveBeenCalledWith(selected, ctx, pi, session);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'Preset "plan" is unavailable: missing API key. Activation skipped.',
      "error",
    );
  });
});
