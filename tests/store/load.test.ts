/**
 * Tests for `src/store/load.ts`.
 *
 * Uses a per-test temp directory to exercise real filesystem I/O without
 * depending on the user environment. Covers all spec scenarios:
 *
 * - missing file → empty + no warning
 * - invalid JSON → empty + warning
 * - unsupported version → empty + warning, file untouched
 * - missing top-level fields → empty + warning
 * - mix of valid and invalid presets in one file → valid kept + warnings for invalid
 * - duplicate names within one file → first kept + warning for the rest
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadFile } from "../../src/store/load.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;

async function writeRaw(content: string): Promise<string> {
  const path = join(dir, "presets.json");

  await writeFile(path, content, "utf-8");

  return path;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pi-presets-load-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadFile", () => {
  it("returns empty + no warnings when the file is missing", async () => {
    const result = await loadFile(join(dir, "nonexistent.json"));
    expect(result).toEqual({ presets: [], warnings: [] });
  });

  it("treats invalid JSON as empty and warns", async () => {
    const path = await writeRaw("{ not json");
    const result = await loadFile(path);
    expect(result.presets).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("invalid JSON");
    // File should not be modified by the loader.
    const after = await readFile(path, "utf-8");
    expect(after).toBe("{ not json");
  });

  it("treats arrays at the top level as malformed", async () => {
    const path = await writeRaw("[]");
    const result = await loadFile(path);
    expect(result.presets).toEqual([]);
    expect(result.warnings[0]).toContain("top-level");
  });

  it("treats unsupported versions as empty and does not rewrite", async () => {
    const original = JSON.stringify({ version: 2, presets: [] });
    const path = await writeRaw(original);
    const result = await loadFile(path);
    expect(result.presets).toEqual([]);
    expect(result.warnings[0]).toContain("unsupported version");
    // File on disk must be untouched.
    expect(await readFile(path, "utf-8")).toBe(original);
  });

  it("warns when 'presets' is missing or not an array", async () => {
    const path = await writeRaw(JSON.stringify({ version: 1 }));
    const result = await loadFile(path);
    expect(result.presets).toEqual([]);
    expect(result.warnings[0]).toContain('"presets"');
  });

  it("loads valid presets and skips invalid ones with warnings", async () => {
    const path = await writeRaw(
      JSON.stringify({
        version: 1,
        presets: [
          {
            name: "plan",
            provider: "anthropic",
            model: "claude-opus-4.5",
          },
          {
            // Invalid: missing model.
            name: "ship",
            provider: "anthropic",
          },
          {
            name: "review",
            provider: "openai",
            model: "gpt-5",
            thinkingLevel: "ultra", // invalid enum
          },
          {
            name: "explore",
            provider: "openai",
            model: "gpt-5",
            thinkingLevel: "high",
          },
        ],
      }),
    );

    const result = await loadFile(path);
    expect(result.presets.map((p) => p.name)).toEqual(["plan", "explore"]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join("\n")).toContain('"ship"');
    expect(result.warnings.join("\n")).toContain('"review"');
  });

  it("keeps the first occurrence of a duplicate name and warns about the rest", async () => {
    const path = await writeRaw(
      JSON.stringify({
        version: 1,
        presets: [
          {
            name: "plan",
            provider: "anthropic",
            model: "claude-opus-4.5",
          },
          {
            name: "plan",
            provider: "openai",
            model: "gpt-5",
          },
          {
            name: "ship",
            provider: "openai",
            model: "gpt-5",
          },
        ],
      }),
    );
    const result = await loadFile(path);
    expect(result.presets.map((p) => p.name)).toEqual(["plan", "ship"]);
    expect(result.presets[0]?.provider).toBe("anthropic");
    expect(result.warnings.join("\n")).toContain("duplicate");
  });

  it("uses an index label when an invalid preset has no name string", async () => {
    const path = await writeRaw(
      JSON.stringify({
        version: 1,
        presets: [
          { provider: "x", model: "y" }, // no name
        ],
      }),
    );
    const result = await loadFile(path);
    expect(result.presets).toEqual([]);
    expect(result.warnings[0]).toContain("at index 0");
  });
});
