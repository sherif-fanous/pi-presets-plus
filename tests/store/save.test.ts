/**
 * Tests for `src/store/save.ts`.
 *
 * Covers spec scenarios for the atomic write requirement:
 *
 * - happy-path: destination contains exactly the requested contents
 * - parent directory is created when missing (`mkdir -p`)
 * - "crash between write and rename" simulation: previous destination
 *   contents survive, no `.tmp` file lingers (we check that after our
 *   simulated abort, the tmp file is cleaned up by `atomicWrite`'s
 *   finally block — and that the destination is unchanged).
 * - tmp filename uniqueness across two synchronous calls (PID + hrtime).
 */
import * as fsPromises from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { atomicWrite, makeTmpPath } from "../../src/store/save.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pi-presets-save-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
describe("atomicWrite", () => {
  it("writes exactly the requested bytes to the destination", async () => {
    const target = join(dir, "presets.json");
    const payload = JSON.stringify({ version: 1, presets: [] }, null, 2);

    await atomicWrite(target, payload);
    expect(await readFile(target, "utf-8")).toBe(payload);
  });
  it("creates parent directories recursively when missing", async () => {
    const target = join(dir, "nested", "deeper", "presets.json");

    await atomicWrite(target, "{}");
    expect(await readFile(target, "utf-8")).toBe("{}");
  });
  it("leaves no `.tmp.*` artifact behind on success", async () => {
    const target = join(dir, "presets.json");

    await atomicWrite(target, "{}");

    const entries = await readdir(dir);

    expect(entries.filter((e) => e.includes(".tmp."))).toEqual([]);
  });
  it("preserves the existing destination contents when the rename step fails", async () => {
    const target = join(dir, "presets.json");
    const original = JSON.stringify({ version: 1, presets: [{ name: "old" }] });

    await writeFile(target, original, "utf-8");

    // Simulate a crash *between* the durable write and the rename by
    // passing an injected fs whose `rename` throws. The destination
    // must remain the original content; the orphaned tmp file must be
    // cleaned up by atomicWrite's finally branch.
    const rename = vi
      .fn<typeof fsPromises.rename>()
      .mockRejectedValueOnce(new Error("simulated crash"));

    await expect(
      atomicWrite(target, "new", {
        mkdir: fsPromises.mkdir,
        open: fsPromises.open,
        rename,
        unlink: fsPromises.unlink,
      }),
    ).rejects.toThrow("simulated crash");
    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readFile(target, "utf-8")).toBe(original);

    const entries = await readdir(dir);

    expect(entries.filter((e) => e.includes(".tmp."))).toEqual([]);
  });
  it("works when the destination's parent already exists", async () => {
    const target = join(dir, "existing", "presets.json");

    await mkdir(join(dir, "existing"), { recursive: true });
    await atomicWrite(target, "abc");
    expect(await readFile(target, "utf-8")).toBe("abc");
  });
});
describe("makeTmpPath", () => {
  it("co-locates the tmp file with the target and includes the PID", () => {
    const path = makeTmpPath("/tmp/foo/bar.json");

    expect(path.startsWith("/tmp/foo/bar.json.tmp.")).toBe(true);
    expect(path).toContain(`.tmp.${process.pid}.`);
  });
  it("returns distinct paths on consecutive calls", () => {
    const a = makeTmpPath("/tmp/foo/bar.json");
    const b = makeTmpPath("/tmp/foo/bar.json");

    expect(a).not.toBe(b);
  });
});
