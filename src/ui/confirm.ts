/**
 * Small custom confirmation overlay shared by preset TUI surfaces.
 *
 * Owns yes/no keyboard handling for extension-local confirmations; it does
 * NOT own the action being confirmed or any persistence side effects.
 */
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  type Component,
  type Focusable,
} from "@mariozechner/pi-tui";

class ConfirmComponent implements Component, Focusable {
  private selected: "no" | "yes" = "no";
  private resolved = false;
  private _focused = false;

  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly theme: Theme,
    private readonly done: (result: boolean) => void,
  ) {}

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  handleInput(input: string): void {
    if (matchesKey(input, Key.escape)) {
      this.finish(false);

      return;
    }

    if (matchesKey(input, Key.left) || matchesKey(input, Key.right)) {
      this.selected = this.selected === "yes" ? "no" : "yes";

      return;
    }

    if (input.toLowerCase() === "y") {
      this.finish(true);

      return;
    }

    if (input.toLowerCase() === "n") {
      this.finish(false);

      return;
    }

    if (matchesKey(input, Key.enter) || input === " ") {
      this.finish(this.selected === "yes");
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const messageLines = this.message
      .split("\n")
      .flatMap((line) =>
        line.length === 0 ? [""] : wrapWords(line, bodyWidth - 4),
      );
    const buttons = [
      this.renderButton("yes", "Yes"),
      this.renderButton("no", "No"),
    ].join("   ");
    const lines = [
      frameSegment("┌", "─", "┐", frameWidth),
      frameLine(
        centerText(
          this.theme.fg("accent", this.theme.bold(this.title)),
          bodyWidth,
        ),
        frameWidth,
      ),
      frameLine("", frameWidth),
      ...messageLines.map((line) => frameLine(`  ${line}`, frameWidth)),
      frameLine("", frameWidth),
      frameLine(centerText(buttons, bodyWidth), frameWidth),
      frameLine(
        this.theme.fg("dim", " ←/→ choose · Enter confirm · Esc cancel "),
        frameWidth,
      ),
      frameSegment("└", "─", "┘", frameWidth),
    ];

    return lines.map((line) => truncateToWidth(line, frameWidth, ""));
  }

  private finish(result: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done(result);
  }

  private renderButton(value: "no" | "yes", label: string): string {
    const text = this.selected === value ? `● ${label}` : `○ ${label}`;

    return this.selected === value ? this.theme.fg("accent", text) : text;
  }
}

export async function openConfirm(
  ctx: Pick<ExtensionCommandContext, "ui">,
  title: string,
  message: string,
): Promise<boolean> {
  return ctx.ui.custom<boolean>(
    (_tui, theme, _keybindings, done) =>
      new ConfirmComponent(title, message, theme, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 2,
        maxHeight: "50%",
        minWidth: 48,
        width: "50%",
      },
    },
  );
}

function wrapWords(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (candidate.length <= safeWidth) {
      current = candidate;
    } else {
      if (current.length > 0) lines.push(padToWidth(current, safeWidth));
      current = word;
    }
  }

  if (current.length > 0) lines.push(padToWidth(current, safeWidth));

  return lines.length > 0 ? lines : [""];
}
