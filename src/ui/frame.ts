/**
 * Width-safe border, padding, and centering primitives shared by the
 * custom TUI dialogs.
 */
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/** Content of a bordered dialog: title, body lines, footer, and width. */
export interface DialogFrameOptions {
  readonly bodyLines: readonly string[];
  readonly footer: string;
  readonly title: string;
  readonly width: number;
}

/** Center `text` within `width` visible columns, truncating if it overflows. */
export function centerText(text: string, width: number): string {
  const textWidth = visibleWidth(text);

  if (textWidth >= width) return truncateToWidth(text, width, "…");

  const leftPadding = Math.floor((width - textWidth) / 2);
  const rightPadding = width - textWidth - leftPadding;

  return `${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}`;
}

/**
 * Wrap content in a left and right border, padding or truncating it to the
 * requested width. Width counts visible columns, so ANSI escape sequences
 * do not push the right border out of alignment.
 */
export function frameLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth("││", width, "");

  return `│${padToWidth(content, width - 2)}│`;
}

/**
 * Render a `left + fill + right` border segment, for example `┌────┐`.
 * A width too narrow for any fill falls back to a truncated `leftright`
 * pair.
 */
export function frameSegment(
  left: string,
  fill: string,
  right: string,
  width: number,
): string {
  if (width <= 2) return truncateToWidth(`${left}${right}`, width, "");

  return `${left}${fill.repeat(width - 2)}${right}`;
}

/** Truncate `text` to `width` visible columns, then pad it back out. */
export function padToWidth(
  text: string,
  width: number,
  fill = " ",
  ellipsis = "…",
): string {
  const truncated = truncateToWidth(text, width, ellipsis);
  const paddingWidth = Math.max(0, width - visibleWidth(truncated));

  return `${truncated}${fill.repeat(paddingWidth)}`;
}

/** Render a bordered dialog with a centered title, body, and footer. */
export function renderDialogFrame(options: DialogFrameOptions): string[] {
  const frameWidth = Math.max(2, options.width);
  const bodyWidth = Math.max(1, frameWidth - 2);
  const lines = [
    frameSegment("┌", "─", "┐", frameWidth),
    frameLine(centerText(options.title, bodyWidth), frameWidth),
    frameLine("", frameWidth),
    ...options.bodyLines.map((line) => frameLine(line, frameWidth)),
    frameLine(options.footer, frameWidth),
    frameSegment("└", "─", "┘", frameWidth),
  ];

  return lines.map((line) => truncateToWidth(line, frameWidth, ""));
}

/** Wrap dialog body text to `width` columns, preserving ANSI sequences. */
export function wrapBody(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
