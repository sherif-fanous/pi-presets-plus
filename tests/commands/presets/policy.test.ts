/**
 * Tests for the read-only `/presets policy` report.
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

const workName: CompiledPolicyMatcher = {
  field: "name",
  pattern: "^work-",
  regex: /^work-/,
};
const personalProvider: CompiledPolicyMatcher = {
  field: "provider",
  pattern: "personal",
  regex: /personal/,
};
const rules: readonly CompiledPolicyRule[] = [
  {
    allow: [workName],
    default: workName,
    index: 0,
    match: "^/work/",
    matchRegex: /^\/work\//,
    prohibit: [personalProvider],
  },
];
const presets: readonly LoadedPreset[] = [
  preset("work-opus", "anthropic"),
  preset("work-personal", "personal"),
  preset("other", "anthropic"),
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
  it("reports mixed outcomes in merged order with the resolved default", () => {
    expect(formatPolicy("/work/project", presets, rules)).toBe(
      [
        "Preset Policy",
        "  Directory:           /work/project",
        "  Allowed presets:     work-opus",
        "  Prohibited presets*: work-personal, other",
        "  Default preset:      work-opus",
        "",
        "* You can still activate a prohibited preset by confirming the override.",
      ].join("\n"),
    );
  });

  it("reports all usable presets allowed without a footnote", () => {
    const allAllowedRules = [
      rule({ allow: [], default: undefined, prohibit: [] }),
    ];

    expect(formatPolicy("/work/project", presets, allAllowedRules)).toBe(
      [
        "Preset Policy",
        "  Directory:           /work/project",
        "  Allowed presets:     work-opus, work-personal, other",
        "  Prohibited presets:  none",
        "  Default preset:      none",
      ].join("\n"),
    );
  });

  it("reports every usable preset prohibited", () => {
    const allProhibitedRules = [
      rule({ allow: [], default: undefined, prohibit: [matchAll()] }),
    ];

    expect(formatPolicy("/work/project", presets, allProhibitedRules)).toBe(
      [
        "Preset Policy",
        "  Directory:           /work/project",
        "  Allowed presets:     none",
        "  Prohibited presets*: work-opus, work-personal, other",
        "  Default preset:      none",
        "",
        "* You can still activate a prohibited preset by confirming the override.",
      ].join("\n"),
    );
  });

  it("omits unavailable and shadowed presets", () => {
    const annotated: readonly LoadedPreset[] = [
      preset("usable", "anthropic"),
      { ...preset("unavailable", "anthropic"), unavailable: "no-key" },
      { ...preset("shadowed", "anthropic"), shadowed: true },
    ];

    expect(
      formatPolicy("/work/project", annotated, [
        rule({ allow: [], default: undefined, prohibit: [] }),
      ]),
    ).toBe(
      [
        "Preset Policy",
        "  Directory:           /work/project",
        "  Allowed presets:     usable",
        "  Prohibited presets:  none",
        "  Default preset:      none",
      ].join("\n"),
    );
  });

  it("collapses an unresolvable default to none", () => {
    const unresolvableRules = [
      rule({ allow: [], default: workName, prohibit: [workName] }),
    ];

    expect(formatPolicy("/work/project", presets, unresolvableRules)).toBe(
      [
        "Preset Policy",
        "  Directory:           /work/project",
        "  Allowed presets:     other",
        "  Prohibited presets*: work-opus, work-personal",
        "  Default preset:      none",
        "",
        "* You can still activate a prohibited preset by confirming the override.",
      ].join("\n"),
    );
  });

  it("applies title and row styling", () => {
    const output = formatPolicy("/work/project", presets, rules, {
      bold: (text) => `<bold>${text}</bold>`,
      fg: (color, text) => `<${color}>${text}</${color}>`,
    });

    expect(output).toContain("<bold><accent>Preset Policy</accent></bold>");
    expect(output).toContain(
      "  <muted>Directory:</muted>           /work/project",
    );
  });

  it("states when no rules match", () => {
    expect(formatPolicy("/personal", presets, rules)).toBe(
      "No preset policy applies to /personal.",
    );
  });
});

describe("runPolicy", () => {
  it("includes warnings in one report and does not modify policy.json", async () => {
    tempAgentDir = await mkdtemp(join(tmpdir(), "pi-policy-view-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempAgentDir;

    const path = getGlobalPolicyPath(tempAgentDir);
    const original = `${JSON.stringify({ rules: [{ allow: {}, match: "work" }], version: 1 }, null, 2)}\n`;
    const notify = vi.fn();

    await mkdir(join(tempAgentDir, "presets-plus"), { recursive: true });
    await writeFile(path, original);

    await runPolicy({
      cwd: "/work/project",
      modelRegistry: {
        find: () => undefined,
        hasConfiguredAuth: () => false,
      },
      ui: {
        notify,
        theme: {
          bold: (text: string) => `<bold>${text}</bold>`,
          fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
        },
      },
    } as unknown as ExtensionCommandContext);

    expect(await readFile(path, "utf-8")).toBe(original);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Warnings:"),
      "warning",
    );
    expect(notify.mock.calls[0]?.[0]).toContain("Preset Policy");
  });
});

function matchAll(): CompiledPolicyMatcher {
  return { field: "name", pattern: ".*", regex: /.*/ };
}

function preset(name: string, provider: string): LoadedPreset {
  return { model: "model", name, provider, scope: "user" };
}

function rule(
  overrides: Pick<CompiledPolicyRule, "allow" | "default" | "prohibit">,
): CompiledPolicyRule {
  return {
    allow: overrides.allow,
    ...(overrides.default ? { default: overrides.default } : {}),
    index: 0,
    match: "^/work/",
    matchRegex: /^\/work\//,
    prohibit: overrides.prohibit,
  };
}
