/**
 * Read-only overlay that frames multi-line output, colors it by tone, and
 * dismisses on Enter or Esc.
 */
import { renderDialogFrame, wrapBody } from "./frame.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";

/** Title, body, and optional tone for one informational overlay. */
export interface InfoDialogOptions {
  readonly body: string;
  readonly title: string;
  readonly tone?: InfoDialogTone;
}

/** Severity that picks the title color and the footer hint wording. */
export type InfoDialogTone = "info" | "warning" | "error";

/** Dialog options after the default tone is filled in. */
type ResolvedInfoDialogOptions = InfoDialogOptions & { tone: InfoDialogTone };

class InfoDialogComponent implements Component, Focusable {
  private resolved = false;
  private _focused = false;

  constructor(
    private readonly options: ResolvedInfoDialogOptions,
    private readonly theme: Theme,
    private readonly done: () => void,
  ) {}

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  handleInput(input: string): void {
    if (matchesKey(input, Key.enter) || matchesKey(input, Key.escape)) {
      this.finish();
    }
  }

  invalidate(): void {
    // No cached layout or external data to invalidate.
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const titleColor = toneTitleColor(this.options.tone);

    return renderDialogFrame({
      bodyLines: [
        ...wrapBody(this.options.body, bodyWidth - 4).map(
          (line) => `  ${line}`,
        ),
        "",
      ],
      footer: this.theme.fg("dim", footerHint(this.options.tone)),
      title: this.theme.fg(titleColor, this.theme.bold(this.options.title)),
      width: frameWidth,
    });
  }

  private finish(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done();
  }
}

/** Open the overlay and resolve once the user dismisses it. */
export async function openInfoDialog(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: InfoDialogOptions,
): Promise<void> {
  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) =>
      new InfoDialogComponent(
        { ...options, tone: options.tone ?? "info" },
        theme,
        done,
      ),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 2,
        maxHeight: "90%",
        minWidth: 48,
        width: "90%",
      },
    },
  );
}

function footerHint(tone: InfoDialogTone): string {
  if (tone === "error") return " Press Enter or Esc to dismiss error ";
  if (tone === "warning") return " Press Enter or Esc to dismiss warning ";

  return " Press Enter or Esc to dismiss ";
}

function toneTitleColor(tone: InfoDialogTone): Parameters<Theme["fg"]>[0] {
  if (tone === "error") return "error";
  if (tone === "warning") return "warning";

  return "accent";
}
