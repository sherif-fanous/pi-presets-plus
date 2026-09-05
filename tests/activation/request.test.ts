/**
 * Tests for user-requested activation orchestration.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, gateActivationMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  gateActivationMock: vi.fn(),
}));

vi.mock("../../src/activation/apply.js", () => ({ apply: applyMock }));
vi.mock("../../src/activation/policy-gate.js", () => ({
  gateActivation: gateActivationMock,
}));

const { requestActivation } = await import("../../src/activation/request.js");

const preset: LoadedPreset = {
  model: "claude-opus",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};
const ctx = {} as ExtensionContext;
const pi = {} as ExtensionAPI;

beforeEach(() => {
  applyMock.mockReset();
  gateActivationMock.mockReset();
  gateActivationMock.mockResolvedValue(true);
});

describe("requestActivation", () => {
  it("applies and returns the exact result when policy permits activation", async () => {
    const session = new ActivePresetSession();
    const result = {
      kind: "no-key",
      ok: false,
      reason: "No API key.",
    } as const;

    applyMock.mockResolvedValue(result);

    await expect(requestActivation(preset, ctx, pi, session)).resolves.toBe(
      result,
    );
    expect(gateActivationMock).toHaveBeenCalledWith(preset, ctx);
    expect(applyMock).toHaveBeenCalledWith(preset, ctx, pi, session);
  });

  it("returns cancellation without applying when policy denies activation", async () => {
    gateActivationMock.mockResolvedValue(false);

    await expect(
      requestActivation(preset, ctx, pi, new ActivePresetSession()),
    ).resolves.toEqual({
      kind: "cancelled",
      ok: false,
      reason: "Activation cancelled.",
    });
    expect(applyMock).not.toHaveBeenCalled();
  });
});
