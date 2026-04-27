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
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addPreset,
  loadAll,
  removePreset,
  reorderWithinScope,
  saveScope,
  updatePreset,
} from "../../src/store/api.js";
import type { Preset } from "../../src/types.js";
import type { Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface RegistryStub {
  models: Record<string, Record<string, { hasKey: boolean }>>;
}

const fullRegistry: RegistryStub = {
  models: {
    anthropic: { "claude-opus-4.5": { hasKey: true } },
    openai: { "gpt-5": { hasKey: true } },
  },
};
let dir: string;
let agentDir: string;
let projectDir: string;
let prevAgentDirEnv: string | undefined;

function makeCtx(cwd: string, stub: RegistryStub) {
  const modelRegistry = {
    find(provider: string, modelId: string): Model<never> | undefined {
      const present = stub.models[provider]?.[modelId];

      if (!present) return undefined;

      return { provider, id: modelId } as unknown as Model<never>;
    },
    hasConfiguredAuth(model: Model<never>): boolean {
      return stub.models[model.provider]?.[model.id]?.hasKey ?? false;
    },
  };

  return {
    cwd,
    // `StorageContext` types `modelRegistry` as the full `ModelRegistry`
    // class, which includes private fields (`authStorage`, `models`, etc.)
    // that a structural stub cannot satisfy. Cast at the boundary so test
    // call sites stay ergonomic; the only surface storage-layer code
    // actually reads is `find` + `hasConfiguredAuth`.
    modelRegistry: modelRegistry as unknown as ModelRegistry,
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

    expect(result).toEqual({ presets: [], warnings: [] });
  });

  it("merges both scopes and surfaces warnings from each", async () => {
    // Write a malformed global file (warning) and a valid project file.
    await writeFile(
      join(agentDir, "presets-plus", "presets.json"),
      "not json",
      { encoding: "utf-8", flag: "w" },
    ).catch(async () => {
      // Parent dir doesn't exist yet — create it via a quick mkdir.
      const { mkdir } = await import("node:fs/promises");

      await mkdir(join(agentDir, "presets-plus"), { recursive: true });
      await writeFile(
        join(agentDir, "presets-plus", "presets.json"),
        "not json",
        "utf-8",
      );
    });

    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("project", [preset("plan")], ctx);

    const result = await loadAll(ctx);

    expect(result.presets.map((p) => `${p.scope}:${p.name}`)).toEqual([
      "project:plan",
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("invalid JSON");
  });

  it("observes external file edits between calls (no in-memory cache)", async () => {
    // Models the spec's `ctx.reload()` requirement: no caches survive.
    // Two consecutive calls to `loadAll` against the same context must
    // reflect the on-disk state at call time, not a snapshot from the
    // first call.
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const first = await loadAll(ctx);

    expect(first.presets.map((p) => p.name)).toEqual(["a"]);

    // External edit: bypass the API and write directly.
    const { mkdir } = await import("node:fs/promises");

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

    expect(second.presets.map((p) => p.name)).toEqual(["a", "b"]);
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
    expect(parsed.presets.map((p) => p.name)).toEqual(["plan", "ship"]);
  });

  it("only touches the affected scope's file", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("project", [preset("p")], ctx);

    const result = await loadAll(ctx);

    expect(result.presets.map((p) => `${p.scope}:${p.name}`)).toEqual([
      "project:p",
    ]);
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

    expect(loaded.presets.map((p) => p.name)).toEqual(["plan"]);
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

    const names = (await loadAll(ctx)).presets.map((p) => p.name);

    expect(names).toEqual(["a", "b", "c"]);

    const loadedB = (await loadAll(ctx)).presets[1];

    expect(loadedB?.thinkingLevel).toBe("high");
  });

  it("supports renaming when there is no collision", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("old")], ctx);

    const result = await updatePreset("old", "user", preset("new"), ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual(["new"]);
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

describe("removePreset", () => {
  it("removes a present entry", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);

    const result = await removePreset("a", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual(["b"]);
  });

  it("is a no-op when the entry does not exist (idempotent)", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a")], ctx);

    const result = await removePreset("missing", "user", ctx);

    expect(result).toEqual({ ok: true });
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual(["a"]);
  });
});

describe("reorderWithinScope", () => {
  it("rewrites the file in the requested order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);
    await reorderWithinScope("user", ["c", "a", "b"], ctx);
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("appends omitted names at the end in their original order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b"), preset("c")], ctx);
    await reorderWithinScope("user", ["c"], ctx);
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("ignores names that don't match any existing preset", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["ghost", "b", "a"], ctx);
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual(["b", "a"]);
  });

  it("ignores duplicate names within the requested order", async () => {
    const ctx = makeCtx(projectDir, fullRegistry);

    await saveScope("user", [preset("a"), preset("b")], ctx);
    await reorderWithinScope("user", ["a", "a", "b"], ctx);
    expect((await loadAll(ctx)).presets.map((p) => p.name)).toEqual(["a", "b"]);
  });
});
