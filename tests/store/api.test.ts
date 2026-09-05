/**
 * Tests for `src/store/api.ts`.
 *
 * Each test sets up a fresh tmp dir and points both scopes at it via:
 *   - `PI_CODING_AGENT_DIR` env var → controls `getAgentDir()`, and thus
 *     the global path returned by `getGlobalPresetsPath()`.
 *   - `ctx.cwd` → controls the project path returned by
 *     `getProjectPresetsPath(cwd)`.
 *
 * A minimal `modelRegistry` stub keeps availability classification
 * predictable. The tests focus on the API layer's contracts (CRUD
 * outcomes, error paths, idempotency); lower layers are covered by their
 * own files.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  addPreset,
  loadAll,
  movePreset,
  removePreset,
  reorderWithinScope,
  saveScope,
  updatePreset,
} from "../../src/store/api.js";
import type { Preset, PresetScope } from "../../src/types.js";
import {
  makeStubModelRegistry,
  type RegistryStub,
} from "../helpers/model-registry.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fullRegistry: RegistryStub = {
  models: {
    anthropic: { "claude-opus-4.5": { hasKey: true, reasoning: true } },
    openai: { "gpt-5": { hasKey: true, reasoning: false } },
  },
};

let dir: string;
let agentDir: string;
let projectDir: string;
let prevAgentDirEnv: string | undefined;

function makeCtx(cwd: string, stub: RegistryStub) {
  return {
    cwd,
    modelRegistry: makeStubModelRegistry(stub),
  };
}

function preset(name: string, extra: Partial<Preset> = {}): Preset {
  return {
    name,
    provider: "anthropic",
    model: "claude-opus-4.5",
    ...extra,
  };
}

function presetPath(scope: PresetScope): string {
  return scope === "user"
    ? join(agentDir, "presets-plus", "presets.json")
    : join(projectDir, ".pi", "presets-plus", "presets.json");
}

function unsafeMutationReason(scope: PresetScope, path: string): string {
  return `Pi Presets Plus did not change the ${scope} preset file at ${path}. It could not load the complete file. Fix the file and try again.`;
}

async function writeRawScope(
  scope: PresetScope,
  contents: string,
): Promise<string> {
  const path = presetPath(scope);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf-8");

  return path;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pi-presets-api-"));
  agentDir = join(dir, "agent");
  projectDir = join(dir, "project");
  prevAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(async () => {
  if (prevAgentDirEnv === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = prevAgentDirEnv;
  }

  await rm(dir, { recursive: true, force: true });
});

describe("loadAll", () => {
  it("returns an empty list when neither file exists", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await loadAll(ctx);

    expect(result.presets).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.hotkeyAnalysis.conflicts).toEqual([]);
    expect(result.hotkeyAnalysis.invalid).toEqual([]);
  });

  it("merges both scopes and surfaces warnings from each", async () => {
    // Write a malformed global file (warning) and a valid project file.
    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(
      join(agentDir, "presets-plus", "presets.json"),
      "not json",
      "utf-8",
    );

    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("project", [preset("plan")], ctx);

    const result = await loadAll(ctx);

    expect(
      result.presets.map((loaded) => `${loaded.scope}:${loaded.name}`),
    ).toEqual(["project:plan"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("invalid JSON");
  });

  it("sets clampWarning for loaded presets that will clamp thinking", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope(
      "user",
      [
        preset("reasoning", { thinkingLevel: "high" }),
        preset("clamped", {
          model: "gpt-5",
          provider: "openai",
          thinkingLevel: "high",
        }),
        preset("off", {
          model: "gpt-5",
          provider: "openai",
          thinkingLevel: "off",
        }),
      ],
      ctx,
    );

    const loaded = await loadAll(ctx);

    expect(
      loaded.presets.find((entry) => entry.name === "reasoning")?.clampWarning,
    ).toBeUndefined();

    expect(
      loaded.presets.find((entry) => entry.name === "clamped")?.clampWarning,
    ).toBe(true);

    expect(
      loaded.presets.find((entry) => entry.name === "off")?.clampWarning,
    ).toBeUndefined();
  });

  it("observes external file edits between calls (no in-memory cache)", async () => {
    // Models the spec's `ctx.reload()` requirement: no caches survive.
    // Two consecutive calls to `loadAll` against the same context must
    // reflect the on-disk state at call time, not a snapshot from the
    // first call.
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const first = await loadAll(ctx);

    expect(first.presets.map((loaded) => loaded.name)).toEqual(["a"]);

    // External edit: bypass the API and write directly.
    await mkdir(join(agentDir, "presets-plus"), { recursive: true });
    await writeFile(
      join(agentDir, "presets-plus", "presets.json"),
      JSON.stringify({
        version: 1,
        presets: [preset("a"), preset("b")],
      }),
      "utf-8",
    );

    const second = await loadAll(ctx);

    expect(second.presets.map((loaded) => loaded.name)).toEqual(["a", "b"]);
  });
});

describe("saveScope", () => {
  it("writes a versioned file containing exactly the supplied presets", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("plan"), preset("ship")], ctx);

    const path = join(agentDir, "presets-plus", "presets.json");
    const parsed = JSON.parse(await readFile(path, "utf-8")) as {
      version: number;
      presets: Preset[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.presets.map((entry) => entry.name)).toEqual(["plan", "ship"]);
  });

  it("only touches the affected scope's file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("project", [preset("p")], ctx);

    const result = await loadAll(ctx);

    expect(
      result.presets.map((loaded) => `${loaded.scope}:${loaded.name}`),
    ).toEqual(["project:p"]);
  });

  it("strips merge-only metadata when round-tripping LoadedPresets", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const loaded = (await loadAll(ctx)).presets;

    // Re-save the loaded list and verify the on-disk JSON has no
    // `scope`/`shadowed`/`unavailable` fields.
    await saveScope("user", loaded, ctx);

    const raw = await readFile(
      join(agentDir, "presets-plus", "presets.json"),
      "utf-8",
    );

    expect(raw).not.toContain('"scope"');
    expect(raw).not.toContain('"shadowed"');
    expect(raw).not.toContain('"unavailable"');
  });
});

describe("addPreset", () => {
  it("appends to an empty scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result).toEqual({ ok: true });

    const loaded = await loadAll(ctx);

    expect(loaded.presets.map((entry) => entry.name)).toEqual(["plan"]);
  });

  it("returns Err on name collision within the same scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await addPreset(preset("plan"), "user", ctx);

    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result.ok).toBe(false);

    if (result.ok === false) {
      expect(result.reason).toContain('"plan"');
    }
  });

  it("allows the same name in a different scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await addPreset(preset("plan"), "user", ctx);

    const result = await addPreset(preset("plan"), "project", ctx);

    expect(result).toEqual({ ok: true });
  });
});

describe("updatePreset", () => {
  it("replaces a preset in place, preserving position", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);

    const result = await updatePreset(
      "b",
      "user",
      preset("b", { thinkingLevel: "high" }),
      ctx,
    );

    expect(result).toEqual({ ok: true });

    const names = (await loadAll(ctx)).presets.map((entry) => entry.name);

    expect(names).toEqual(["a", "b", "c"]);

    const loadedB = (await loadAll(ctx)).presets[1];

    expect(loadedB?.thinkingLevel).toBe("high");
  });

  it("supports renaming when there is no collision", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("old")], ctx);

    const result = await updatePreset("old", "user", preset("new"), ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "new",
    ]);
  });

  it("returns Err when the target name is missing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const result = await updatePreset("nope", "user", preset("nope"), ctx);

    expect(result.ok).toBe(false);
  });

  it("returns Err when a rename would collide with another preset", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const result = await updatePreset("a", "user", preset("b"), ctx);

    expect(result.ok).toBe(false);
  });
});

describe("movePreset", () => {
  it("moves a user preset to the project scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("keep"), preset("move")], ctx);
    await saveScope("project", [preset("project")], ctx);

    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("moved"),
      ctx,
    );

    expect(result).toEqual({ ok: true });
    expect(
      (await loadAll(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:keep", "project:project", "project:moved"]);
  });

  it("moves a project preset to the user scope", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("user")], ctx);
    await saveScope("project", [preset("move"), preset("keep")], ctx);

    const result = await movePreset(
      "move",
      "project",
      "user",
      preset("moved"),
      ctx,
    );

    expect(result).toEqual({ ok: true });
    expect(
      (await loadAll(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:user", "user:moved", "project:keep"]);
  });

  it("rejects matching source and destination scopes without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    const result = await movePreset(
      "move",
      "user",
      "user",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: "Source and destination scopes must be different.",
    });
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("rejects a missing source without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    await saveScope("user", [preset("keep")], ctx);

    const result = await movePreset(
      "missing",
      "user",
      "project",
      preset("missing"),
      ctx,
      writeScope,
    );

    expect(result.ok).toBe(false);
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("rejects a destination collision without writing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeScope = vi.fn<typeof saveScope>();

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("taken")], ctx);

    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("taken"),
      ctx,
      writeScope,
    );

    expect(result.ok).toBe(false);
    expect(writeScope).not.toHaveBeenCalled();
  });

  it("leaves both scopes unchanged when the destination write fails", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const writeError = new Error("destination write failed");
    const writeScope = vi.fn<typeof saveScope>().mockRejectedValue(writeError);

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    await expect(
      movePreset("move", "user", "project", preset("move"), ctx, writeScope),
    ).rejects.toBe(writeError);

    expect(
      (await loadAll(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep"]);
  });

  it("restores the destination when the source write fails", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const sourceError = new Error("source write failed");
    const writeScope = vi.fn<typeof saveScope>(
      async (scope, presets, context) => {
        if (writeScope.mock.calls.length === 2) throw sourceError;
        await saveScope(scope, presets, context);
      },
    );

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    await expect(
      movePreset("move", "user", "project", preset("move"), ctx, writeScope),
    ).rejects.toBe(sourceError);
    expect(writeScope).toHaveBeenCalledTimes(3);
    expect(
      (await loadAll(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep"]);
  });

  it("reports both errors when the source write and rollback fail", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const sourceError = new Error("source write failed");
    const rollbackError = new Error("rollback failed");
    const writeScope = vi.fn<typeof saveScope>(
      async (scope, presets, context) => {
        if (writeScope.mock.calls.length === 2) throw sourceError;
        if (writeScope.mock.calls.length === 3) throw rollbackError;
        await saveScope(scope, presets, context);
      },
    );

    await saveScope("user", [preset("move")], ctx);
    await saveScope("project", [preset("keep")], ctx);

    let thrown: unknown;

    try {
      await movePreset(
        "move",
        "user",
        "project",
        preset("move"),
        ctx,
        writeScope,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);

    if (!(thrown instanceof AggregateError)) {
      throw new Error("Expected movePreset to throw AggregateError.");
    }

    expect(thrown.errors).toEqual([sourceError, rollbackError]);
    expect(thrown.message).toBe(
      "The preset move failed, and Pi Presets Plus could not restore the destination scope.",
    );

    expect(
      (await loadAll(ctx)).presets.map(
        (entry) => `${entry.scope}:${entry.name}`,
      ),
    ).toEqual(["user:move", "project:keep", "project:move"]);
  });
});

describe("removePreset", () => {
  it("removes a present entry", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const result = await removePreset("a", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "b",
    ]);
  });

  it("is a no-op when the entry does not exist (idempotent)", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const result = await removePreset("missing", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "a",
    ]);
  });
});

describe("reorderWithinScope", () => {
  it("rewrites the file in the requested order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);

    const result = await reorderWithinScope("user", ["c", "a", "b"], ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("appends omitted names at the end in their original order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);
    await reorderWithinScope("user", ["c"], ctx);
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("ignores names that don't match any existing preset", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["ghost", "b", "a"], ctx);
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "b",
      "a",
    ]);
  });

  it("ignores duplicate names within the requested order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["a", "a", "b"], ctx);
    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("unsafe mutation protection", () => {
  it("allows add when the scope file is missing", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    expect(await addPreset(preset("plan"), "project", ctx)).toEqual({
      ok: true,
    });

    expect((await loadAll(ctx)).presets.map((entry) => entry.name)).toEqual([
      "plan",
    ]);
  });

  it("rejects add when the scope path cannot be read as a file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const path = presetPath("user");

    await mkdir(path, { recursive: true });

    const result = await addPreset(preset("plan"), "user", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", path),
    });
    expect((await stat(path)).isDirectory()).toBe(true);
  });

  it("rejects update and preserves invalid JSON", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = "{ not json";
    const path = await writeRawScope("user", original);

    const result = await updatePreset("plan", "user", preset("plan"), ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects remove and preserves an unsupported version", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = JSON.stringify({ presets: [preset("plan")], version: 2 });
    const path = await writeRawScope("project", original);

    const result = await removePreset("plan", "project", ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects reorder and preserves invalid top-level structure", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const original = "[]";
    const path = await writeRawScope("project", original);

    const result = await reorderWithinScope("project", ["plan"], ctx);

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", path),
    });
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("rejects move and preserves a source with an invalid entry", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);
    const source = JSON.stringify({
      presets: [preset("move"), { name: "broken", provider: "anthropic" }],
      version: 1,
    });
    const sourcePath = await writeRawScope("user", source);

    await saveScope("project", [preset("keep")], ctx);

    const destinationPath = presetPath("project");
    const destination = await readFile(destinationPath, "utf-8");
    const writeScope = vi.fn<typeof saveScope>();
    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("user", sourcePath),
    });
    expect(writeScope).not.toHaveBeenCalled();
    expect(await readFile(sourcePath, "utf-8")).toBe(source);
    expect(await readFile(destinationPath, "utf-8")).toBe(destination);
  });

  it("rejects move and preserves a destination with duplicate names", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("move")], ctx);

    const sourcePath = presetPath("user");
    const source = await readFile(sourcePath, "utf-8");
    const destination = JSON.stringify({
      presets: [preset("keep"), preset("keep")],
      version: 1,
    });
    const destinationPath = await writeRawScope("project", destination);
    const writeScope = vi.fn<typeof saveScope>();
    const result = await movePreset(
      "move",
      "user",
      "project",
      preset("move"),
      ctx,
      writeScope,
    );

    expect(result).toEqual({
      ok: false,
      reason: unsafeMutationReason("project", destinationPath),
    });
    expect(writeScope).not.toHaveBeenCalled();
    expect(await readFile(sourcePath, "utf-8")).toBe(source);
    expect(await readFile(destinationPath, "utf-8")).toBe(destination);
  });
});
