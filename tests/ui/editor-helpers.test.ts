/**
 * Tests for the preset editor's pure helpers.
 *
 * Covers `initialState` (defaults for new vs. existing preset) and
 * `buildPreset` (form-state-to-on-disk-shape projection). The TUI
 * component itself remains exercised through manual QA; these unit
 * checks pin the invariants the picker and storage layer rely on.
 */
import type { LoadedPreset } from "../../src/types.js";
import { buildPreset, initialState } from "../../src/ui/editor.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";

interface ModelItem {
  readonly available: boolean;
  readonly id: string;
  readonly model: Model<Api>;
  readonly provider: string;
}

const fakeModels: readonly ModelItem[] = [
  {
    available: true,
    id: "claude-opus-4.5",
    // The editor only reads `provider` / `id` off ModelItem and consults
    // `model.reasoning` when re-evaluating thinking levels; a partial cast
    // is enough for the pure helpers under test.
    model: { reasoning: true } as unknown as Model<Api>,
    provider: "anthropic",
  },
  {
    available: true,
    id: "gpt-5",
    model: { reasoning: false } as unknown as Model<Api>,
    provider: "openai",
  },
];

const existingPreset: LoadedPreset = {
  hotkey: "ctrl+shift+1",
  instructions: "you are in plan mode",
  model: "claude-opus-4.5",
  name: "plan",
  provider: "anthropic",
  scope: "user",
  thinkingLevel: "high",
  tools: ["read", "grep"],
};

describe("initialState", () => {
  it("uses spec-mandated defaults for a new preset", () => {
    const state = initialState(undefined, fakeModels);

    expect(state).toEqual({
      hotkey: "",
      instructions: "",
      model: "claude-opus-4.5",
      name: "",
      provider: "anthropic",
      scope: "user",
      selectedTools: [],
      thinkingLevel: "off",
      toolsMode: "session",
    });
  });

  it("falls back to empty provider/model when the registry is empty", () => {
    const state = initialState(undefined, []);

    expect(state.provider).toBe("");
    expect(state.model).toBe("");
  });

  it("pre-populates from an existing preset, including tools=preset mode", () => {
    const state = initialState(existingPreset, fakeModels);

    expect(state).toEqual({
      hotkey: "ctrl+shift+1",
      instructions: "you are in plan mode",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      scope: "user",
      selectedTools: ["read", "grep"],
      thinkingLevel: "high",
      toolsMode: "preset",
    });
  });

  it("treats a missing tools field as session mode with no pre-selection when activeTools omitted", () => {
    const state = initialState(
      { ...existingPreset, tools: undefined },
      fakeModels,
    );

    expect(state.toolsMode).toBe("session");
    expect(state.selectedTools).toEqual([]);
  });

  it("pre-selects activeTools for a preset without a tools field", () => {
    // Spec: when the preset has no `tools` yet, the multi-toggle SHALL
    // be pre-checked from `pi.getActiveTools()`. Stays in `session` mode
    // so the persisted preset still omits `tools` until the user toggles
    // to `preset` mode.
    const state = initialState(
      { ...existingPreset, tools: undefined },
      fakeModels,
      ["read", "bash"],
    );

    expect(state.toolsMode).toBe("session");
    expect(state.selectedTools).toEqual(["read", "bash"]);
  });

  it("pre-selects activeTools for a new preset too", () => {
    const state = initialState(undefined, fakeModels, ["read", "grep"]);

    expect(state.toolsMode).toBe("session");
    expect(state.selectedTools).toEqual(["read", "grep"]);
  });

  it("copies activeTools defensively so later mutations don't leak in", () => {
    const activeTools = ["read"];
    const state = initialState(undefined, fakeModels, activeTools);

    expect(state.selectedTools).not.toBe(activeTools);
    activeTools.push("bash");
    expect(state.selectedTools).toEqual(["read"]);
  });

  it("prefers the preset's own tools over activeTools when both are present", () => {
    const state = initialState(existingPreset, fakeModels, ["bash", "edit"]);

    expect(state.toolsMode).toBe("preset");
    expect(state.selectedTools).toEqual(["read", "grep"]);
  });

  it("preserves the original thinkingLevel even when the model would clamp", () => {
    // `gpt-5` has `reasoning: false` in the fake registry, but the editor
    // must NOT silently rewrite the form on open. The disabled-radio
    // affordance and the user-driven snap path are the only signals.
    const state = initialState(
      {
        ...existingPreset,
        model: "gpt-5",
        provider: "openai",
        thinkingLevel: "high",
      },
      fakeModels,
    );

    expect(state.thinkingLevel).toBe("high");
  });
});

describe("buildPreset", () => {
  it("emits required fields and trims the name", () => {
    const preset = buildPreset({
      hotkey: "",
      instructions: "",
      model: "claude-opus-4.5",
      name: "  plan  ",
      provider: "anthropic",
      scope: "user",
      selectedTools: [],
      thinkingLevel: "off",
      toolsMode: "session",
    });

    expect(preset).toEqual({
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
    });
  });

  it("omits thinkingLevel when off, omits tools in session mode, omits empty instructions and hotkey", () => {
    const preset = buildPreset({
      hotkey: "  ",
      instructions: "   \n  \n",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      scope: "user",
      selectedTools: ["read"],
      thinkingLevel: "off",
      toolsMode: "session",
    });

    expect(preset).toEqual({
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
    });
  });

  it("includes thinkingLevel, tools, instructions, and hotkey when set", () => {
    const preset = buildPreset({
      hotkey: "ctrl+shift+1",
      instructions: "you are in plan mode",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      scope: "project",
      selectedTools: ["read", "grep"],
      thinkingLevel: "high",
      toolsMode: "preset",
    });

    expect(preset).toEqual({
      hotkey: "ctrl+shift+1",
      instructions: "you are in plan mode",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      thinkingLevel: "high",
      tools: ["read", "grep"],
    });
  });

  it("emits an empty tools array in preset mode with no selections", () => {
    const preset = buildPreset({
      hotkey: "",
      instructions: "",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      scope: "user",
      selectedTools: [],
      thinkingLevel: "off",
      toolsMode: "preset",
    });

    expect(preset.tools).toEqual([]);
  });

  it("returns a defensive copy of the tools array", () => {
    const selectedTools = ["read", "grep"];
    const preset = buildPreset({
      hotkey: "",
      instructions: "",
      model: "claude-opus-4.5",
      name: "plan",
      provider: "anthropic",
      scope: "user",
      selectedTools,
      thinkingLevel: "off",
      toolsMode: "preset",
    });

    expect(preset.tools).not.toBe(selectedTools);
    expect(preset.tools).toEqual(selectedTools);
  });
});
