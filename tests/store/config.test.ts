/** Covers loading consolidated settings and preset scopes, including fail-open warnings. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAll } from "../../src/store/api.js";
import { loadScope } from "../../src/store/config.js";
import {
  getGlobalConfigPath,
  getProjectConfigPath,
} from "../../src/store/paths.js";
import { makeStubModelRegistry } from "../helpers/model-registry.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let agentDir: string;
let previousAgentDir: string | undefined;

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-config-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { force: true, recursive: true });
});

function context(cwd: string) {
  return {
    cwd,
    modelRegistry: makeStubModelRegistry({ models: {} }),
  };
}

async function writeConfig(value: unknown): Promise<void> {
  const path = getGlobalConfigPath(agentDir);

  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf-8");
}

async function writeProjectConfig(cwd: string, value: unknown): Promise<void> {
  const path = getProjectConfigPath(cwd);

  await mkdir(join(cwd, ".pi", "presets-plus"), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf-8");
}

describe("loadScope", () => {
  it("loads explicit settings and warns when project settings are invalid", async () => {
    const cwd = join(agentDir, "project");

    await writeConfig({ version: 2, showInactiveStatus: false });
    await writeProjectConfig(cwd, { version: 2, showInactiveStatus: true });

    await expect(loadScope("project", cwd, agentDir)).resolves.toMatchObject({
      showInactiveStatus: true,
      warnings: { file: [], settings: [], presets: [], policy: [] },
    });

    await writeProjectConfig(cwd, { version: 2, showInactiveStatus: "yes" });
    await expect(loadScope("project", cwd, agentDir)).resolves.toMatchObject({
      warnings: {
        settings: [expect.stringContaining("showInactiveStatus")],
      },
    });
  });

  it("defaults to showing inactive status when files are missing", async () => {
    const result = await loadAll(context(join(agentDir, "project")));

    expect(result.showInactiveStatus).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("resolves project, user, then default status", async () => {
    const cwd = join(agentDir, "project");

    await writeConfig({ version: 2, showInactiveStatus: false });
    expect((await loadAll(context(cwd))).showInactiveStatus).toBe(false);

    await writeProjectConfig(cwd, { version: 2, showInactiveStatus: true });
    expect((await loadAll(context(cwd))).showInactiveStatus).toBe(true);
  });

  it.each([
    ["invalid JSON", "{"],
    ["unsupported version", JSON.stringify({ version: 3 })],
    [
      "invalid field type",
      JSON.stringify({ showInactiveStatus: "no", version: 2 }),
    ],
    ["invalid top-level", JSON.stringify([])],
  ])("fails open and warns for %s", async (_label, contents) => {
    const path = getGlobalConfigPath(agentDir);

    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(path, contents, "utf-8");

    const result = await loadScope("user", join(agentDir, "project"), agentDir);

    expect(result.showInactiveStatus).toBeUndefined();
    expect(result.warnings.file.length + result.warnings.settings.length).toBe(
      1,
    );
    expect(await readFile(path, "utf-8")).toBe(contents);
  });
});
