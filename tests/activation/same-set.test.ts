/**
 * Tests for unordered string-set equality.
 *
 * Covers order and duplicate semantics; it does NOT test activation flows
 * that consume the comparison helper.
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
