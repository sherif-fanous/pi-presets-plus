/**
 * Small custom confirmation overlay shared by preset TUI surfaces.
 *
 * Owns yes/no keyboard handling for extension-local confirmations; it does
 * NOT own the action being confirmed or any persistence side effects.
 */
import { centerText, renderDialogFrame, wrapBody } from "./frame.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Key,
  matchesKey,
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

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const messageLines = wrapBody(this.message, bodyWidth - 4);
    const buttons = [
      this.renderButton("yes", "Yes"),
      this.renderButton("no", "No"),
    ].join("   ");

    return renderDialogFrame({
      bodyLines: [
        ...messageLines.map((line) => `  ${line}`),
        "",
        centerText(buttons, bodyWidth),
      ],
      footer: this.theme.fg("dim", " ←/→ choose · Enter confirm · Esc cancel "),
      title: this.theme.fg("accent", this.theme.bold(this.title)),
      width: frameWidth,
    });
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
