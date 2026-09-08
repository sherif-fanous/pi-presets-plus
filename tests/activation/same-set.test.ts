/**
 * Covers unordered string-set equality, including how it treats ordering
 * and repeated values.
 */
import { sameSet } from "../../src/activation/same-set.js";
import { describe, expect, it } from "vitest";

describe("sameSet", () => {
  it.each([
    ["matches equal lists", ["read"], ["read"], true],
    ["ignores order", ["read", "bash"], ["bash", "read"], true],
    ["detects different values", ["read"], ["bash"], false],
    ["matches empty lists", [], [], true],
    ["ignores duplicate multiplicity", ["read"], ["read", "read"], true],
    [
      "detects a different value hidden by duplicates",
      ["read", "read"],
      ["read", "bash"],
      false,
    ],
  ] as const)("%s", (_name, left, right, expected) => {
    expect(sameSet(left, right)).toBe(expected);
  });
});
