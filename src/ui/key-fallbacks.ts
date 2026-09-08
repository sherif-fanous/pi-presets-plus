/**
 * Matches key sequences that terminals send under the Kitty enhanced
 * keyboard protocol and pi-tui's `matchesKey` does not recognize.
 */
import { Key, matchesKey } from "@earendil-works/pi-tui";

/**
 * Whether `input` is an F1 press, including the Kitty encodings that
 * `matchesKey(input, Key.f1)` misses.
 *
 * pi-tui matches F-keys against the legacy table only (`\x1bOP`,
 * `\x1b[11~`, `\x1b[[A`) and enables the Kitty enhanced keyboard protocol
 * during its handshake, so a terminal that answers with a Kitty encoding
 * of F1 gets dropped. Two encodings appear: the legacy SS3 final byte
 * carrying modifier and event subfields (`CSI 1 ; <mod> : <event> P`,
 * which Ghostty sends) and the codepoint form (`CSI 57364 ; <mod> :
 * <event> u`). Only press events match, either with the event subfield
 * `1` or with the subfield omitted, so a release falls through to the
 * host input chain and is ignored there.
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
