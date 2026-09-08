/**
 * Scans the source tree for user-facing strings that break the project's
 * voice: banned wording, notification literals that end without
 * punctuation, and dialog titles that start lowercase.
 */
import { globSync, readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

/** Directory whose TypeScript files the scan reads. */
const SOURCE_ROOT = "src";
/** Wording that must not appear in a user-facing string. */
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
/**
 * Matches a dialog title literal that starts lowercase, whether it is the
 * second positional argument of `openConfirm` or the `title:` option of
 * `openInfoDialog`. The `openConfirm` branch demands a plain identifier or
 * property access before the comma so typed parameters in a function
 * declaration stay out, and the `title:` branch demands a following string
 * literal so declarations like `private readonly title: string` stay out.
 */
const LOWERCASE_DIALOG_TITLE_PATTERN =
  /(?:openConfirm\(\s*[\w.]+,\s*|\btitle:\s*)["'`][a-z][^"'`?\n]*["'`]/s;
/** Captures the first string literal passed to a `.notify(` call. */
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
