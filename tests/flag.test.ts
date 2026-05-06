/**
 * Tests for startup `--preset` flag handling.
 */
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
});

describe("applyPresetFlag", () => {
  it("prefers project presets over shadowed user presets", async () => {
    const { ctx } = fakeCtx();
    const pi = fakePi("plan");
    const userPreset = preset("plan", "user", { shadowed: true });
    const projectPreset = preset("plan", "project");

    await applyPresetFlag(pi, ctx, [userPreset, projectPreset]);

    expect(applyMock).toHaveBeenCalledWith(projectPreset, ctx, pi);
  });

  it("deduplicates available names in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(fakePi("bad"), ctx, [
      preset("plan", "user", { shadowed: true }),
      preset("plan", "project"),
      preset("review", "user"),
    ]);

    expect(notify).toHaveBeenCalledWith(
      '--preset: unknown preset "bad". Available: plan, review.',
      "warning",
    );
  });

  it("marks unavailable entries in unknown-name warnings", async () => {
    const { ctx, notify } = fakeCtx();

    await applyPresetFlag(fakePi("bad"), ctx, [
      preset("plan", "project", { unavailable: "no-key" }),
    ]);

    expect(notify).toHaveBeenCalledWith(
      '--preset: unknown preset "bad". Available: plan (unavailable: no-key).',
      "warning",
    );
  });

  it("warns instead of applying unavailable presets", async () => {
    const { ctx, notify } = fakeCtx();
    const pi = fakePi("plan");

    await applyPresetFlag(pi, ctx, [
      preset("plan", "project", { unavailable: "no-key" }),
    ]);

    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      '--preset: "plan" is unavailable (no-key).',
      "warning",
    );
  });
});
