/**
 * Tests for the access-policy activation gate.
 */
import type { LoadedPreset } from "../../src/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPolicyMock = vi.hoisted(() => vi.fn());
const openPolicyOverrideMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/store/policy.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/store/policy.js")>()),
  loadPolicy: loadPolicyMock,
}));

vi.mock("../../src/ui/policy-overlay.js", () => ({
  openPolicyOverride: openPolicyOverrideMock,
}));

const { gateActivation } = await import("../../src/activation/policy-gate.js");

const allowed: LoadedPreset = {
  model: "claude-opus",
  name: "allowed",
  provider: "anthropic",
  scope: "user",
};

function context() {
  const notify = vi.fn();

  return {
    ctx: {
      cwd: "/work/project",
      ui: { notify },
    } as unknown as Pick<ExtensionContext, "cwd" | "ui">,
    notify,
  };
}

beforeEach(() => {
  loadPolicyMock.mockReset();
  openPolicyOverrideMock.mockReset();
  loadPolicyMock.mockResolvedValue({ rules: [], warnings: [] });
});

describe("gateActivation", () => {
  it("passes permitted activations without opening the overlay", async () => {
    const { ctx } = context();

    await expect(gateActivation(allowed, ctx)).resolves.toBe(true);
    expect(openPolicyOverrideMock).not.toHaveBeenCalled();
  });

  it.each([
    ["override", true],
    ["cancel", false],
  ])(
    "returns the %s overlay outcome for a prohibited preset",
    async (_label, outcome) => {
      const { ctx } = context();

      loadPolicyMock.mockResolvedValue({
        rules: [
          {
            allow: [],
            index: 0,
            match: "work",
            matchRegex: /work/,
            prohibit: [{ field: "name", pattern: "allowed", regex: /allowed/ }],
          },
        ],
        warnings: [],
      });
      openPolicyOverrideMock.mockResolvedValue(outcome);

      await expect(gateActivation(allowed, ctx)).resolves.toBe(outcome);
      expect(openPolicyOverrideMock).toHaveBeenCalledWith(ctx, allowed);
    },
  );

  it("surfaces loader warnings as one notification", async () => {
    const { ctx, notify } = context();

    loadPolicyMock.mockResolvedValue({
      rules: [],
      warnings: ["First warning.", "Second warning."],
    });

    await gateActivation(allowed, ctx);

    expect(notify).toHaveBeenCalledWith(
      "First warning.\nSecond warning.",
      "warning",
    );
  });
});
