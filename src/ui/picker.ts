/**
 * Interactive picker for browsing and activating presets.
 *
 * Owns the `ctx.ui.custom` state machine for OpenSpec change
 * `add-preset-picker`; it does NOT own persistence, scope/rank filtering
 * (`./filter.ts`), card formatting (`./widgets.ts`), or the actual apply
 * side effects (`onActivate` is injected by the caller). Future editor and
 * shortcut changes can extend the reserved-key branches and card fields
 * while leaving filtering/scope behavior intact.
 */
import { getActive } from "../activation/active-state.js";
import { surfaceWarnings } from "../commands/presets/notify.js";
import { loadAll } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import type { ScopeFilter } from "./filter.js";
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import {
  cycleScope as cyclePickerScope,
  initialPickerState,
  moveSelection as movePickerSelection,
  preserveSelectionOrFirst as preservePickerSelectionOrFirst,
  selectedPreset as selectedPickerPreset,
  selectedPresetKey as selectedPickerPresetKey,
  setFocusMode as setPickerFocusMode,
  visiblePresets as visiblePickerPresets,
  type PickerFocusMode,
  type PickerState,
} from "./picker-state.js";
import { presetCard } from "./widgets.js";
import type {
  ExtensionCommandContext,
  ExtensionUIContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  decodeKittyPrintable,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type Focusable,
  type Terminal,
} from "@mariozechner/pi-tui";

export interface PickerOptions {
  inheritedTools?: readonly string[];
  /**
   * Optional fixed page size override. When omitted (the default) the picker
   * derives page size dynamically from the terminal height. Retained for
   * future tests / specialty callers; production callers should leave it
   * unset so the layout responds to terminal resizes.
   */
  pageSize?: number;
  /**
   * Activation callback. Returns `{ ok: true }` to close the picker, or
   * `{ ok: false }` to keep it open (e.g. preset is unavailable, model not
   * found at apply time, or no API key). The callee is responsible for any
   * user-facing notification — the picker does not duplicate refusal copy.
   */
  onActivate(preset: LoadedPreset): Promise<{ ok: boolean }>;
}

export interface PickerResult {
  activated?: LoadedPreset;
}

/**
 * Average rendered card height used only before the first render, when no
 * actual packed page size has been measured yet. Once rendered, the picker
 * uses greedy actual-height card packing and remembers the most recent
 * rendered card count for page navigation / selection visibility.
 */
const FALLBACK_AVG_CARD_LINES = 7;
/**
 * Lines consumed by chrome (top border + filter row + rule + rule + footer +
 * bottom border). Subtracted from the overlay's available height to get the
 * card-rendering budget.
 */
const CHROME_LINES = 6;
/** Fallback page size when the terminal height is unknown or absurdly small. */
const MIN_PAGE_SIZE = 1;

class PresetPickerComponent implements Component, Focusable {
  private _focused = false;
  private state: PickerState = initialPickerState();
  private readonly filterInput = new Input();
  private cachedVisible?: { key: string; presets: readonly LoadedPreset[] };
  private renderedPageSize: number | undefined;
  private resolved = false;
  private applying = false;

