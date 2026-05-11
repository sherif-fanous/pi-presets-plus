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

import { ActivePresetSession } from "../../../src/activation/session.js";
import {
  getArgumentCompletions,
  handlePresetsCommand,
} from "../../../src/commands/presets/router.js";
import { HotkeyRegistry } from "../../../src/hotkey-registry.js";
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
  it("returns supported subcommands when the prefix is empty", async () => {
    const result = await getArgumentCompletions("");

    expect(result.map((completion) => completion.value).sort()).toEqual([
      "clear",
      "reload",
      "show-prompt",
      "status",
    ]);
  });

  it("filters by exact prefix match", async () => {
    expect(
      (await getArgumentCompletions("re")).map(
        (completion) => completion.value,
      ),
    ).toEqual(["reload"]);

    expect(await getArgumentCompletions("li")).toEqual([]);
    expect(await getArgumentCompletions("save")).toEqual([]);
    expect(await getArgumentCompletions("edit")).toEqual([]);
    expect(await getArgumentCompletions("rm")).toEqual([]);
    expect(await getArgumentCompletions("next")).toEqual([]);
    expect(await getArgumentCompletions("prev")).toEqual([]);
  });

  it("does not complete removed list flags", async () => {
    expect(await getArgumentCompletions("list --t")).toEqual([]);
  });

  it("returns nothing when nothing matches", async () => {
    expect(await getArgumentCompletions("xyz")).toEqual([]);
    expect(await getArgumentCompletions("list --json")).toEqual([]);
  });

  it("each entry carries a human-readable label", async () => {
    for (const entry of await getArgumentCompletions("")) {
      expect(entry.label.length).toBeGreaterThan(entry.value.length);
    }
  });

  it("returns all show-prompt names for an empty name prefix", async () => {
    const result = await getArgumentCompletions("show-prompt ", () =>
      Promise.resolve(["plan", "peer-review"]),
    );

    expect(result).toEqual([
      { label: "plan", value: "plan" },
      { label: "peer-review", value: "peer-review" },
    ]);
  });

  it("filters show-prompt names by prefix", async () => {
    const result = await getArgumentCompletions("show-prompt p", () =>
      Promise.resolve(["plan", "peer-review", "llm-review", "commit"]),
    );

    expect(result).toEqual([
      { label: "plan", value: "plan" },
      { label: "peer-review", value: "peer-review" },
    ]);
  });

  it("ignores extra spaces before show-prompt name prefixes", async () => {
    const result = await getArgumentCompletions("show-prompt   plan", () =>
      Promise.resolve(["plan", "peer-review"]),
    );

    expect(result).toEqual([{ label: "plan", value: "plan" }]);
  });

  it("returns no show-prompt names before the loader is wired", async () => {
    await expect(getArgumentCompletions("show-prompt ")).resolves.toEqual([]);
  });
});

describe("handlePresetsCommand", () => {
  it("warns when the bare picker is invoked without interactive pi API", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("interactive mode");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("warns on an unknown subcommand", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "bogus",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain('"bogus"');
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("does not open the picker for `list`", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "list",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("not a supported");
    expect(notify.mock.calls[0]?.[0]).toContain("/presets");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("does not print text for `list --text`", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "list --text",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("not a supported");
    expect(notify.mock.calls[0]?.[0]).not.toContain("no presets configured");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it.each(["save quickfix", "edit plan", "rm plan", "next", "prev"])(
    "does not expose unsupported subcommand %s",
    async (args) => {
      const { ctx, notify } = makeStubCtx();

      await handlePresetsCommand(
        args,
        ctx,
        undefined,
        new ActivePresetSession(),
        new HotkeyRegistry(),
      );
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

    await handlePresetsCommand(
      "plan",
      ctx,
      pi,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain('"plan"');
    expect(notify.mock.calls[0]?.[0]).toContain("unknown subcommand");
    expect(notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("dispatches `show-prompt` to runShowPrompt", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "show-prompt",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toBe("No preset is active.");
    expect(notify.mock.calls[0]?.[1]).toBe("info");
  });

  it("dispatches `reload` to runReload (empty-state path)", async () => {
    const { ctx, notify } = makeStubCtx();

    await handlePresetsCommand(
      "reload",
      ctx,
      undefined,
      new ActivePresetSession(),
      new HotkeyRegistry(),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toContain("Reloaded 0 presets");
    expect(notify.mock.calls[0]?.[1]).toBe("info");
  });
});
