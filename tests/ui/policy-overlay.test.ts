/**
 * Tests for policy override confirmation copy and labels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const openConfirmMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/ui/confirm.js", () => ({ openConfirm: openConfirmMock }));

const { openPolicyOverride } = await import("../../src/ui/policy-overlay.js");

beforeEach(() => {
  openConfirmMock.mockReset();
  openConfirmMock.mockResolvedValue(false);
});

describe("openPolicyOverride", () => {
  it("names the preset and offers Override and Cancel", async () => {
    const ctx = { ui: {} } as Parameters<typeof openPolicyOverride>[0];

    await openPolicyOverride(ctx, { name: "personal-opus" });

    expect(openConfirmMock).toHaveBeenCalledWith(
      ctx,
      "Preset Doesn't Match Policy",
      expect.stringContaining('preset "personal-opus"'),
      { no: "Cancel", yes: "Override" },
    );
  });
});
