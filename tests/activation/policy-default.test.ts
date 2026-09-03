/**
 * Tests for fresh-session policy-default activation and precedence.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { LoadedPreset } from "../../src/types.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, loadPolicyMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  loadPolicyMock: vi.fn(),
}));

vi.mock("../../src/activation/apply.js", () => ({ apply: applyMock }));
vi.mock("../../src/store/policy.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/store/policy.js")>()),
  loadPolicy: loadPolicyMock,
}));

const { maybeApplyPolicyDefault } =
  await import("../../src/activation/policy-default.js");

const selected: LoadedPreset = {
  model: "claude-opus",
  name: "work-opus",
  provider: "anthropic",
  scope: "user",
};

function context() {
  const notify = vi.fn();

  return {
    ctx: {
      cwd: "/work/project",
      ui: { notify },
    } as unknown as ExtensionContext,
    notify,
  };
}

function matchingPolicy(pattern = "work-opus") {
  return {
    rules: [
      {
        allow: [],
        default: { field: "name", pattern, regex: new RegExp(pattern) },
        index: 0,
        match: "^/work/",
        matchRegex: /^\/work\//,
        prohibit: [],
      },
    ],
    warnings: [],
  };
}

beforeEach(() => {
  applyMock.mockReset();
  loadPolicyMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
  loadPolicyMock.mockResolvedValue(matchingPolicy());
});

describe("maybeApplyPolicyDefault", () => {
  it.each([
    ["flag", { flagApplied: true, restored: false }],
    ["successful restore", { flagApplied: false, restored: true }],
  ])(
    "does nothing when %s preempts the default",
    async (_label, precedence) => {
      const { ctx, notify } = context();

      await expect(
        maybeApplyPolicyDefault(
          [selected],
          ctx,
          {} as ExtensionAPI,
          new ActivePresetSession(),
          precedence,
        ),
      ).resolves.toBe(false);

      expect(loadPolicyMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it("applies after a failed restore without an additional success notification", async () => {
    const { ctx, notify } = context();
    const pi = {} as ExtensionAPI;
    const session = new ActivePresetSession();

    await expect(
      maybeApplyPolicyDefault([selected], ctx, pi, session, {
        flagApplied: false,
        restored: false,
      }),
    ).resolves.toBe(true);

    expect(applyMock).toHaveBeenCalledWith(selected, ctx, pi, session);
    expect(notify).not.toHaveBeenCalled();
  });

  it("warns and keeps the baseline when the default is unresolvable", async () => {
    const { ctx, notify } = context();

    loadPolicyMock.mockResolvedValue(matchingPolicy("missing"));

    await maybeApplyPolicyDefault(
      [selected],
      ctx,
      {} as ExtensionAPI,
      new ActivePresetSession(),
      { flagApplied: false, restored: false },
    );

    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("does not match any permitted preset"),
      "warning",
    );
  });

  it("treats apply refusal as a non-fatal warning", async () => {
    const { ctx, notify } = context();

    applyMock.mockResolvedValue({
      kind: "key-revoked",
      ok: false,
      reason: "Key was revoked.",
    });

    await expect(
      maybeApplyPolicyDefault(
        [selected],
        ctx,
        {} as ExtensionAPI,
        new ActivePresetSession(),
        { flagApplied: false, restored: false },
      ),
    ).resolves.toBe(false);

    expect(notify).toHaveBeenCalledWith("Key was revoked.", "warning");
  });
});
