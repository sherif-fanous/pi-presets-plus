/**
 * Covers session-start configuration loading, warning delivery, and picking
 * up an externally edited configuration on extension reload.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getGlobalPresetsPath,
  getProjectPresetsPath,
} from "../src/store/paths.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadAllMock, maybeApplyPolicyDefaultMock } = vi.hoisted(() => ({
  loadAllMock: vi.fn(),
  maybeApplyPolicyDefaultMock: vi.fn(),
}));

vi.mock("../src/store/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/store/api.js")>()),
  loadAll: loadAllMock,
}));

vi.mock("../src/activation/policy-default.js", () => ({
  maybeApplyPolicyDefault: maybeApplyPolicyDefaultMock,
}));

const { default: presetsPlus } = await import("../src/index.js");
const { loadAll: realLoadAll } = await vi.importActual<
  typeof import("../src/store/api.js")
>("../src/store/api.js");
const { maybeApplyPolicyDefault: realMaybeApplyPolicyDefault } =
  await vi.importActual<typeof import("../src/activation/policy-default.js")>(
    "../src/activation/policy-default.js",
  );

type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;

let agentDir: string;
let previousAgentDir: string | undefined;

function makeContext(
  status: Record<string, string | undefined>,
  mode: ExtensionContext["mode"] = "tui",
  branch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]> = [],
) {
  const notify = vi.fn();
  const ctx = {
    cwd: join(agentDir, "project"),
    isProjectTrusted: () => true,
    mode,
    model: { id: "gpt-5", provider: "openai" },
    modelRegistry: { find: vi.fn() },
    sessionManager: { getBranch: () => branch },
    ui: {
      notify,
      setStatus: (key: string, value: string | undefined) => {
        status[key] = value;
      },
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;

  return { ctx, notify };
}

function makePi(): {
  handlers: Map<string, Handler>;
  pi: ExtensionAPI;
  spies: {
    appendEntry: ReturnType<typeof vi.fn>;
    getThinkingLevel: ReturnType<typeof vi.fn>;
    registerShortcut: ReturnType<typeof vi.fn>;
    setActiveTools: ReturnType<typeof vi.fn>;
    setModel: ReturnType<typeof vi.fn>;
    setThinkingLevel: ReturnType<typeof vi.fn>;
  };
} {
  const handlers = new Map<string, Handler>();
  const spies = {
    appendEntry: vi.fn(),
    getThinkingLevel: vi.fn(() => "medium"),
    registerShortcut: vi.fn(),
    setActiveTools: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
  };
  const pi = {
    appendEntry: spies.appendEntry,
    getActiveTools: vi.fn(() => ["read", "bash"]),
    getAllTools: vi.fn(() => []),
    getFlag: vi.fn(() => undefined),
    getThinkingLevel: spies.getThinkingLevel,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    registerFlag: vi.fn(),
    registerShortcut: spies.registerShortcut,
    setActiveTools: spies.setActiveTools,
    setModel: spies.setModel,
    setThinkingLevel: spies.setThinkingLevel,
  } as unknown as ExtensionAPI;

  return { handlers, pi, spies };
}

async function writeConfig(contents: string): Promise<void> {
  const directory = join(agentDir, "presets-plus");

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), contents, "utf-8");
}

async function writeLegacyPresets(contents: string): Promise<void> {
  await mkdir(join(agentDir, "presets-plus"), { recursive: true });
  await writeFile(getGlobalPresetsPath(agentDir), contents, "utf-8");
}

async function writeProjectLegacyPresets(
  contents: string,
  cwd: string,
): Promise<void> {
  await mkdir(join(cwd, ".pi", "presets-plus"), { recursive: true });
  await writeFile(getProjectPresetsPath(cwd), contents, "utf-8");
}

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-index-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  loadAllMock.mockReset();
  maybeApplyPolicyDefaultMock.mockReset();
  maybeApplyPolicyDefaultMock.mockImplementation(realMaybeApplyPolicyDefault);
  loadAllMock.mockResolvedValue({
    hotkeyAnalysis: { conflicts: [], invalid: [], parsed: new Map() },
    presets: [],
    showInactiveStatus: true,
    warnings: [],
  });
});

afterEach(async () => {
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }

  await rm(agentDir, { force: true, recursive: true });
});

describe("session_start configuration", () => {
  it("applies the inactive preference and re-reads it after reload", async () => {
    loadAllMock.mockImplementation(realLoadAll);
    await writeConfig(
      JSON.stringify({ version: 2, showInactiveStatus: false }),
    );

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(status["presets-plus"]).toBeUndefined();

    await writeConfig(JSON.stringify({ version: 2, showInactiveStatus: true }));
    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(status["presets-plus"]).toBe("Preset: none");
  });

  it("reports one successful migration notification", async () => {
    await writeLegacyPresets(JSON.stringify({ version: 1, presets: [] }));

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Migrated user configuration"),
      "info",
    );
  });

  it("warns when a scope migration fails", async () => {
    await writeLegacyPresets("{");

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("README"),
      "warning",
    );
  });

  it("aggregates successful and failed scope migrations", async () => {
    const cwd = join(agentDir, "project");

    await writeLegacyPresets(JSON.stringify({ version: 1, presets: [] }));
    await writeProjectLegacyPresets("{", cwd);

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("user configuration migrated successfully."),
      "warning",
    );
    expect(notify.mock.calls[0]?.[0]).toContain("README");
  });

  it.each(["startup", "reload", "new", "resume", "fork"] as const)(
    "captures startup values before %s preset processing",
    async (reason) => {
      const { handlers, pi, spies } = makePi();
      const status: Record<string, string | undefined> = {};
      const { ctx } = makeContext(status);

      loadAllMock.mockImplementation((handlerCtx: ExtensionContext) => {
        Object.assign(handlerCtx, {
          model: { id: "claude-opus", provider: "anthropic" },
        });
        spies.getThinkingLevel.mockReturnValue("high");

        return {
          hotkeyAnalysis: { conflicts: [], invalid: [], parsed: new Map() },
          presets: [],
          showInactiveStatus: true,
          warnings: [],
        };
      });
      maybeApplyPolicyDefaultMock.mockResolvedValue(false);

      presetsPlus(pi);
      await handlers.get("session_start")?.(
        { reason, type: "session_start" },
        ctx,
      );

      expect(maybeApplyPolicyDefaultMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {
          model: { id: "gpt-5", provider: "openai" },
          thinkingLevel: "medium",
        },
      );
    },
  );

  it("passes a restored attachment as higher precedence without changing Pi state", async () => {
    const restored: import("../src/types.js").LoadedPreset = {
      model: "claude-opus",
      name: "restored",
      provider: "anthropic",
      scope: "user",
    };

    loadAllMock.mockResolvedValue({
      hotkeyAnalysis: { conflicts: [], invalid: [], parsed: new Map() },
      presets: [restored],
      showInactiveStatus: true,
      warnings: [],
    });

    const branch = [
      {
        customType: "presets-plus:active",
        data: { name: "restored", scope: "user" },
        type: "custom" as const,
      },
    ] as ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
    const { handlers, pi, spies } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx } = makeContext(status, "tui", branch);

    maybeApplyPolicyDefaultMock.mockResolvedValue(false);
    presetsPlus(pi);
    await handlers.get("session_start")?.(
      { reason: "resume", type: "session_start" },
      ctx,
    );

    expect(maybeApplyPolicyDefaultMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ restored: true }),
      expect.anything(),
    );
    expect(spies.setModel).not.toHaveBeenCalled();
    expect(spies.setThinkingLevel).not.toHaveBeenCalled();
    expect(spies.setActiveTools).not.toHaveBeenCalled();
  });

  it("keeps an SDK-shaped print session unchanged through the next turn", async () => {
    const conflicting: import("../src/types.js").LoadedPreset = {
      hotkey: "ctrl+2",
      instructions: "Use the directory default.",
      model: "claude-opus",
      name: "directory-default",
      provider: "anthropic",
      scope: "user",
      thinkingLevel: "high",
      tools: ["write"],
    };

    await writeConfig(
      JSON.stringify({
        policy: {
          rules: [
            {
              default: { pattern: "^directory-default$" },
              match: ".*",
            },
          ],
        },
        version: 2,
      }),
    );

    loadAllMock.mockResolvedValue({
      hotkeyAnalysis: {
        conflicts: [],
        invalid: [],
        parsed: new Map([
          [
            conflicting,
            { key: "2", modifiers: ["ctrl"], normalized: "ctrl+2" },
          ],
        ]),
      },
      presets: [conflicting],
      showInactiveStatus: true,
      warnings: [],
    });

    const { handlers, pi, spies } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status, "print");

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    const beforeTurn = await handlers.get("before_agent_start")?.(
      { systemPrompt: "Baseline prompt." },
      ctx,
    );

    expect(spies.setModel).not.toHaveBeenCalled();
    expect(spies.setThinkingLevel).not.toHaveBeenCalled();
    expect(spies.setActiveTools).not.toHaveBeenCalled();
    expect(spies.appendEntry).not.toHaveBeenCalled();
    expect(spies.registerShortcut).toHaveBeenCalled();
    expect(status["presets-plus"]).toBe("Preset: none");
    expect(beforeTurn).toBeUndefined();
    expect(notify).not.toHaveBeenCalledWith(
      expect.stringContaining("directory-default"),
      expect.anything(),
    );
  });

  it("warns about malformed configuration without skipping preset loading", async () => {
    await writeConfig("{");

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx, notify } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(loadAllMock).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
      "warning",
    );
  });
});
