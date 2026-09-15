/**
 * Covers policy-default startup eligibility, precedence, resolution, and
 * unchanged apply outcomes.
 */
import { ActivePresetSession } from "../../src/activation/session.js";
import type { StartupSelection } from "../../src/activation/startup-selection.js";
import type { LoadedPreset } from "../../src/types.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, isAutomaticDefaultEligibleMock, loadPolicyMock } =
  vi.hoisted(() => ({
    applyMock: vi.fn(),
    isAutomaticDefaultEligibleMock: vi.fn(),
    loadPolicyMock: vi.fn(),
  }));

vi.mock("../../src/activation/apply.js", () => ({ apply: applyMock }));
vi.mock("../../src/activation/startup-selection.js", () => ({
  isAutomaticDefaultEligible: isAutomaticDefaultEligibleMock,
}));

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
const configuredModel = {
  id: "gpt",
  provider: "openai",
  reasoning: true,
} as Model<Api>;
const captured: StartupSelection = {
  model: { id: "gpt", provider: "openai" },
  thinkingLevel: "medium",
};

async function applyDefault(
  ctx: ExtensionContext,
  precedence = { flagApplied: false, restored: false },
  startup = captured,
) {
  const pi = {} as ExtensionAPI;
  const session = new ActivePresetSession();
  const result = await maybeApplyPolicyDefault(
    [selected],
    ctx,
    pi,
    session,
    precedence,
    startup,
  );

  return { pi, result, session };
}

function context(mode: ExtensionContext["mode"] = "tui") {
  const notify = vi.fn();

  return {
    ctx: {
      cwd: "/work/project",
      isProjectTrusted: () => true,
      mode,
      modelRegistry: { find: vi.fn(() => configuredModel) },
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
  isAutomaticDefaultEligibleMock.mockReset();
  loadPolicyMock.mockReset();
  applyMock.mockResolvedValue({ ok: true });
  isAutomaticDefaultEligibleMock.mockReturnValue(true);
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
      const { result } = await applyDefault(ctx, precedence);

      expect(result).toBe(false);
      expect(loadPolicyMock).not.toHaveBeenCalled();
      expect(isAutomaticDefaultEligibleMock).not.toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it("keeps policy warnings visible before an ineligible return", async () => {
    const { ctx, notify } = context("print");

    isAutomaticDefaultEligibleMock.mockReturnValue(false);
    loadPolicyMock.mockResolvedValue({
      ...matchingPolicy(),
      warnings: ["Policy warning."],
    });

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(isAutomaticDefaultEligibleMock).toHaveBeenCalledWith(captured, ctx);
    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Policy warning.",
      "warning",
    );
  });

  it("silently skips when startup comparison is ineligible", async () => {
    const { ctx, notify } = context();

    isAutomaticDefaultEligibleMock.mockReturnValue(false);

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips unresolved settings without hiding policy warnings", async () => {
    const { ctx, notify } = context();

    loadPolicyMock.mockResolvedValue({
      ...matchingPolicy(),
      warnings: ["Policy warning."],
    });

    isAutomaticDefaultEligibleMock.mockReturnValue(false);

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(applyMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Policy warning.",
      "warning",
    );
  });

  it("does not report an unresolvable default when comparison fails", async () => {
    const { ctx, notify } = context();

    loadPolicyMock.mockResolvedValue(matchingPolicy("missing"));

    isAutomaticDefaultEligibleMock.mockReturnValue(false);

    await applyDefault(ctx);

    expect(notify).not.toHaveBeenCalled();
  });

  it("applies after a failed restore with one success notification", async () => {
    const { ctx, notify } = context();
    const { pi, result, session } = await applyDefault(ctx);

    expect(result).toBe(true);
    expect(applyMock).toHaveBeenCalledWith(selected, ctx, pi, session);
    expect(notify).toHaveBeenCalledWith('Preset "work-opus" applied.', "info");
  });

  it("warns and keeps the baseline when the default is unresolvable", async () => {
    const { ctx, notify } = context();

    loadPolicyMock.mockResolvedValue(matchingPolicy("missing"));

    await applyDefault(ctx);

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

    const { result } = await applyDefault(ctx);

    expect(result).toBe(false);
    expect(notify).toHaveBeenCalledWith("Key was revoked.", "warning");
  });
});