  constructor(
    private readonly allPresets: readonly LoadedPreset[],
    private readonly ui: Pick<ExtensionUIContext, "notify">,
    private readonly theme: Theme,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly fixedPageSize: number | undefined,
    private readonly inheritedTools: readonly string[],
    private readonly onActivate: (
      preset: LoadedPreset,
    ) => Promise<{ ok: boolean }>,
    private readonly done: (result: PickerResult | undefined) => void,
  ) {}

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.syncFilterFocus();
  }

  handleInput(input: string): void {
    // Ignore further input while an activation is in flight so a held Enter
    // doesn't queue duplicate apply calls.
    if (this.applying) return;

    // Defensive Kitty CSI-u normalization: pi-tui currently doesn't request
    // CSI-u for plain printable keys (flag 1 alone leaves them as raw chars),
    // but future flag bumps or unusual layouts may wrap them. Normalize so
    // `===` checks below stay correct in either world.
    const printable = decodeKittyPrintable(input);
    const normalized = printable ?? input;

    if (this.state.focusMode === "filter") {
      this.handleFilterInput(input);

      return;
    }

    if (matchesKey(input, Key.up)) {
      this.moveSelection(-1);
    } else if (matchesKey(input, Key.down)) {
      this.moveSelection(1);
    } else if (matchesKey(input, Key.pageUp)) {
      this.moveSelection(-this.pageSize, { wrap: false });
    } else if (matchesKey(input, Key.pageDown)) {
      this.moveSelection(this.pageSize, { wrap: false });
    } else if (matchesKey(input, Key.left)) {
      this.cycleScope(-1);
    } else if (matchesKey(input, Key.right)) {
      this.cycleScope(1);
    } else if (matchesKey(input, Key.enter)) {
      void this.activateSelection();
    } else if (matchesKey(input, Key.escape)) {
      this.finish(undefined);
    } else if (normalized === "/") {
      this.setFocusMode("filter");
    } else if (["n", "e", "d", "x"].includes(normalized)) {
      this.ui.notify("Editor coming in next change.", "info");
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);

    return [
      this.renderTopBorder(frameWidth),
      frameLine(this.renderFilterContent(frameWidth), frameWidth),
      this.renderRule(frameWidth),
      ...this.renderList(frameWidth),
      this.renderRule(frameWidth),
      frameLine(this.renderFooterContent(), frameWidth),
      this.renderBottomBorder(frameWidth),
    ];
  }

  private async activateSelection(): Promise<void> {
    const preset = selectedPickerPreset(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );

    if (!preset) return;

    this.applying = true;

    try {
      const result = await this.onActivate(preset);

      if (result.ok) this.finish({ activated: preset });
    } finally {
      this.applying = false;
    }
  }

  private cycleScope(direction: -1 | 1): void {
    this.state = cyclePickerScope(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      direction,
      this.pageSize,
    );
    this.invalidateVisible();
  }

  /** Idempotent resolver — guards against double-resolve from rapid Enter. */
  private finish(result: PickerResult | undefined): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done(result);
  }

  private handleFilterInput(input: string): void {
    if (matchesKey(input, Key.escape)) {
      this.setFocusMode("list");

      return;
    }

    if (matchesKey(input, Key.enter)) {
      this.setFocusMode("list");

      return;
    }

    // Navigation keys stay live in filter mode so users can type-then-arrow
    // without needing to escape back to the list first.
    if (matchesKey(input, Key.up)) {
      this.moveSelection(-1);

      return;
    }

    if (matchesKey(input, Key.down)) {
      this.moveSelection(1);

      return;
    }

    if (matchesKey(input, Key.pageUp)) {
      this.moveSelection(-this.pageSize, { wrap: false });

      return;
    }

    if (matchesKey(input, Key.pageDown)) {
      this.moveSelection(this.pageSize, { wrap: false });

      return;
    }

    const previousQuery = this.filterInput.getValue();
    const previousSelection = selectedPickerPresetKey(
      this.state,
      this.allPresets,
      previousQuery,
    );

    this.filterInput.handleInput(input);

    if (this.filterInput.getValue() !== previousQuery) {
      this.invalidateVisible();
      this.state = preservePickerSelectionOrFirst(
        this.state,
        this.allPresets,
        this.filterInput.getValue(),
        previousSelection,
        this.pageSize,
      );
    }
  }

  private invalidateVisible(): void {
    this.cachedVisible = undefined;
  }

  private moveSelection(
    delta: number,
    options: { wrap: boolean } = { wrap: true },
  ): void {
    this.state = movePickerSelection(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      delta,
      this.pageSize,
      options,
    );
  }

  /** Rows available for list cards after overlay chrome is accounted for. */
  private listLineBudget(): number {
    // The overlay clamps height to 80% of terminal rows; we mirror that
    // here so the card packer doesn't pretend the entire terminal is ours.
    return Math.max(
      MIN_PAGE_SIZE,
      Math.floor(this.terminal.rows * 0.8) - CHROME_LINES,
    );
  }

  /**
   * Page size in cards. Fixed via the constructor option (tests/specialty
   * callers) or learned from the last render's greedy actual-height packing.
   * Before the first render we use a conservative fallback estimate so page
   * navigation still behaves sensibly during the initial input/render cycle.
   */
  private get pageSize(): number {
    if (this.fixedPageSize !== undefined) {
      return Math.max(MIN_PAGE_SIZE, this.fixedPageSize);
    }

    if (this.renderedPageSize !== undefined) {
      return Math.max(MIN_PAGE_SIZE, this.renderedPageSize);
    }

    const cardSpace = this.listLineBudget();

    return Math.max(
      MIN_PAGE_SIZE,
      Math.floor(cardSpace / FALLBACK_AVG_CARD_LINES),
    );
  }

  private renderBottomBorder(width: number): string {
    return frameSegment("└", "─", "┘", width);
  }

  private renderFilterContent(width: number): string {
    const label = this.theme.fg("muted", " Filter: ");
    const inputWidth = Math.max(1, width - 2 - visibleWidth(label));
    const query = this.filterInput.getValue();

    if (this.state.focusMode !== "filter" && query.length === 0) {
      return `${label}${this.theme.fg("dim", "type to filter")}`;
    }

    const inputLine = this.filterInput.render(inputWidth)[0] ?? "";

    return `${label}${inputLine}`;
  }

  private renderFooterContent(): string {
    const noMatches = this.visiblePresets().length === 0;
    const activateHint = noMatches ? "⏎ Activate (no matches)" : "⏎ Activate";
    const footer =
      this.state.focusMode === "filter"
        ? `${activateHint} · Esc List · ←/→ Cursor · ↑/↓ Move · PgUp/PgDn`
        : `${activateHint} · / Filter · ↑/↓ Move · PgUp/PgDn · ←/→ Scope · Esc Close`;

    return this.theme.fg("dim", ` ${footer}`);
  }

  private renderList(width: number): string[] {
    const visiblePresets = this.visiblePresets();

    if (visiblePresets.length === 0) {
      this.renderedPageSize = undefined;

      return [
        frameLine("", width),
        frameLine(
          centerText(
            this.theme.fg("warning", "No matching presets"),
            width - 2,
          ),
          width,
        ),
        frameLine("", width),
      ];
    }

    const active = getActive();
    const lines: string[] = [];
    const lineBudget = this.listLineBudget();
    let renderedCards = 0;

    for (
      let absoluteIndex = this.state.scrollOffset;
      absoluteIndex < visiblePresets.length;
      absoluteIndex++
    ) {
      if (this.fixedPageSize !== undefined && renderedCards >= this.pageSize) {
        break;
      }

      const preset = visiblePresets[absoluteIndex];

      if (!preset) continue;

      const card = presetCard(preset, this.theme, {
        active: active?.name === preset.name && active.scope === preset.scope,
        inheritedTools: this.inheritedTools,
        selected: absoluteIndex === this.state.selectedIndex,
        showShadowed: this.state.scopeFilter === "all",
      });
      const cardLines = card.render(width - 2);
      const separatorCost = renderedCards > 0 ? 1 : 0;
      const nextCost = separatorCost + cardLines.length;

      if (renderedCards > 0 && lines.length + nextCost > lineBudget) break;

      if (separatorCost > 0) lines.push(frameLine("", width));

      for (const cardLine of cardLines) {
        lines.push(frameLine(cardLine, width));
      }

      renderedCards++;
    }

    this.renderedPageSize = Math.max(MIN_PAGE_SIZE, renderedCards);

    return lines;
  }

  private renderRule(width: number): string {
    return frameSegment("├", "─", "┤", width);
  }

  private renderTopBorder(width: number): string {
    if (width <= 2) return truncateToWidth("┌┐", width, "");

    const title = this.theme.fg("accent", this.theme.bold("Presets Plus"));
    const scope = this.theme.fg(
      "muted",
      `Scope: ${formatScopeFilter(this.state.scopeFilter)}`,
    );
    const left = `─ ${title} `;
    const right = ` ${scope} ─`;
    const fillWidth = Math.max(
      0,
      width - 2 - visibleWidth(left) - visibleWidth(right),
    );
    const content = `${left}${"─".repeat(fillWidth)}${right}`;

    // Use `─` as the truncation suffix so the top border stays clean even
    // when the terminal is narrower than the title + scope label.
    return `┌${padToWidth(content, width - 2, "─", "─")}┐`;
  }

  private setFocusMode(focusMode: PickerFocusMode): void {
    this.state = setPickerFocusMode(this.state, focusMode);
    this.syncFilterFocus();
  }

  private syncFilterFocus(): void {
    this.filterInput.focused =
      this._focused && this.state.focusMode === "filter";
  }

  private visiblePresets(): readonly LoadedPreset[] {
    const cacheKey = `${this.state.scopeFilter}|${this.filterInput.getValue()}`;

    if (this.cachedVisible?.key === cacheKey) {
      return this.cachedVisible.presets;
    }

    const presets = visiblePickerPresets(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );

    this.cachedVisible = { key: cacheKey, presets };

    return presets;
  }
}

