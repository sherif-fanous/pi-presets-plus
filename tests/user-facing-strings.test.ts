/**
 * Regression checks for user-facing string vocabulary.
 *
 * Owns a small static scan for old-voice fragments; it does NOT replace
 * reviewer judgement for new prose or validate every possible sentence.
 */
import { globSync, readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = "src";
const OLD_VOICE_PATTERNS: readonly RegExp[] = [
  /["'`]preset:\s*/,
  /["'`]scope:\s+(?!name|preset)/,
  /["'`]preset status["'`]/,
  /["'`]preset cleared:/,
  /⚠ thinking will be clamped/,
  /⚠ hotkey conflict/,
  /["'`]already at baseline["'`]/,
  /["'`]managed by active preset["'`]/,
  /["'`]user manually overrode preset value["'`]/,
  /["'`]not managed by active preset["'`]/,
];
// openConfirm's title is the 2nd positional argument; openInfoDialog takes a
// `title:` option. The openConfirm branch matches a plain identifier or
// property access (no `:` — so the function declaration's typed parameters
// don't match) terminated by a comma before the title literal. The `title:`
// branch is anchored on a word boundary so it does not match property-name
// declarations like `private readonly title: string`, which lack a trailing
// string literal.
const LOWERCASE_DIALOG_TITLE_PATTERN =
  /(?:openConfirm\(\s*[\w.]+,\s*|\btitle:\s*)["'`][a-z][^"'`?\n]*["'`]/s;
const NOTIFY_CALL_PATTERN = /\.notify\((?<body>`[^`]*`|"[^"]*"|'[^']*')/gs;

describe("user-facing string conventions", () => {
  it("does not reintroduce known old-voice fragments in src", () => {
    const matches: string[] = [];

    for (const path of sourceFiles()) {
      const text = readFileSync(path, "utf8");

      for (const pattern of OLD_VOICE_PATTERNS) {
        if (pattern.test(text)) {
          matches.push(`${relative(process.cwd(), path)} matches ${pattern}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps notify literals punctuated and dialog title literals titled", () => {
    const matches: string[] = [];

    for (const path of sourceFiles()) {
      const text = readFileSync(path, "utf8");
      const shortPath = relative(process.cwd(), path);

      for (const match of text.matchAll(NOTIFY_CALL_PATTERN)) {
        const body = match.groups?.body;

        if (body && !/[.!?]["'`]$/.test(body) && !body.includes("\\n")) {
          matches.push(
            `${shortPath} has an unpunctuated notify literal ${body}`,
          );
        }
      }

      if (LOWERCASE_DIALOG_TITLE_PATTERN.test(text)) {
        matches.push(`${shortPath} has a lowercase dialog title literal`);
      }
    }

    expect(matches).toEqual([]);
  });
});

function sourceFiles(): string[] {
  return globSync(`${SOURCE_ROOT}/**/*.ts`, { exclude: ["**/*.d.ts"] });
}
