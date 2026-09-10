/** Searches provider and model options and opens a keyboard-driven selection overlay. */
import { frameLine, frameSegment } from "./frame.js";
import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  SelectList,
  truncateToWidth,
  type Component,
  type Focusable,
  type Terminal,
} from "@earendil-works/pi-tui";

/** One selectable identifier with optional searchable name and availability hint. */
export interface ModelSelectorItem {
  readonly id: string;
  readonly name?: string;
  readonly available?: boolean;
}

/** Options for a provider or model selection session. */
export interface ModelSelectorOptions {
  readonly title: string;
  readonly current: string;
  readonly items: readonly ModelSelectorItem[];
}

class ModelSelectorComponent implements Component, Focusable {
  private readonly input = new Input();
  private results: ModelSelectorItem[];
  private list: SelectList;
  private resolved = false;

  constructor(
    private readonly options: ModelSelectorOptions,
    private readonly theme: Theme,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly done: (result: string | undefined) => void,
    private readonly requestRender: () => void,
  ) {
    this.results = [...options.items];
    this.list = this.buildList(options.current);
  }

  get focused(): boolean {
    return this.input.focused;
  }
  set focused(value: boolean) {
    this.input.focused = value;
  }

  invalidate(): void {
    this.input.invalidate();
  }

  handleInput(data: string): void {
    if (this.resolved) return;

    if (matchesKey(data, Key.escape)) this.finish(undefined);
    else if (matchesKey(data, Key.enter)) {
      const selected = this.list.getSelectedItem();

      if (selected) this.finish(selected.value);
    } else if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      const count = this.results.length;

      if (count > 0) {
        const current = this.results.findIndex(
          (item) => item.id === this.list.getSelectedItem()?.value,
        );
        const direction = matchesKey(data, Key.down) ? 1 : -1;

        this.list.setSelectedIndex((current + direction + count) % count);
      }
    } else {
      const previous = this.input.getValue();

      this.input.handleInput(data);

      if (previous !== this.input.getValue()) {
        this.results = rankModelSelectorItems(
          this.options.items,
          this.input.getValue(),
        );

        this.list = this.buildList(
          normalize(this.input.getValue()) ? undefined : this.options.current,
        );
      }
    }

    this.requestRender();
  }

  render(width: number): string[] {
    const height = Math.max(1, this.terminal.rows - 2);

    this.list = this.buildList(this.list.getSelectedItem()?.value);

    const bodyWidth = Math.max(1, width - 2);
    const results =
      this.results.length > 0
        ? this.list.render(bodyWidth)
        : [this.theme.fg("dim", "No matching options.")];
    const search = `${this.theme.fg("muted", "Search: ")}${this.input.render(Math.max(1, bodyWidth - 8))[0] ?? ""}`;
    const body = [
      this.theme.fg("accent", this.theme.bold(this.options.title)),
      search,
      ...results,
      this.theme.fg(
        "dim",
        "Type to Filter · ↑/↓ Move · Enter Select · Esc Cancel",
      ),
    ];
    // Very short terminals reserve their remaining lines for the selection.
    const lines =
      height < 7
        ? [...(height > results.length ? [search] : []), ...results].slice(
            0,
            height,
          )
        : [
            frameSegment("┌", "─", "┐", width),
            ...body.map((line) => frameLine(line, width)),
            frameSegment("└", "─", "┘", width),
          ];

    return lines.map((line) => truncateToWidth(line, Math.max(0, width), ""));
  }

  private buildList(current?: string): SelectList {
    const height = Math.max(1, this.terminal.rows - 2);
    const maxVisible = Math.max(1, height - (height < 7 ? 2 : 6));
    const list = new SelectList(
      this.results.map((item) => ({
        value: item.id,
        label: item.available === false ? `${item.id} (no key)` : item.id,
      })),
      maxVisible,
      {
        selectedPrefix: (text) => this.theme.fg("accent", text),
        selectedText: (text) => this.theme.fg("accent", text),
        description: (text) => this.theme.fg("muted", text),
        scrollInfo: (text) => this.theme.fg("dim", text),
        noMatch: (text) => this.theme.fg("dim", text),
      },
    );

    list.setSelectedIndex(
      Math.max(
        0,
        this.results.findIndex((item) => item.id === current),
      ),
    );

    return list;
  }

  private finish(result: string | undefined): void {
    this.resolved = true;
    this.done(result);
  }
}

/** Open a fresh selector and resolve with its confirmed identifier or cancellation. */
export async function openModelSelector(
  ctx: Pick<ExtensionCommandContext, "ui">,
  options: ModelSelectorOptions,
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>(
    (tui, theme, _keybindings, done) =>
      new ModelSelectorComponent(options, theme, tui.terminal, done, () =>
        tui.requestRender(),
      ),
    {
      overlay: true,
      overlayOptions: { anchor: "center", margin: 1, width: "90%" },
    },
  );
}

/** Rank token matches by exact identifier, identifier prefix, then registry order. */
export function rankModelSelectorItems(
  items: readonly ModelSelectorItem[],
  query: string,
): ModelSelectorItem[] {
  const normalized = normalize(query);

  if (!normalized) return [...items];

  const tokens = normalized.split(" ");
  const exact: ModelSelectorItem[] = [];
  const prefix: ModelSelectorItem[] = [];
  const other: ModelSelectorItem[] = [];

  for (const item of items) {
    const id = normalize(item.id);
    const text = `${id} ${normalize(item.name ?? "")}`;

    if (!tokens.every((token) => text.includes(token))) continue;
    if (id === normalized) exact.push(item);
    else if (id.startsWith(normalized)) prefix.push(item);
    else other.push(item);
  }

  return [...exact, ...prefix, ...other];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
