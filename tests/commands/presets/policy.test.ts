/**
 * Tests for the read-only `/presets policy` diagnostic.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatPolicy,
  runPolicy,
} from "../../../src/commands/presets/policy.js";
import { getGlobalPolicyPath } from "../../../src/store/paths.js";
import type {
  CompiledPolicyMatcher,
  CompiledPolicyRule,
} from "../../../src/store/policy.js";
import type { LoadedPreset } from "../../../src/types.js";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

const allow: CompiledPolicyMatcher = {
  field: "name",
  pattern: "^work-",
  regex: /^work-/,
};
const prohibit: CompiledPolicyMatcher = {
  field: "provider",
  pattern: "personal",
  regex: /personal/,
};
const rules: readonly CompiledPolicyRule[] = [
  {
    allow: [allow],
    default: allow,
    index: 0,
    match: "^/work/",
    matchRegex: /^\/work\//,
    prohibit: [prohibit],
  },
];
const presets: readonly LoadedPreset[] = [
  {
    model: "claude-opus",
    name: "work-opus",
    provider: "anthropic",
    scope: "user",
  },
];

let tempAgentDir: string | undefined;
let previousAgentDir: string | undefined;

afterEach(async () => {
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }

  if (tempAgentDir) await rm(tempAgentDir, { force: true, recursive: true });
  tempAgentDir = undefined;
});

describe("formatPolicy", () => {
  it("lists matching rules, effective sets, and resolved default", () => {
    const result = formatPolicy("/work/project", presets, rules);

    expect(result).toContain("Matching Rules:");
    expect(result).toContain('1. "^/work/"');
    expect(result).toContain('Effective Allow: name:"^work-"');
    expect(result).toContain('Effective Prohibit: provider:"personal"');
    expect(result).toContain("Resolved Default: work-opus");
    expect(result).toContain("longest match");
  });

  it("states when no rules match", () => {
    expect(formatPolicy("/personal", presets, rules)).toBe(
      "No policy rules apply to /personal.",
    );
  });
});

describe("runPolicy", () => {
  it("does not modify policy.json", async () => {
    tempAgentDir = await mkdtemp(join(tmpdir(), "pi-policy-view-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempAgentDir;

    const path = getGlobalPolicyPath(tempAgentDir);
    const original = `${JSON.stringify({ rules: [{ match: "work" }], version: 1 }, null, 2)}\n`;
    const notify = vi.fn();

    await mkdir(join(tempAgentDir, "presets-plus"), { recursive: true });
    await writeFile(path, original);

    await runPolicy({
      cwd: "/work/project",
      modelRegistry: {
        find: () => undefined,
        hasConfiguredAuth: () => false,
      },
      ui: { notify },
    } as unknown as ExtensionCommandContext);

    expect(await readFile(path, "utf-8")).toBe(original);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
  });
});
