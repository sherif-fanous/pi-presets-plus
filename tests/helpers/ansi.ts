/** Strips terminal styling so tests can assert on plain text. */

/** Removes SGR color and style sequences from rendered text. */
export function stripAnsi(text: string): string {
  const escapeCharacter = String.fromCharCode(27);

  return text.replaceAll(new RegExp(`${escapeCharacter}\\[[0-9;]*m`, "g"), "");
}
