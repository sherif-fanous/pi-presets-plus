/**
 * Covers session-start configuration loading, warning delivery, and picking
 * up an externally edited configuration on extension reload.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAllMock = vi.hoisted(() => vi.fn());

vi.mock("../src/store/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/store/api.js")>()),
  loadAll: loadAllMock,
}));

const { default: presetsPlus } = await import("../src/index.js");

type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;

let agentDir: string;
let previousAgentDir: string | undefined;

function makeContext(status: Record<string, string | undefined>) {
  const notify = vi.fn();
  const ctx = {
    cwd: join(agentDir, "project"),
    sessionManager: { getBranch: () => [] },
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
} {
  const handlers = new Map<string, Handler>();
  const pi = {
    appendEntry: vi.fn(),
    getFlag: vi.fn(() => undefined),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    registerFlag: vi.fn(),
    registerShortcut: vi.fn(),
  } as unknown as ExtensionAPI;

  return { handlers, pi };
}

async function writeConfig(contents: string): Promise<void> {
  const directory = join(agentDir, "presets-plus");

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), contents, "utf-8");
}

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-index-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  loadAllMock.mockReset();
  loadAllMock.mockResolvedValue({
    hotkeyAnalysis: { conflicts: [], invalid: [], parsed: new Map() },
    presets: [],
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
    await writeConfig(
      JSON.stringify({ version: 1, showInactiveStatus: false }),
    );

    const { handlers, pi } = makePi();
    const status: Record<string, string | undefined> = {};
    const { ctx } = makeContext(status);

    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(status["presets-plus"]).toBeUndefined();

    await writeConfig(JSON.stringify({ version: 1, showInactiveStatus: true }));
    presetsPlus(pi);
    await handlers.get("session_start")?.({ type: "session_start" }, ctx);

    expect(status["presets-plus"]).toBe("Preset: none");
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
