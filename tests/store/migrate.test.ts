/**
 * Covers structural legacy migration, atomic commit ordering, cleanup outcomes,
 * retries, and version 2 precedence for user and project scopes.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  migrateAll,
  migrateScope,
  type MigrationFs,
} from "../../src/store/migrate.js";
import {
  getGlobalConfigPath,
  getGlobalPolicyPath,
  getGlobalPresetsPath,
  getProjectConfigPath,
  getProjectPresetsPath,
} from "../../src/store/paths.js";
import type { AtomicWriteFs } from "../../src/store/save.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root: string;
let agentDir: string;
let cwd: string;

const preset = {
  name: "plan",
  provider: "anthropic",
  model: "claude-opus",
  extra: { retained: true },
};
const rule = {
  match: "^/work/",
  allow: [{ pattern: "^plan$", custom: true }],
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-presets-migrate-"));
  agentDir = join(root, "agent");
  cwd = join(root, "project");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  );
}

async function readDocument(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("migrateScope", () => {
  it.each([
    [
      "config",
      () =>
        put(getGlobalConfigPath(agentDir), {
          version: 1,
          showInactiveStatus: false,
        }),
    ],
    [
      "presets",
      () =>
        put(getGlobalPresetsPath(agentDir), { version: 1, presets: [preset] }),
    ],
    [
      "policy",
      () => put(getGlobalPolicyPath(agentDir), { version: 1, rules: [rule] }),
    ],
  ])("migrates a user %s file alone", async (_name, create) => {
    await create();

    const result = await migrateScope("user", cwd, agentDir);

    expect(result).toMatchObject({
      attempted: true,
      migrated: true,
      warnings: [],
    });

    const document = await readDocument(getGlobalConfigPath(agentDir));

    expect(document.version).toBe(2);
  });

  it("combines all user files and removes sidecars after commit", async () => {
    await put(getGlobalConfigPath(agentDir), {
      version: 1,
      showInactiveStatus: false,
    });

    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset],
    });
    await put(getGlobalPolicyPath(agentDir), { version: 1, rules: [rule] });

    const result = await migrateScope("user", cwd, agentDir);
    const document = await readDocument(getGlobalConfigPath(agentDir));

    expect(result.migrated).toBe(true);
    expect(document).toEqual({
      version: 2,
      showInactiveStatus: false,
      presets: [preset],
      policy: { rules: [rule] },
    });

    await expect(
      readFile(getGlobalPresetsPath(agentDir)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(readFile(getGlobalPolicyPath(agentDir))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  it("migrates project presets and removes the project sidecar", async () => {
    await put(getProjectPresetsPath(cwd), { version: 1, presets: [preset] });

    const result = await migrateScope("project", cwd, agentDir);

    expect(result.migrated).toBe(true);
    expect(await readDocument(getProjectConfigPath(cwd))).toEqual({
      version: 2,
      presets: [preset],
    });

    await expect(readFile(getProjectPresetsPath(cwd))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("copies invalid individual entries unchanged for normal validation", async () => {
    const invalid = { name: "broken", provider: "anthropic" };

    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset, invalid],
    });
    await put(getGlobalPolicyPath(agentDir), { version: 1, rules: [rule] });

    await migrateScope("user", cwd, agentDir);

    const document = await readDocument(getGlobalConfigPath(agentDir));

    expect(document.presets).toEqual([preset, invalid]);
    expect(document.policy).toEqual({ rules: [rule] });
  });

  it("leaves a scope unchanged when a legacy file is invalid", async () => {
    const original = "not json";

    await put(getGlobalPresetsPath(agentDir), original);
    await put(getGlobalPolicyPath(agentDir), { version: 1, rules: [rule] });

    const result = await migrateScope("user", cwd, agentDir);

    expect(result.migrated).toBe(false);
    expect(result.warnings[0]).toContain(getGlobalPresetsPath(agentDir));
    expect(await readFile(getGlobalPresetsPath(agentDir), "utf8")).toBe(
      original,
    );

    await expect(readFile(getGlobalConfigPath(agentDir))).rejects.toMatchObject(
      { code: "ENOENT" },
    );

    expect(await readDocument(getGlobalPolicyPath(agentDir))).toEqual({
      version: 1,
      rules: [rule],
    });
  });

  it("does not delete sidecars when the destination cannot be written", async () => {
    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset],
    });

    const atomicFs = {
      mkdir,
      open: () => Promise.reject(new Error("disk full")),
      rename: () => Promise.resolve(),
      unlink: () => Promise.resolve(),
    } as unknown as AtomicWriteFs;
    const migrationFs: MigrationFs = {
      readFile,
      unlink,
      atomicWriteFs: atomicFs,
    };

    const result = await migrateScope("user", cwd, agentDir, migrationFs);

    expect(result.migrated).toBe(false);
    expect(result.warnings.join(" ")).toContain("could not write");
    expect(await readDocument(getGlobalPresetsPath(agentDir))).toEqual({
      version: 1,
      presets: [preset],
    });
  });

  it("treats missing cleanup files as success and warns on other cleanup failures", async () => {
    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset],
    });

    const missing = getGlobalPolicyPath(agentDir);
    const success = await migrateScope("user", cwd, agentDir);

    expect(success.warnings).toEqual([]);

    await rm(getGlobalConfigPath(agentDir));
    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset],
    });
    await put(missing, { version: 1, rules: [] });

    const cleanupFs: MigrationFs = {
      readFile,
      unlink: async (path) => {
        if (String(path) === missing) throw new Error("permission denied");
        await rm(String(path), { force: true });
      },
    };
    const failedCleanup = await migrateScope("user", cwd, agentDir, cleanupFs);

    expect(failedCleanup.migrated).toBe(true);
    expect(failedCleanup.warnings.join(" ")).toContain(missing);
  });

  it("makes a second migration attempt a no-op and ignores sidecars beside v2", async () => {
    await put(getGlobalConfigPath(agentDir), { version: 2, presets: [preset] });
    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [{ ...preset, name: "stale" }],
    });

    const first = await migrateScope("user", cwd, agentDir);
    const second = await migrateScope("user", cwd, agentDir);

    expect(first).toEqual({
      scope: "user",
      attempted: false,
      migrated: false,
      warnings: [],
    });
    expect(second).toEqual(first);
    expect(await readDocument(getGlobalPresetsPath(agentDir))).toEqual({
      version: 1,
      presets: [{ ...preset, name: "stale" }],
    });
  });

  it("retries after a failed scope without changing the other scope", async () => {
    await put(getGlobalPresetsPath(agentDir), "{");

    const first = await migrateAll(cwd, agentDir);

    expect(first.find((outcome) => outcome.scope === "user")?.migrated).toBe(
      false,
    );

    await put(getGlobalPresetsPath(agentDir), {
      version: 1,
      presets: [preset],
    });

    const second = await migrateAll(cwd, agentDir);

    expect(second.find((outcome) => outcome.scope === "user")?.migrated).toBe(
      true,
    );
  });
});
