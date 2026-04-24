/**
 * Tests for `src/commands/presets/list.ts`.
 *
 * Focused on the display grouping + ordering decision:
 *
 *   1. Project presets
 *   2. User presets that are NOT shadowed
 *   3. User presets that ARE shadowed
 *
 * Within each group the order produced by `loadAll` is preserved. We
 * build `LoadedPreset[]` arrays directly (rather than going through the
 * full load pipeline) so these tests stay focused on the formatter.
 */

import {
  formatEmptyMessage,
  formatPresetList,
} from "../../../src/commands/presets/list.js";
import type { LoadedPreset } from "../../../src/types.js";
import { describe, expect, it } from "vitest";

const base = {
  provider: "anthropic",
  model: "claude-opus-4.5",
} as const;

const make = (
  overrides: Partial<LoadedPreset> & {
    name: string;
    scope: "user" | "project";
  },
): LoadedPreset => ({
  ...base,
  ...overrides,
});

describe("formatPresetList", () => {
  it("renders only the project group when no user presets exist", () => {
    const out = formatPresetList([
      make({ name: "plan", scope: "project" }),
      make({ name: "ship", scope: "project" }),
    ]);
    expect(out.startsWith("Project presets\n")).toBe(true);
    expect(out).toContain("plan\n  scope:    project");
    expect(out).toContain("ship\n  scope:    project");
    expect(out).not.toContain("User presets");
    expect(out).not.toContain("Shadowed");
  });

  it("renders only the user-active group when no project presets exist", () => {
    const out = formatPresetList([
      make({ name: "plan", scope: "user" }),
      make({ name: "ship", scope: "user" }),
    ]);
    expect(out.startsWith("User presets\n")).toBe(true);
    expect(out).not.toContain("Project presets");
    expect(out).not.toContain("Shadowed");
  });

  it("orders groups: project, user (non-shadowed), user (shadowed)", () => {
    // Input order from loadAll: globals first (one shadowed, one not),
    // then projects. The formatter must re-bucket them.
    const out = formatPresetList([
      make({ name: "plan", scope: "user", shadowed: true }),
      make({ name: "review", scope: "user" }),
      make({ name: "plan", scope: "project" }),
      make({ name: "ship", scope: "project" }),
    ]);

    const projectHeaderIdx = out.indexOf("Project presets");
    const userHeaderIdx = out.indexOf("User presets");
    const shadowedHeaderIdx = out.indexOf(
      "Shadowed user presets (overridden by project presets above)",
    );

    expect(projectHeaderIdx).toBeGreaterThanOrEqual(0);
    expect(userHeaderIdx).toBeGreaterThan(projectHeaderIdx);
    expect(shadowedHeaderIdx).toBeGreaterThan(userHeaderIdx);
  });

  it("preserves file order within each group", () => {
    const out = formatPresetList([
      make({ name: "u1", scope: "user" }),
      make({ name: "u2", scope: "user" }),
      make({ name: "p1", scope: "project" }),
      make({ name: "p2", scope: "project" }),
    ]);

    // Within the project group, p1 should appear before p2.
    const p1 = out.indexOf("p1\n  scope:    project");
    const p2 = out.indexOf("p2\n  scope:    project");
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p2).toBeGreaterThan(p1);

    // Within the user group, u1 should appear before u2.
    const u1 = out.indexOf("u1\n  scope:    user");
    const u2 = out.indexOf("u2\n  scope:    user");
    expect(u1).toBeGreaterThanOrEqual(0);
    expect(u2).toBeGreaterThan(u1);
  });

  it("renders preset fields: thinking, tools, hotkey, status", () => {
    const out = formatPresetList([
      make({
        name: "plan",
        scope: "project",
        thinkingLevel: "high",
        tools: ["read", "grep"],
        hotkey: "ctrl+p",
      }),
    ]);
    // Values are column-aligned to the widest inline label ("thinking:"),
    // so every value starts in the same column.
    expect(out).toContain("thinking: high");
    expect(out).toContain("tools:    2 (read, grep)");
    expect(out).toContain("hotkey:   ctrl+p");
  });

  it("renders 'inherit' when tools are omitted or empty", () => {
    const out = formatPresetList([
      make({ name: "a", scope: "user" }),
      make({ name: "b", scope: "user", tools: [] }),
    ]);
    expect(out.match(/tools:\s+inherit/g)).toHaveLength(2);
  });

  it("renders 'thinking: off' when thinkingLevel is unset", () => {
    const out = formatPresetList([make({ name: "a", scope: "user" })]);
    expect(out).toContain("thinking: off");
  });

  it("includes the shadowed status line in the shadowed group", () => {
    const out = formatPresetList([
      make({ name: "plan", scope: "user", shadowed: true }),
      make({ name: "plan", scope: "project" }),
    ]);
    expect(out).toContain(
      "status:   shadowed by project preset of the same name",
    );
  });

  it("renders user-friendly unavailable reasons with provider/model context", () => {
    const out = formatPresetList([
      make({
        name: "plan",
        scope: "project",
        provider: "anthropic",
        model: "claude-opus-4.5",
        unavailable: "no-key",
      }),
      make({
        name: "ship",
        scope: "project",
        provider: "openai",
        model: "gpt-5",
        unavailable: "no-model",
      }),
    ]);
    // no-key → name the provider whose key is missing.
    expect(out).toContain(`status:   missing API key for provider "anthropic"`);
    // no-model → include the full provider/model that failed to resolve.
    expect(out).toContain(
      `status:   model "openai/gpt-5" not found in registry`,
    );
    // Raw enum values should not leak into the user-facing output.
    expect(out).not.toContain("no-key");
    expect(out).not.toContain("no-model");
    expect(out).not.toContain("unavailable (");
  });

  it("renders multi-line instructions indented under an instructions: label", () => {
    const out = formatPresetList([
      make({
        name: "plan",
        scope: "project",
        instructions: "line one\nline two",
      }),
    ]);
    expect(out).toContain("  instructions:\n    line one\n    line two");
  });

  it("omits the instructions: label when instructions is unset", () => {
    const out = formatPresetList([make({ name: "plan", scope: "project" })]);
    expect(out).not.toContain("instructions:");
  });
});

describe("formatEmptyMessage", () => {
  it("mentions both file paths and the expected JSON shape", () => {
    const out = formatEmptyMessage("/tmp/fake-project");
    expect(out).toContain("No presets configured.");
    expect(out).toContain("/tmp/fake-project/.pi/presets-plus/presets.json");
    expect(out).toContain("/presets-plus/presets.json");
    expect(out).toContain('"version": 1');
  });
});
