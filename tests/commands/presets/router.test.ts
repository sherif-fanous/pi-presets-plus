/**
 * Tests for `src/commands/presets/router.ts`.
 *
 * Focused on the router layer: argument completion filtering, bare
 * invocation (→ stub notice), unknown subcommand fallback, and dispatch
 * to the correct handler. The handlers themselves (`runList`,
 * `runReload`) are covered by their own test files plus the storage
 * API integration tests — here we stub out `ctx` entirely.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getArgumentCompletions,
  handlePresetsCommand,
} from "../../../src/commands/presets/router.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let agentDir: string;
let prevAgentDirEnv: string | undefined;

/**
 * Build a fake `ExtensionCommandContext` with a spy-able `ui.notify` and
 * enough surface for `loadAll` to succeed. Tests that dispatch to `runList`
 * or `runReload` point `cwd` at a nonexistent dir so the loader returns
 * the empty-state path (no filesystem work needed).
 *
 * Notes on isolation:
 * - `cwd` is a non-existent path → project-scope file is missing.
 * - `PI_CODING_AGENT_DIR` is overridden in `beforeEach` to a fresh tmp
 *   dir so the global-scope file is also missing. Without that, `loadAll`
 *   would read the developer's real `~/.pi/agent/presets-plus/presets.json`
 *   and tests assuming the empty-state path would fail.
 * - `ui.theme` provides identity stubs for `fg`/`bold` so the styled
 *   formatter in `runList` produces plain text suitable for substring
 *   assertions in the empty-state test.
 */
function makeStubCtx() {
  const notify = vi.fn<(message: string, type?: string) => void>();

  return {
    notify,
    ctx: {
      cwd: "/tmp/pi-presets-router-does-not-exist",
      ui: {
        notify,
        theme: {
          fg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        },
      },
      modelRegistry: {
        find: () => undefined,
        hasConfiguredAuth: () => false,
      },
    } as unknown as Parameters<typeof handlePresetsCommand>[1],
  };
}

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-router-agent-"));
  prevAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(async () => {
  if (prevAgentDirEnv === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = prevAgentDirEnv;
  }

  await rm(agentDir, { recursive: true, force: true });
});

describe("getArgumentCompletions", () => {
  it("returns all subcommands when the prefix is empty", () => {
    const result = getArgumentCompletions("");

    expect(result.map((completion) => completion.value).sort()).toEqual([
      "list",
      "reload",
    ]);
  });

  it("filters by exact prefix match", () => {
    expect(
      getArgumentCompletions("re").map((completion) => completion.value),
    ).toEqual(["reload"]);

    expect(
      getArgumentCompletions("li").map((completion) => completion.value),
    ).toEqual(["list"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(getArgumentCompletions("xyz")).toEqual([]);
  });

  it("each entry carries a human-readable label", () => {
    for (const entry of getArgumentCompletions("")) {
      expect(entry.label.length).toBeGreaterThan(entry.value.length);
    }
  });
});

describe("handlePresetsCommand", () => {
  it("shows the stub notice on bare invocation", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("/presets list");
    expect(notify.mock.calls[0]?.[1]).toBe("info");
  });

  it("warns on an unknown subcommand", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("bogus", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain('"bogus"');
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("dispatches `list` to runList (empty-state path)", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("list", ctx);
    // runList with no presets emits a single info notification listing
    // both file paths the user could create.
    expect(notify).toHaveBeenCalled();

    const firstCall = notify.mock.calls[0];

    expect(firstCall?.[0]).toContain("No presets configured.");
    expect(firstCall?.[1]).toBe("info");
  });

  it("dispatches `reload` to runReload (empty-state path)", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("reload", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("Reloaded 0 presets");
    expect(notify.mock.calls[0]?.[1]).toBe("info");
  });

  it("ignores trailing tokens after the subcommand", async () => {
    // `list` should dispatch regardless of trailing junk; the storage
    // spec's only required subcommands take no args in this change.
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("list extra tokens", ctx);
    expect(notify.mock.calls[0]?.[0]).toContain("No presets configured.");
  });
});
