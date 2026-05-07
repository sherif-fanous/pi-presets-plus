/**
 * Tests for the compact preset footer indicator.
 *
 * Asserts that `updateStatus` renders `preset: <name>` while a known active
 * preset is attached and `Preset: none` otherwise (no active, or a name
 * that the lookup cannot resolve). The indicator intentionally omits
 * model/thinking — Pi's built-in footer already shows them.
 */
import type { ActivePresetState, LoadedPreset } from "../../src/types.js";
import { updateStatus } from "../../src/ui/status.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

const preset: LoadedPreset = {
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
};

function harness() {
  const status: Record<string, string | undefined> = {};

  return {
    status,
    ctx: {
      ui: {
        setStatus(key: string, value: string | undefined) {
          status[key] = value;
        },
        theme: { fg: (_color: string, text: string) => text },
      },
    } as unknown as Pick<ExtensionContext, "ui">,
  };
}

describe("updateStatus", () => {
  it("renders Preset: none when no preset is active", () => {
    const { ctx, status } = harness();

    updateStatus(ctx, undefined, () => undefined);

    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("renders the active preset name when the lookup resolves it", () => {
    const { ctx, status } = harness();
    const active: ActivePresetState = {
      declared: { model: "claude", provider: "anthropic" },
      dirty: false,
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    };

    updateStatus(ctx, active, (name, scope) =>
      name === "plan" && scope === "project" ? preset : undefined,
    );

    expect(status["presets-plus"]).toBe("Preset: plan");
  });

  it("appends a warning marker when the active preset is dirty", () => {
    const { ctx, status } = harness();
    const active: ActivePresetState = {
      declared: { model: "claude", provider: "anthropic" },
      dirty: true,
      name: "plan",
      restore: { kind: "unknown" },
      scope: "project",
    };

    updateStatus(ctx, active, (name, scope) =>
      name === "plan" && scope === "project" ? preset : undefined,
    );

    expect(status["presets-plus"]).toBe("Preset: plan!");
  });

  it("falls back to Preset: none when the lookup returns undefined", () => {
    const { ctx, status } = harness();
    const active: ActivePresetState = {
      declared: { model: "phantom", provider: "acme" },
      dirty: false,
      name: "ghost",
      restore: { kind: "unknown" },
      scope: "user",
    };

    updateStatus(ctx, active, () => undefined);

    expect(status["presets-plus"]).toBe("Preset: none");
  });
});