/** Open the preset picker and resolve once the user closes it. */
export async function openPicker(
  ctx: ExtensionCommandContext,
  options: PickerOptions,
): Promise<PickerResult | undefined> {
  const { presets, warnings } = await loadAll(ctx);

  surfaceWarnings(ctx, warnings);

  const inheritedTools = options.inheritedTools ?? [];

  return ctx.ui.custom<PickerResult | undefined>(
    (tui, theme, _keybindings, done) => {
      const picker = new PresetPickerComponent(
        presets,
        ctx.ui,
        theme,
        tui.terminal,
        options.pageSize,
        inheritedTools,
        (preset) => options.onActivate(preset),
        done,
      );

      return {
        get focused() {
          return picker.focused;
        },
        set focused(value: boolean) {
          picker.focused = value;
        },
        handleInput(input: string): void {
          picker.handleInput(input);
          tui.requestRender();
        },
        invalidate(): void {
          picker.invalidate();
        },
        render(width: number): string[] {
          return picker.render(width);
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 1,
        maxHeight: "80%",
        minWidth: 64,
        width: "80%",
      },
    },
  );
}

function formatScopeFilter(scopeFilter: ScopeFilter): string {
  switch (scopeFilter) {
    case "all":
      return "All";
    case "user":
      return "User only";
    case "project":
      return "Project only";
  }
}
