/**
 * Tests for `src/store/paths.ts`.
 *
 * The path helpers are pure: they take string inputs and return absolute
 * file paths. We exercise them with synthetic agent / cwd values rather
 * than the real environment so the tests are hermetic.
 */

import {
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
    // We don't pin the exact path (it depends on the real env), but the
    // returned path must end with the canonical file location and be
    // absolute. This guards against accidentally returning a relative
    // path or losing the `presets-plus/presets.json` suffix.
    const resolved = getGlobalPresetsPath();
    expect(resolved.endsWith("/presets-plus/presets.json")).toBe(true);
    expect(resolved.startsWith("/")).toBe(true);
  });
});

describe("getProjectPresetsPath", () => {
  it("resolves under <cwd>/.pi/presets-plus/", () => {
    expect(getProjectPresetsPath("/tmp/fake-project")).toBe(
      "/tmp/fake-project/.pi/presets-plus/presets.json",
    );
  });
});
