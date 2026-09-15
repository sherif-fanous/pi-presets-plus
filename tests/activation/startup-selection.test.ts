/**
 * Covers file-backed startup defaults, trust-aware merging, thinking
 * normalization, and silent ineligible comparison outcomes.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureStartupSelection,
  isAutomaticDefaultEligible,
  readFileBackedDefaults,
  startupSelectionMatchesDefaults,
  type FileBackedDefaults,
  type StartupSelection,
} from "../../src/activation/startup-selection.js";
import type { ThinkingLevel } from "../../src/types.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let agentDir: string;
let cwd: string;

function comparisonContext(
  resolvedModel: Model<Api> | undefined,
  projectTrusted = true,
  mode: ExtensionContext["mode"] = "tui",
): Pick<
  ExtensionContext,
  "cwd" | "isProjectTrusted" | "mode" | "modelRegistry"
> {
  return {
    cwd,
    isProjectTrusted: () => projectTrusted,
    mode,
    modelRegistry: {
      find: vi.fn(() => resolvedModel),
    },
  } as unknown as Pick<
    ExtensionContext,
    "cwd" | "isProjectTrusted" | "mode" | "modelRegistry"
  >;
}

function defaults(
  thinkingLevel: ThinkingLevel | undefined = "medium",
): FileBackedDefaults {
  return {
    model: "gpt",
    provider: "openai",
    thinkingLevel,
  };
}

function model(
  provider: string,
  id: string,
  reasoning: boolean,
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"],
): Model<Api> {
  return { id, provider, reasoning, thinkingLevelMap } as Model<Api>;
}

function startup(overrides: Partial<StartupSelection> = {}): StartupSelection {
  return {
    model: { id: "gpt", provider: "openai" },
    thinkingLevel: "medium",
    ...overrides,
  };
}

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "pi-presets-startup-defaults-"));
  cwd = join(agentDir, "project");
  await mkdir(join(cwd, ".pi"), { recursive: true });
});

afterEach(async () => {
  await rm(agentDir, { force: true, recursive: true });
});

describe("readFileBackedDefaults", () => {
  it("merges trusted project values over global settings", async () => {
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        defaultModel: "global-model",
        defaultProvider: "openai",
        defaultThinkingLevel: "low",
      }),
    );

    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({
        defaultModel: "project-model",
        defaultThinkingLevel: "high",
      }),
    );

    expect(readFileBackedDefaults(cwd, true, agentDir)).toEqual({
      model: "project-model",
      provider: "openai",
      thinkingLevel: "high",
    });

    expect(readFileBackedDefaults(cwd, false, agentDir)).toEqual({
      model: "global-model",
      provider: "openai",
      thinkingLevel: "low",
    });
  });

  it("reads settings again after an edit", async () => {
    const path = join(agentDir, "settings.json");

    await writeFile(
      path,
      JSON.stringify({ defaultModel: "first", defaultProvider: "openai" }),
    );

    expect(readFileBackedDefaults(cwd, true, agentDir)?.model).toBe("first");

    await writeFile(
      path,
      JSON.stringify({ defaultModel: "second", defaultProvider: "openai" }),
    );

    expect(readFileBackedDefaults(cwd, true, agentDir)?.model).toBe("second");
  });

  it("returns no defaults for reported errors or factory failures", () => {
    const reportedError = vi.fn(() => ({
      drainErrors: () => [{}],
      getDefaultModel: () => "gpt",
      getDefaultProvider: () => "openai",
      getDefaultThinkingLevel: () => "medium" as const,
    }));
    const thrownError = vi.fn(() => {
      throw new Error("read failed");
    });

    expect(readFileBackedDefaults(cwd, true, agentDir, reportedError)).toBe(
      undefined,
    );

    expect(readFileBackedDefaults(cwd, true, agentDir, thrownError)).toBe(
      undefined,
    );
  });
});

describe("captureStartupSelection", () => {
  it("captures a model identity and current thinking", () => {
    expect(
      captureStartupSelection(
        { model: model("openai", "gpt", true) },
        { getThinkingLevel: () => "high" },
      ),
    ).toEqual({
      model: { id: "gpt", provider: "openai" },
      thinkingLevel: "high",
    });
  });
});

describe("startupSelectionMatchesDefaults", () => {
  it.each([
    ["provider", startup({ model: { id: "gpt", provider: "anthropic" } })],
    ["model", startup({ model: { id: "other", provider: "openai" } })],
    ["thinking", startup({ thinkingLevel: "high" })],
    ["absent startup model", startup({ model: undefined })],
  ])("rejects a differing or invalid %s", (_label, captured) => {
    const read = vi.fn(() => defaults());

    expect(
      startupSelectionMatchesDefaults(
        captured,
        comparisonContext(model("openai", "gpt", true)),
        read,
      ),
    ).toBe(false);
  });

  it.each<[string, FileBackedDefaults | undefined]>([
    ["missing provider", { ...defaults(), provider: undefined }],
    ["missing model", { ...defaults(), model: undefined }],
    ["invalid thinking", { ...defaults(), thinkingLevel: "invalid" }],
    ["settings error", undefined],
  ])("rejects %s silently", (_label, loaded) => {
    expect(
      startupSelectionMatchesDefaults(
        startup(),
        comparisonContext(model("openai", "gpt", true)),
        () => loaded,
      ),
    ).toBe(false);
  });

  it("rejects an unresolved configured model", () => {
    expect(
      startupSelectionMatchesDefaults(
        startup(),
        comparisonContext(undefined),
        () => defaults(),
      ),
    ).toBe(false);
  });

  it("passes cwd and project trust to the settings reader", () => {
    const readDefaults = vi.fn(() => defaults());

    startupSelectionMatchesDefaults(
      startup(),
      comparisonContext(model("openai", "gpt", true), false),
      readDefaults,
    );

    expect(readDefaults).toHaveBeenCalledExactlyOnceWith(cwd, false);
  });

  it("rejects invalid thinking before clamping can create a false match", () => {
    expect(
      startupSelectionMatchesDefaults(
        startup({ thinkingLevel: "off" }),
        comparisonContext(model("openai", "gpt", false)),
        () => ({ ...defaults(), thinkingLevel: "invalid" }),
      ),
    ).toBe(false);
  });

  it.each([
    [
      "supported level",
      model("openai", "gpt", true),
      defaults("high"),
      startup({ thinkingLevel: "high" }),
    ],
    [
      "restricted level",
      model("openai", "gpt", true, { low: null, medium: null }),
      defaults("medium"),
      startup({ thinkingLevel: "high" }),
    ],
    [
      "non-reasoning model",
      model("openai", "gpt", false),
      defaults("high"),
      startup({ thinkingLevel: "off" }),
    ],
    [
      "absent thinking fallback",
      model("openai", "gpt", true),
      defaults(undefined),
      startup({ thinkingLevel: "medium" }),
    ],
  ])(
    "accepts Pi-normalized thinking for a %s",
    (_label, resolved, loaded, captured) => {
      expect(
        startupSelectionMatchesDefaults(
          captured,
          comparisonContext(resolved),
          () => loaded,
        ),
      ).toBe(true);
    },
  );
});

describe("isAutomaticDefaultEligible", () => {
  it.each(["print", "rpc", "json"] as const)(
    "rejects %s mode without reading settings",
    (mode) => {
      const readDefaults = vi.fn(() => defaults());

      expect(
        isAutomaticDefaultEligible(
          startup(),
          comparisonContext(model("openai", "gpt", true), true, mode),
          readDefaults,
        ),
      ).toBe(false);
      expect(readDefaults).not.toHaveBeenCalled();
    },
  );
});
