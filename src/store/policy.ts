/**
 * User-global preset access-policy loading and evaluation.
 *
 * Owns policy validation, regex compilation, cwd matching, permission checks,
 * and default resolution; it does NOT own activation, UI, or persistence.
 */
import { readFile } from "node:fs/promises";

import type { LoadedPreset } from "../types.js";
import { getGlobalPolicyPath } from "./paths.js";

export interface CompiledPolicyMatcher {
  readonly field: PolicyMatcherField;
  readonly pattern: string;
  readonly regex: RegExp;
}

export interface CompiledPolicyRule {
  readonly allow: readonly CompiledPolicyMatcher[];
  readonly default?: CompiledPolicyMatcher;
  readonly index: number;
  readonly match: string;
  readonly matchRegex: RegExp;
  readonly prohibit: readonly CompiledPolicyMatcher[];
}

export interface MatchedPolicyRule {
  readonly matchLength: number;
  readonly rule: CompiledPolicyRule;
}

export interface PolicyLoadResult {
  readonly rules: readonly CompiledPolicyRule[];
  readonly warnings: string[];
}

export type PolicyDefaultResult =
  | {
      readonly kind: "none";
      readonly matchedRules: readonly MatchedPolicyRule[];
    }
  | {
      readonly kind: "resolved";
      readonly matchedRules: readonly MatchedPolicyRule[];
      readonly preset: LoadedPreset;
      readonly reason: "file-order tie" | "longest match";
      readonly winner: MatchedPolicyRule;
    }
  | {
      readonly kind: "unresolvable";
      readonly matchedRules: readonly MatchedPolicyRule[];
      readonly reason: "file-order tie" | "longest match";
      readonly winner: MatchedPolicyRule;
    };

export type PolicyMatcherField = "model" | "name" | "provider";

/** Apply the unioned allow/prohibit policy to one preset. */
export function isPermitted(
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
  matchedRules: readonly MatchedPolicyRule[],
): boolean {
  const allow = matchedRules.flatMap(({ rule }) => rule.allow);
  const prohibit = matchedRules.flatMap(({ rule }) => rule.prohibit);

  return (
    (allow.length === 0 ||
      allow.some((matcher) => matchesPreset(preset, matcher))) &&
    !prohibit.some((matcher) => matchesPreset(preset, matcher))
  );
}

/** Read and compile the global policy fresh on every call. */
export async function loadPolicy(agentDir?: string): Promise<PolicyLoadResult> {
  const path = getGlobalPolicyPath(agentDir);
  let rawData: string;

  try {
    rawData = await readFile(path, "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) return { rules: [], warnings: [] };

    return emptyWithWarning(
      `The extension could not read policy file ${path}: ${describeError(error)}.`,
    );
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawData);
  } catch (error) {
    return emptyWithWarning(
      `The policy file ${path} contains invalid JSON: ${describeError(error)}.`,
    );
  }

  if (!isRecord(parsedData)) {
    return emptyWithWarning(
      `The policy file ${path} top-level must be an object with a "version" and "rules" field.`,
    );
  }

  if (parsedData.version !== 1) {
    return emptyWithWarning(
      `The policy file ${path} uses unsupported version ${JSON.stringify(parsedData.version)}; expected 1. The extension ignored the file and left it unchanged.`,
    );
  }

  if (!Array.isArray(parsedData.rules)) {
    return emptyWithWarning(
      `The policy file ${path} is missing a top-level "rules" array.`,
    );
  }

  const rawRules: readonly unknown[] = parsedData.rules;
  const warnings: string[] = [];
  const rules: CompiledPolicyRule[] = [];

  for (let index = 0; index < rawRules.length; index++) {
    const candidate = rawRules[index];

    if (!isRecord(candidate) || typeof candidate.match !== "string") {
      warnings.push(
        `The extension skipped policy rule ${index + 1} in ${path}: "match" must be a string.`,
      );

      continue;
    }

    const matchRegex = compileRegex(candidate.match);

    if (!matchRegex) {
      warnings.push(
        `The extension skipped policy rule ${index + 1} in ${path}: match pattern ${JSON.stringify(candidate.match)} is invalid.`,
      );

      continue;
    }

    const allow = compileMatcherList(
      candidate.allow,
      "allow",
      index,
      path,
      warnings,
    );
    const prohibit = compileMatcherList(
      candidate.prohibit,
      "prohibit",
      index,
      path,
      warnings,
    );
    const defaultMatcher = compileOptionalMatcher(
      candidate.default,
      "default",
      index,
      path,
      warnings,
    );

    rules.push({
      allow,
      ...(defaultMatcher ? { default: defaultMatcher } : {}),
      index,
      match: candidate.match,
      matchRegex,
      prohibit,
    });
  }

  return { rules, warnings };
}

