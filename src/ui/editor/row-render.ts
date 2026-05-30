/**
 * Shared low-level render primitives for editor rows.
 *
 * Owns the label/value row, choice row, text-input row, and field
 * diagnostic helpers consumed by individual row modules. It does NOT
 * own row dispatch, focus logic, or per-row state.
 *
 * Each helper here is a pure function of its arguments; rows pass the
 * host through when they need access to the editor's current
 * diagnostic for their row.
 */
import type { EditorRowId } from "../editor-types.js";
import type { EditorRowHost } from "./row.js";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Input } from "@earendil-works/pi-tui";

const EDITOR_LABEL_WIDTH = 15;

export const EMPTY_INPUT_PLACEHOLDER = "—";

/** Render a row whose value is a one-of choice (e.g. user / project). */
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
 * Render a single-line text-input row: the live `Input` widget when
 * focused, the trimmed value (or a dim placeholder for empty) when not.
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

/** Render the focus marker + padded label + value as a single line. */
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
 * Append `row`'s diagnostic message line beneath `line` when one is
 * set; otherwise return just `[line]`. Diagnostics live on the host so
 * the editor can clear them in response to non-row events (e.g. a save
 * attempt) without each row re-rendering the latest state.
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
 * Wrap a current index by `direction` (+1 / -1) modulo `length`.
 *
 * Used by every row whose value is a horizontal selector (scope,
 * provider, model, thinking, buttons) so navigation behaves
 * consistently across rows.
 */
export function wrapIndex(
  currentIndex: number,
  length: number,
  direction: -1 | 1,
): number {
  if (length <= 0) return 0;

  return (((currentIndex + direction) % length) + length) % length;
}

function renderFieldDiagnostic(
  host: EditorRowHost,
  row: EditorRowId,
): string | undefined {
  const diagnostic = host.getFieldDiagnostic(row);

  if (!diagnostic) return undefined;

  const color = diagnostic.severity === "warning" ? "warning" : "error";

  return host.theme.fg(color, `    ${diagnostic.message}`);
}
