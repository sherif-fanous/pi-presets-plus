/**
 * Small terminal-frame layout helpers shared by custom TUI surfaces.
 *
 * Owns width-safe border, padding, and centering primitives reused by
 * preset dialogs; it does NOT own picker state, activation, or any
 * specific dialog content.
 */
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

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
