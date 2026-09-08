/**
 * Covers where the presets and policy files land for each scope, using
 * synthetic agent and cwd values so the results do not depend on the
 * developer's environment.
 */
import {
  getGlobalPolicyPath,
  getGlobalPresetsPath,
  getProjectPresetsPath,
} from "../../src/store/paths.js";
import { describe, expect, it } from "vitest";

describe("getGlobalPresetsPath", () => {
  it("resolves under the provided agent dir", () => {
    expect(getGlobalPresetsPath("/tmp/fake-agent")).toBe(
      "/tmp/fake-agent/presets-plus/presets.json",
    );
  });

  it("uses pi's getAgentDir() when no override is provided", () => {
    // The agent dir varies by machine, so the assertions check only that
    // the result is absolute and keeps the expected suffix.
    const resolved = getGlobalPresetsPath();

    expect(resolved.endsWith("/presets-plus/presets.json")).toBe(true);
    expect(resolved.startsWith("/")).toBe(true);
  });
});

describe("getGlobalPolicyPath", () => {
  it("resolves under the provided agent dir", () => {
    expect(getGlobalPolicyPath("/tmp/fake-agent")).toBe(
      "/tmp/fake-agent/presets-plus/policy.json",
    );
  });
});

describe("getProjectPresetsPath", () => {
  it("resolves under <cwd>/.pi/presets-plus/", () => {
    expect(getProjectPresetsPath("/tmp/fake-project")).toBe(
      "/tmp/fake-project/.pi/presets-plus/presets.json",
    );
  });
});
