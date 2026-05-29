/**
 * Terminal-protocol key-encoding fallbacks not yet handled by pi-tui.
 *
 * Owns predicates that match key sequences emitted by terminals running
 * the Kitty enhanced keyboard protocol but not yet recognized by
 * pi-tui's `matchesKey` / `isKeyRelease`. It does NOT own keybinding
 * registration, focus dispatch, or any application-level shortcut
 * vocabulary — callers decide what each key means.
 *
 * Each predicate is a temporary shim. Re-audit and delete whenever
 * pi-tui's `matchesKey` grows the corresponding Kitty support.
 */
import { Key, matchesKey } from "@earendil-works/pi-tui";

/**
 * Whether `input` is an F1 key press, including Kitty enhanced-keyboard
 * encodings that pi-tui's `matchesKey(input, Key.f1)` currently misses.
 *
 * pi-tui's matchesKey for F-keys checks only the legacy table
 * (`\x1bOP`, `\x1b[11~`, `\x1b[[A`) and never falls through to the
 * Kitty matcher, so when pi-tui auto-enables Kitty's enhanced keyboard
 * protocol (terminal.js sends `\x1b[>7u` after the handshake) F1 in
 * its Kitty-protocol forms is silently dropped. Two such forms exist:
 *
 * 1. Legacy-with-event-info (observed in Ghostty: F1 press arrived as
 *    `\x1b[1;1:1P`, release as `\x1b[1;1:3P`):
 *      `CSI 1 ; <mod> : <event> P`
 *    Final byte is the legacy SS3 letter (`P` for F1). The `:event`
 *    subfield is added when the event-types flag is pushed.
 *
 * 2. Codepoint form (per the Kitty keyboard-protocol spec):
 *      `CSI 57364 ; <mod> : <event> u`
 *    Final byte is `u`; codepoint 57364 = F1, 57365 = F2, etc.
 *
 * Empirical evidence: a temporary `appendFileSync` instrumentation in
 * the editor's `handleInput` recorded what each terminal actually sends
 * inside pi. iTerm2 sent `\x1b[11~` (already covered by the legacy
 * `Key.f1` table); Ghostty sent the legacy-with-event-info `\x1b[1;1:1P`
 * variant; kitty/WezTerm/recent Alacritty are expected to use either
 * form. The six fallbacks below cover both encodings with and without
 * the modifier and event subfields.
 *
 * We match only press events (event subfield `1`, or omitted). pi-tui's
 * isKeyRelease does not recognize `:3P` either, so F1 release leaks
 * through to the focused component; matching only press here means the
 * release falls through to whatever input chain the host has, where it
 * is harmlessly ignored.
 *
 * Re-audit when pi-tui's matchesKey and isKeyRelease grow F-key Kitty
 * support; this workaround can then go away.
 */
export function isHelpKey(input: string): boolean {
  if (matchesKey(input, Key.f1)) return true;

  return (
    input === "\x1b[1P" ||
    input === "\x1b[1;1P" ||
    input === "\x1b[1;1:1P" ||
    input === "\x1b[57364u" ||
    input === "\x1b[57364;1u" ||
    input === "\x1b[57364;1:1u"
  );
}