/** Return whether a compiled matcher accepts a preset. */
export function matchesPreset(
  preset: Pick<LoadedPreset, "model" | "name" | "provider">,
  matcher: CompiledPolicyMatcher,
): boolean {
  const value =
    matcher.field === "model"
      ? `${preset.provider}/${preset.model}`
      : preset[matcher.field];

  return matcher.regex.test(value);
}

/** Return cwd-matching rules and the substring length consumed by each regex. */
export function resolveMatchingRules(
  cwd: string,
  rules: readonly CompiledPolicyRule[],
): MatchedPolicyRule[] {
  const matched: MatchedPolicyRule[] = [];

  for (const rule of rules) {
    const result = rule.matchRegex.exec(cwd);

    if (result) matched.push({ matchLength: result[0].length, rule });
  }

  return matched;
}

/** Resolve the applicable permitted default from an already-ordered preset list. */
export function resolvePolicyDefault(
  cwd: string,
  presets: readonly LoadedPreset[],
  rules: readonly CompiledPolicyRule[],
): PolicyDefaultResult {
  const matchedRules = resolveMatchingRules(cwd, rules);
  const candidates = matchedRules.filter(({ rule }) => rule.default);

  if (candidates.length === 0) return { kind: "none", matchedRules };

  const winner = candidates.reduce((best, candidate) =>
    candidate.matchLength > best.matchLength ? candidate : best,
  );
  const reason = candidates.some(
    (candidate) =>
      candidate !== winner && candidate.matchLength === winner.matchLength,
  )
    ? "file-order tie"
    : "longest match";
  const defaultMatcher = winner.rule.default;

  if (!defaultMatcher) return { kind: "none", matchedRules };

  const preset = presets.find(
    (candidate) =>
      !candidate.shadowed &&
      !candidate.unavailable &&
      isPermitted(candidate, matchedRules) &&
      matchesPreset(candidate, defaultMatcher),
  );

  return preset
    ? { kind: "resolved", matchedRules, preset, reason, winner }
    : { kind: "unresolvable", matchedRules, reason, winner };
}

function compileMatcher(
  candidate: unknown,
  section: string,
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher | undefined {
  if (!isRecord(candidate) || typeof candidate.pattern !== "string") {
    warnings.push(
      `The extension skipped the ${section} matcher in policy rule ${ruleIndex + 1} of ${path}: "pattern" must be a string.`,
    );

    return undefined;
  }

  const field = candidate.field ?? "name";

  if (field !== "name" && field !== "provider" && field !== "model") {
    warnings.push(
      `The extension skipped ${section} pattern ${JSON.stringify(candidate.pattern)} in policy rule ${ruleIndex + 1} of ${path}: field ${JSON.stringify(field)} is not supported.`,
    );

    return undefined;
  }

  const regex = compileRegex(candidate.pattern);

  if (!regex) {
    warnings.push(
      `The extension skipped the ${section} matcher in policy rule ${ruleIndex + 1} of ${path}: pattern ${JSON.stringify(candidate.pattern)} is invalid.`,
    );

    return undefined;
  }

  return { field, pattern: candidate.pattern, regex };
}

function compileMatcherList(
  candidate: unknown,
  section: "allow" | "prohibit",
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher[] {
  if (candidate === undefined) return [];

  if (!Array.isArray(candidate)) {
    warnings.push(
      `The extension ignored "${section}" in policy rule ${ruleIndex + 1} of ${path}: the value must be an array.`,
    );

    return [];
  }

  return candidate.flatMap((matcher) => {
    const compiled = compileMatcher(
      matcher,
      section,
      ruleIndex,
      path,
      warnings,
    );

    return compiled ? [compiled] : [];
  });
}

function compileOptionalMatcher(
  candidate: unknown,
  section: "default",
  ruleIndex: number,
  path: string,
  warnings: string[],
): CompiledPolicyMatcher | undefined {
  if (candidate === undefined) return undefined;

  return compileMatcher(candidate, section, ruleIndex, path, warnings);
}

function compileRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyWithWarning(warning: string): PolicyLoadResult {
  return { rules: [], warnings: [warning] };
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
