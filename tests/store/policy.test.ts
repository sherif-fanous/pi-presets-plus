/**
 * Tests for preset access-policy loading, matching, permissions, and defaults.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getGlobalPolicyPath } from "../../src/store/paths.js";
import {
  isPermitted,
  loadPolicy,
  matchesPreset,
  resolveMatchingRules,
  resolvePolicyDefault,
} from "../../src/store/policy.js";
import type { LoadedPreset } from "../../src/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let agentDir: string;

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-policy-"));
});

afterEach(async () => {
  await rm(agentDir, { force: true, recursive: true });
});

function preset(name: string, extra: Partial<LoadedPreset> = {}): LoadedPreset {
  return {
    model: "claude-opus-4-8",
    name,
    provider: "anthropic",
    scope: "user",
    ...extra,
  };
}

async function writePolicy(value: unknown): Promise<void> {
  const path = getGlobalPolicyPath(agentDir);

  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

describe("loadPolicy", () => {
  it("treats a missing file and empty rules as no policy", async () => {
    await expect(loadPolicy(agentDir)).resolves.toEqual({
      rules: [],
      warnings: [],
    });

    await writePolicy({ rules: [], version: 1 });

    await expect(loadPolicy(agentDir)).resolves.toEqual({
      rules: [],
      warnings: [],
    });
  });

  it("warns and fails open for unsupported versions and malformed JSON", async () => {
    await writePolicy({ rules: [], version: 2 });

    const unsupported = await loadPolicy(agentDir);

    expect(unsupported.rules).toEqual([]);
    expect(unsupported.warnings.join(" ")).toContain("unsupported version 2");

    await writeFile(getGlobalPolicyPath(agentDir), "{");

    const malformed = await loadPolicy(agentDir);

    expect(malformed.rules).toEqual([]);
    expect(malformed.warnings.join(" ")).toContain("invalid JSON");
  });

  it("skips an invalid match while retaining other rules", async () => {
    await writePolicy({
      rules: [{ match: "[" }, { match: "work" }],
      version: 1,
    });

    const result = await loadPolicy(agentDir);

    expect(result.rules.map((rule) => rule.match)).toEqual(["work"]);
    expect(result.warnings.join(" ")).toContain('"["');
  });

  it("skips only an invalid matcher and defaults fields to name", async () => {
    await writePolicy({
      rules: [
        {
          allow: [{ pattern: "[" }, { pattern: "apple" }],
          default: { pattern: "opus" },
          match: "work",
          prohibit: [{ field: "provider", pattern: "openai" }],
        },
      ],
      version: 1,
    });

    const result = await loadPolicy(agentDir);
    const rule = result.rules[0];

    expect(rule?.allow).toHaveLength(1);
    expect(rule?.allow[0]?.field).toBe("name");
    expect(rule?.default?.field).toBe("name");
    expect(result.warnings.join(" ")).toContain('"["');
  });
});

describe("policy matching and permissions", () => {
  it("uses raw regex semantics for name, provider, and combined model", async () => {
    await writePolicy({
      rules: [
        {
          allow: [
            { pattern: "apple" },
            { pattern: "^ifanous-$" },
            { field: "provider", pattern: "apple-genai" },
            { field: "model", pattern: "^anthropic/" },
          ],
          match: "project",
        },
      ],
      version: 1,
    });

    const rule = (await loadPolicy(agentDir)).rules[0];

    expect(rule).toBeDefined();
    if (!rule) return;

    const [nameSubstring, anchored, provider, model] = rule.allow;

    if (!nameSubstring || !anchored || !provider || !model) {
      throw new Error("Expected four compiled policy matchers.");
    }

    expect(matchesPreset(preset("apple-claude"), nameSubstring)).toBe(true);
    expect(matchesPreset(preset("apple-ifanous-test"), anchored)).toBe(false);
    expect(
      matchesPreset(
        preset("other", { provider: "apple-genai-anthropic" }),
        provider,
      ),
    ).toBe(true);
    expect(matchesPreset(preset("other"), model)).toBe(true);
  });

  it("unions matching rules, treats allow as a whitelist, and lets prohibit win", async () => {
    await writePolicy({
      rules: [
        {
          allow: [{ pattern: "^apple-" }],
          match: "work",
          prohibit: [{ pattern: "sonnet" }],
        },
        { match: "apple", prohibit: [{ pattern: "^virtasant-" }] },
      ],
      version: 1,
    });

    const rules = (await loadPolicy(agentDir)).rules;
    const none = resolveMatchingRules("/personal", rules);
    const matched = resolveMatchingRules("/work/apple/project", rules);

    expect(isPermitted(preset("anything"), none)).toBe(true);
    expect(isPermitted(preset("ifanous-codex"), matched)).toBe(false);
    expect(isPermitted(preset("apple-opus"), matched)).toBe(true);
    expect(isPermitted(preset("apple-sonnet"), matched)).toBe(false);
    expect(isPermitted(preset("virtasant-model"), matched)).toBe(false);
  });
});

describe("resolvePolicyDefault", () => {
  it("uses longest match, then file order, then existing preset order", async () => {
    await writePolicy({
      rules: [
        { default: { pattern: "^apple-opus" }, match: "^/work/" },
        { default: { pattern: "^apple-opus-4-8$" }, match: "^/work/apple/" },
      ],
      version: 1,
    });

    const rules = (await loadPolicy(agentDir)).rules;
    const result = resolvePolicyDefault(
      "/work/apple/project",
      [preset("apple-opus-4-7"), preset("apple-opus-4-8")],
      rules,
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.preset.name).toBe("apple-opus-4-8");
    expect(result.winner.rule.index).toBe(1);
    expect(result.reason).toBe("longest match");
  });

  it("uses the first rule on equal spans", async () => {
    await writePolicy({
      rules: [
        { default: { pattern: "^first$" }, match: "work" },
        { default: { pattern: "^second$" }, match: "work" },
      ],
      version: 1,
    });

    const result = resolvePolicyDefault(
      "/work",
      [preset("first"), preset("second")],
      (await loadPolicy(agentDir)).rules,
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.preset.name).toBe("first");
    expect(result.reason).toBe("file-order tie");
  });

  it("excludes prohibited, shadowed, and unavailable candidates", async () => {
    await writePolicy({
      rules: [
        {
          default: { pattern: "opus" },
          match: "work",
          prohibit: [{ pattern: "blocked" }],
        },
      ],
      version: 1,
    });

    const result = resolvePolicyDefault(
      "/work",
      [
        preset("blocked-opus"),
        preset("shadowed-opus", { shadowed: true }),
        preset("unavailable-opus", { unavailable: "no-key" }),
        preset("allowed-opus"),
      ],
      (await loadPolicy(agentDir)).rules,
    );

    expect(result.kind).toBe("resolved");

    if (result.kind === "resolved") {
      expect(result.preset.name).toBe("allowed-opus");
    }
  });

  it("distinguishes no configured default from an unresolvable one", async () => {
    await writePolicy({
      rules: [{ match: "work" }],
      version: 1,
    });

    const noDefault = resolvePolicyDefault(
      "/work",
      [],
      (await loadPolicy(agentDir)).rules,
    );

    expect(noDefault.kind).toBe("none");

    await writePolicy({
      rules: [{ default: { pattern: "missing" }, match: "work" }],
      version: 1,
    });

    const unavailable = resolvePolicyDefault(
      "/work",
      [],
      (await loadPolicy(agentDir)).rules,
    );

    expect(unavailable.kind).toBe("unresolvable");
  });
});
