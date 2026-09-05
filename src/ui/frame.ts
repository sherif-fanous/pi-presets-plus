/**
 * Small terminal-frame layout helpers shared by custom TUI surfaces.
 *
 * Owns width-safe border, padding, and centering primitives reused by
 * preset dialogs; it does NOT own picker state, activation, or any
 * specific dialog content.
 */
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

export interface DialogFrameOptions {
  readonly bodyLines: readonly string[];
  readonly footer: string;
  readonly title: string;
  readonly width: number;
}

export function centerText(text: string, width: number): string {
  const textWidth = visibleWidth(text);

  if (textWidth >= width) return truncateToWidth(text, width, "…");

  const leftPadding = Math.floor((width - textWidth) / 2);
  const rightPadding = width - textWidth - leftPadding;

  return `${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}`;
}

/**
 * Wrap content in a left/right border and pad/truncate it to the requested
 * width. Width is visual-column based, so ANSI escape sequences do not push
 * the right border out of alignment.
 */
export function frameLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth("││", width, "");

  return `│${padToWidth(content, width - 2)}│`;
}

/**
 * Render a `left + fill + right` border segment, e.g. `┌────┐`. Falls back
 * to a truncated `leftright` pair when the requested width is too narrow
 * for any fill characters.
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

export function wrapBody(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
