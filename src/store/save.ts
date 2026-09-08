/**
 * Writes a file durably by creating the parent directory, filling a
 * temporary file, syncing it, and renaming it over the destination. Every
 * user-visible file presets-plus persists goes through this path, so no
 * reader sees a half-written file.
 */
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The `node:fs/promises` calls this module makes. Tests inject a stub to
 * simulate rename failures, which vitest cannot spy on because Node's
 * native modules export frozen ESM bindings.
 */
interface AtomicWriteFs {
  mkdir: typeof mkdir;
  open: typeof open;
  rename: typeof rename;
  unlink: typeof unlink;
}

/** Real filesystem calls, used unless a caller injects a stub. */
const defaultFs: AtomicWriteFs = { mkdir, open, rename, unlink };

/**
 * Atomically write `contents` to `target`.
 *
 * Throws on I/O failure, leaving the destination untouched. A caller that
 * wants stricter ordering than last write wins has to serialize its own
 * concurrent writes.
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
 * Build a temporary file path next to `target` so the later rename stays
 * on one filesystem and therefore stays atomic.
 *
 * The process id and the monotonic `process.hrtime.bigint()` reading keep
 * concurrent writers from picking the same path.
 */
export function makeTmpPath(target: string): string {
  return `${target}.tmp.${process.pid}.${process.hrtime.bigint().toString(36)}`;
}
