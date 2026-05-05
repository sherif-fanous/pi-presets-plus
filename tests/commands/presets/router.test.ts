/**
 * Tests for `src/commands/presets/router.ts`.
 *
 * Focused on the router layer: argument completion filtering, interactive
 * mode guardrails, unsupported `list` handling, unknown subcommand fallback,
 * and dispatch to non-picker subcommands. The handlers themselves
 * (`runReload`) are covered by their own test files plus the storage API
 * integration tests — here we stub out `ctx` entirely.
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
 * enough surface for `loadAll` to succeed when dispatching to commands that
 * still read storage.
 *
 * Notes on isolation:
 * - `cwd` is a non-existent path → project-scope file is missing.
 * - `PI_CODING_AGENT_DIR` is overridden in `beforeEach` to a fresh tmp
 *   dir so the global-scope file is also missing. Without that, `loadAll`
 *   would read the developer's real `~/.pi/agent/presets-plus/presets.json`.
 * - `ui.theme` provides identity stubs for `fg`/`bold` so styled formatters
 *   produce plain text suitable for substring assertions.
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
  it("returns supported subcommands when the prefix is empty", () => {
    const result = getArgumentCompletions("");

    expect(result.map((completion) => completion.value).sort()).toEqual([
      "clear",
      "reload",
      "status",
    ]);
  });

  it("filters by exact prefix match", () => {
    expect(
      getArgumentCompletions("re").map((completion) => completion.value),
    ).toEqual(["reload"]);

    expect(getArgumentCompletions("li")).toEqual([]);
    expect(getArgumentCompletions("save")).toEqual([]);
    expect(getArgumentCompletions("edit")).toEqual([]);
    expect(getArgumentCompletions("rm")).toEqual([]);
  });

  it("does not complete removed list flags", () => {
    expect(getArgumentCompletions("list --t")).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    expect(getArgumentCompletions("xyz")).toEqual([]);
    expect(getArgumentCompletions("list --json")).toEqual([]);
  });

  it("each entry carries a human-readable label", () => {
    for (const entry of getArgumentCompletions("")) {
      expect(entry.label.length).toBeGreaterThan(entry.value.length);
    }
  });
});

describe("handlePresetsCommand", () => {
  it("warns when the bare picker is invoked without interactive pi API", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("interactive mode");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("warns on an unknown subcommand", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("bogus", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain('"bogus"');
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("does not open the picker for `list`", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("list", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("not a supported");
    expect(notify.mock.calls[0]?.[0]).toContain("/presets");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("does not print text for `list --text`", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("list --text", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("not a supported");
    expect(notify.mock.calls[0]?.[0]).not.toContain("no presets configured");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it.each(["save quickfix", "edit plan", "rm plan"])(
    "does not expose CRUD subcommand %s",
    async (args) => {
      const { ctx, notify } = makeStubCtx();

      await handlePresetsCommand(args, ctx);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[0]).toContain("unknown subcommand");
      expect(notify.mock.calls[0]?.[1]).toBe("warning");
    },
  );

  it("does not support exact-name activation fallback", async () => {
    const { ctx, notify } = makeStubCtx();
    const pi = { getActiveTools: () => [] } as unknown as NonNullable<
      Parameters<typeof handlePresetsCommand>[2]
    >;

    await handlePresetsCommand("plan", ctx, pi);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain('"plan"');
    expect(notify.mock.calls[0]?.[0]).toContain("unknown subcommand");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("dispatches `reload` to runReload (empty-state path)", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand("reload", ctx);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("reloaded 0 presets");
    expect(notify.mock.calls[0]?.[1]).toBe("info");
  });
});
