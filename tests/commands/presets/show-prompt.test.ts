/**
 * Behavior matrix tests for `/presets show-prompt`.
 *
 * Asserts on pure classification and formatting so prompt inspection stays
 * covered without a real Pi notification surface.
 */
import {
  findPresetForShowPrompt,
  formatShowPromptBody,
} from "../../../src/commands/presets/show-prompt.js";
import type { ActivePresetState, LoadedPreset } from "../../../src/types.js";
import { describe, expect, it } from "vitest";

const userPlan: LoadedPreset & { instructions: string } = {
  instructions: "global",
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "user",
};
const projectPlan: LoadedPreset & { instructions: string } = {
  instructions: "project",
  model: "claude",
  name: "plan",
  provider: "anthropic",
  scope: "project",
};
const empty: LoadedPreset = {
  instructions: "  ",
  model: "claude",
  name: "empty",
  provider: "anthropic",
  scope: "user",
};

function active(name = "plan", scope: "project" | "user" = "project") {
  return {
    declared: { model: "claude", provider: "anthropic" },
    dirty: false,
    name,
    restore: { kind: "unknown" },
    scope,
  } satisfies ActivePresetState;
}

describe("findPresetForShowPrompt", () => {
  it("classifies no active preset", () => {
    expect(findPresetForShowPrompt(undefined, null, [])).toEqual({
      kind: "no-active",
    });
  });

  it("classifies an active preset without a prompt", () => {
    expect(
      findPresetForShowPrompt(undefined, active("empty", "user"), [empty]),
    ).toEqual({
      kind: "no-prompt-active",
      name: "empty",
    });
  });

  it("classifies an active preset with a prompt", () => {
    expect(
      findPresetForShowPrompt(undefined, active(), [userPlan, projectPlan]),
    ).toEqual({ kind: "active", preset: projectPlan });
  });

  it("classifies an unknown named preset", () => {
    expect(findPresetForShowPrompt("missing", active(), [projectPlan])).toEqual(
      {
        kind: "unknown",
        name: "missing",
      },
    );
  });

  it("classifies a named preset without a prompt", () => {
    expect(findPresetForShowPrompt("empty", active(), [empty])).toEqual({
      kind: "no-prompt-named",
      name: "empty",
    });
  });

  it("classifies a named preset with project-over-user precedence", () => {
    expect(
      findPresetForShowPrompt("plan", active("empty"), [userPlan, projectPlan]),
    ).toEqual({
      kind: "named",
      preset: projectPlan,
    });
  });
});

describe("formatShowPromptBody", () => {
  it("formats every non-rendering branch", () => {
    expect(formatShowPromptBody({ kind: "no-active" })).toEqual({
      body: "No preset is active.",
      severity: "info",
    });

    expect(
      formatShowPromptBody({ kind: "no-prompt-active", name: "plan" }),
    ).toEqual({
      body: 'Active preset "plan" has no prompt.',
      severity: "info",
    });

    expect(
      formatShowPromptBody({ kind: "no-prompt-named", name: "plan" }),
    ).toEqual({ body: 'Preset "plan" has no prompt.', severity: "info" });

    expect(formatShowPromptBody({ kind: "unknown", name: "missing" })).toEqual({
      body: 'No preset named "missing".',
      severity: "error",
    });
  });

  it("formats named prompt bodies literally", () => {
    expect(
      formatShowPromptBody({ kind: "named", preset: projectPlan }),
    ).toEqual({
      body: "project",
      severity: "info",
    });
  });

  it("formats active prompt bodies literally", () => {
    expect(
      formatShowPromptBody({ kind: "active", preset: projectPlan }),
    ).toEqual({
      body: "project",
      severity: "info",
    });
  });
});
