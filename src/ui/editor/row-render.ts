/**
 * Render primitives the editor rows share: the label and value line, the
 * choice line, the text-input line, and the diagnostic line beneath a row.
 */
import type { EditorRowId } from "../editor-types.js";
import type { EditorRowHost } from "./row.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Input } from "@earendil-works/pi-tui";

/** Column the value text starts at, in characters. */
const EDITOR_LABEL_WIDTH = 15;

/** Stand-in text shown for an empty value. */
export const EMPTY_INPUT_PLACEHOLDER = "(empty)";

/** Render a row whose value is one option out of a small set. */
export function renderChoiceRow(
  theme: Pick<Theme, "fg">,
  label: string,
  options: readonly string[],
  selected: string,
  focused: boolean,
): string {
  const rendered = options
    .map((option) => (option === selected ? `● ${option}` : `○ ${option}`))
    .join("  ");

  return renderValueRow(theme, label, rendered, focused);
}

/**
 * Render a single-line text-input row: the live `Input` widget while the
 * row has focus, otherwise the value or a dim placeholder when it is empty.
 */
export function renderTextInputRow(
  host: EditorRowHost,
  label: string,
  row: Extract<EditorRowId, "hotkey" | "name">,
  input: Input,
  text: string,
  width: number,
): string[] {
  const focused = host.currentRow() === row;

  if (focused) {
    return withFieldDiagnostic(
      host,
      row,
      renderValueRow(
        host.theme,
        label,
        input.render(Math.max(1, width - 16))[0] ?? "",
        true,
      ),
    );
  }

  const value =
    text.length > 0 ? text : host.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER);

  return withFieldDiagnostic(
    host,
    row,
    renderValueRow(host.theme, label, value, false),
  );
}

/** Render the focus marker, padded label, and value as one line. */
export function renderValueRow(
  theme: Pick<Theme, "fg">,
  label: string,
  value: string,
  focused: boolean,
): string {
  const marker = focused ? theme.fg("accent", "▌") : " ";
  const paddedLabel = `${label}${" ".repeat(Math.max(0, EDITOR_LABEL_WIDTH - label.length))}`;
  const labelText = theme.fg("muted", paddedLabel);
  const renderedValue = focused ? theme.fg("accent", value) : value;

  return `${marker} ${labelText}${renderedValue}`;
}

/**
 * Append the row's diagnostic message beneath `line` when the host holds
 * one for it.
 */
export function withFieldDiagnostic(
  host: EditorRowHost,
  row: EditorRowId,
  line: string,
): string[] {
  const diagnostic = renderFieldDiagnostic(host, row);

  return diagnostic ? [line, diagnostic] : [line];
}

/**
 * Step an index one place in `direction`, wrapping around the ends of a
 * list of `length` items.
 */
export function wrapIndex(
  currentIndex: number,
  length: number,
  direction: -1 | 1,
): number {
  if (length <= 0) return 0;

  return (((currentIndex + direction) % length) + length) % length;
}

/** Render the host's diagnostic for `row` as a colored, indented line. */
function renderFieldDiagnostic(
  host: EditorRowHost,
  row: EditorRowId,
): string | undefined {
  const diagnostic = host.getFieldDiagnostic(row);

  if (!diagnostic) return undefined;

  const color = diagnostic.severity === "warning" ? "warning" : "error";

  return host.theme.fg(color, `    ${diagnostic.message}`);
}
