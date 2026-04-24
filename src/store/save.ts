/**
 * Atomic file writes for preset storage.
 *
 * `atomicWrite(target, contents)`:
 *
 *  1. `mkdir -p` the parent directory.
 *  2. Write to a unique tmp file in the same directory.
 *  3. `fsync()` the tmp file so its contents are durable on disk.
 *  4. `rename(tmp, target)` — atomic on POSIX and on NTFS via Node's
 *     `fs.rename` (which uses `MOVEFILE_REPLACE_EXISTING`).
 *
 * The tmp file is uniquely named with `process.pid` plus a high-resolution
 * timestamp so concurrent writers from different processes do not collide.
 * On any failure, the tmp file is best-effort removed; the destination is
 * never observed in a partially-written state.
 *
 * Concurrent edits within one process are last-write-wins. v1 storage
 * does not need cross-process locking at human edit rates.
 */

import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Subset of `node:fs/promises` we depend on. Exposed so tests can inject
 * a stub that simulates rename failures (Node's ESM exports of native
 * modules are not spy-able via vitest).
 */
export interface AtomicWriteFs {
  mkdir: typeof mkdir;
  open: typeof open;
  rename: typeof rename;
  unlink: typeof unlink;
}

const defaultFs: AtomicWriteFs = { mkdir, open, rename, unlink };

/**
 * Atomically write `contents` to `target`.
 *
 * Throws on I/O failure; the destination is never partially written. The
 * caller is responsible for serializing concurrent writes within the
 * same process if it wants stricter ordering than last-write-wins.
 *
 * @param fs Override the underlying `node:fs/promises` calls (for tests).
 */
export async function atomicWrite(
  target: string,
  contents: string,
  fs: AtomicWriteFs = defaultFs,
): Promise<void> {
  const dir = dirname(target);

  await fs.mkdir(dir, { recursive: true });

  const temporaryFilePath = makeTmpPath(target);
  let renamed = false;
  const fileHandle = await fs.open(temporaryFilePath, "w");

  try {
    try {
      await fileHandle.writeFile(contents);
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }

    await fs.rename(temporaryFilePath, target);
    renamed = true;
  } finally {
    if (!renamed) {
      // Best effort: don't mask the original error if cleanup fails.
      await fs.unlink(temporaryFilePath).catch(() => undefined);
    }
  }
}

/**
 * Build a tmp file path co-located with `target` so the rename is on the
 * same filesystem and therefore guaranteed atomic.
 *
 * Uses `process.pid` and a high-resolution timestamp to avoid collisions
 * between concurrent writers; `process.hrtime.bigint()` is monotonic
 * within a single process so the suffix never repeats per call.
 */
export function makeTmpPath(target: string): string {
  return `${target}.tmp.${process.pid}.${process.hrtime.bigint().toString(36)}`;
}
