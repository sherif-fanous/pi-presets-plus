/**
 * Covers loading the optional global extension configuration and its
 * fail-open behavior for missing and malformed files.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../../src/store/config.js";
import { getGlobalConfigPath } from "../../src/store/paths.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let agentDir: string;

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-config-"));
});

afterEach(async () => {
  await rm(agentDir, { force: true, recursive: true });
});

async function writeConfig(value: unknown): Promise<void> {
  const path = getGlobalConfigPath(agentDir);

  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf-8");
}

describe("loadConfig", () => {
  it("defaults to showing inactive status when the file is missing", async () => {
    await expect(loadConfig(agentDir)).resolves.toEqual({
      showInactiveStatus: true,
      warnings: [],
    });
  });

  it("fails open when the config path cannot be read", async () => {
    const path = getGlobalConfigPath(agentDir);

    await mkdir(path, { recursive: true });

    await expect(loadConfig(agentDir)).resolves.toMatchObject({
      showInactiveStatus: true,
      warnings: [expect.stringContaining("could not read config file")],
    });
  });

  it("loads both explicit values and defaults an absent field", async () => {
    await writeConfig({ showInactiveStatus: false, version: 1 });
    await expect(loadConfig(agentDir)).resolves.toEqual({
      showInactiveStatus: false,
      warnings: [],
    });

    await writeConfig({ version: 1 });
    await expect(loadConfig(agentDir)).resolves.toEqual({
      showInactiveStatus: true,
      warnings: [],
    });
  });

  it.each([
    ["invalid JSON", "{"],
    ["unsupported version", JSON.stringify({ version: 2 })],
    [
      "invalid field type",
      JSON.stringify({ showInactiveStatus: "no", version: 1 }),
    ],
    ["invalid top-level", JSON.stringify([])],
  ])("fails open and warns for %s", async (_label, contents) => {
    const path = getGlobalConfigPath(agentDir);

    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(path, contents, "utf-8");

    const result = await loadConfig(agentDir);

    expect(result.showInactiveStatus).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(await readFile(path, "utf-8")).toBe(contents);
  });
});
