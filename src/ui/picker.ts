/**
 * Interactive picker for browsing and activating presets.
 *
 * Owns the `ctx.ui.custom` state machine that drives the picker dialog;
 * it does NOT own persistence, scope/rank filtering, card formatting, or
 * the activation side effects (the `onActivate` callback is injected by
 * the caller).
 */
import type { ApplyResult } from "../activation/apply.js";
import { detectDriftReasons } from "../activation/drift.js";
import type { ActivePresetSession } from "../activation/session.js";
import { surfaceWarnings } from "../commands/presets/notify.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { samePresetIdentity } from "../preset-identity.js";
import { loadAll } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import type { ScopeFilter } from "./filter.js";
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  ACTIVATE_LABEL,
  ACTIVATION_FAILED_TITLE,
  CLEAR_LABEL,
  CLOSE_LABEL,
  CURSOR_LABEL,
  DELETE_LABEL,
  DUPLICATE_LABEL,
  EDIT_LABEL,
  FILTER_LABEL,
  LIST_LABEL,
  MOVE_LABEL,
  NEW_LABEL,
  REORDER_LABEL,
  STATUS_ACTION_LABEL,
} from "./labels.js";
import { withHiddenOverlay } from "./overlay-host.js";
import { PickerCommands, type PickerCommandHost } from "./picker-commands.js";
import {
  clampScrollToFit,
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
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  decodeKittyPrintable,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type Focusable,
  type OverlayHandle,
  type Terminal,
} from "@earendil-works/pi-tui";

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
   * `{ ok: false, reason }` to keep it open and surface the refusal in an
   * overlay-appropriate dialog.
   */
  onActivate(preset: LoadedPreset): Promise<ApplyResult>;
  hotkeys: HotkeyRegistry;
  pi?: ExtensionAPI;
  session: ActivePresetSession;
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

interface PackedListResult {
  readonly lines: string[];
  readonly renderedCards: number;
}

interface RenderListResult {
  readonly correctedScrollOffset?: number;
  readonly lines: string[];
  readonly renderedCards: number;
}

class PresetPickerComponent implements Component, Focusable, PickerCommandHost {
  private _focused = false;
  private state: PickerState = initialPickerState();
  private readonly filterInput = new Input();
  private cachedVisible?: { key: string; presets: readonly LoadedPreset[] };
  private overlayHandle: OverlayHandle | undefined;
  private renderedPageSize: number | undefined;
  private resolved = false;
  private applying = false;
  private readonly commands: PickerCommands = new PickerCommands(this);
  /**
   * Memoized drift reasons for the currently-active preset.
   *
   * Recomputed when the loaded presets change (`refreshPresets`); within a
   * single render pass the reasons are stable, so we don't re-run
   * `detectDriftReasons` on every keystroke or scroll. The picker is opened
   * within a single agent turn, so the cached snapshot on the active state
   * cannot move under us between renders.
   */
  private driftReasonsCache:
    | { reasons: readonly string[]; signature: string }
    | undefined;

  constructor(
    private allPresets: LoadedPreset[],
    readonly ctx: ExtensionCommandContext,
    readonly pi: ExtensionAPI | undefined,
    readonly ui: Pick<ExtensionUIContext, "notify">,
    readonly theme: Theme,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly fixedPageSize: number | undefined,
    private inheritedTools: readonly string[],
    readonly hotkeys: HotkeyRegistry,
    readonly session: ActivePresetSession,
    readonly onActivate: (preset: LoadedPreset) => Promise<ApplyResult>,
    private readonly done: (result: PickerResult | undefined) => void,
    private readonly requestRender: () => void,
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
    } else if (matchesKey(input, Key.ctrl(Key.up))) {
      void this.commands.reorder(-1);
    } else if (matchesKey(input, Key.ctrl(Key.down))) {
      void this.commands.reorder(1);
    } else if (normalized === "/") {
      this.setFocusMode("filter");
    } else if (normalized === "n") {
      void this.commands.openEditorForNew();
    } else if (normalized === "e") {
      void this.commands.openEditorForSelection();
    } else if (normalized === "d") {
      void this.commands.duplicate();
    } else if (normalized === "x") {
      void this.commands.delete();
    } else if (normalized === "c") {
      void this.commands.clearActive();
    } else if (normalized === "s") {
      void this.commands.showStatus();
    }
  }

  invalidate(): void {}

  setOverlayHandle(handle: OverlayHandle): void {
    this.overlayHandle = handle;
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);

    const list = this.renderList(frameWidth);

    if (list.correctedScrollOffset !== undefined) {
      this.state = clampScrollToFit(
        this.state,
        list.renderedCards,
        this.visiblePresets().length,
      );
    }

    return [
      this.renderTopBorder(frameWidth),
      frameLine(this.renderFilterContent(frameWidth), frameWidth),
      this.renderRule(frameWidth),
      ...list.lines,
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

      if (result.ok) {
        this.finish({ activated: preset });
      } else {
        await this.runWithHiddenOverlay(() =>
          openInfoDialog(this.ctx, {
            body: result.reason,
            title: ACTIVATION_FAILED_TITLE,
            tone: "error",
          }),
        );
      }
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

  /** {@link PickerCommandHost} member. */
  currentSelection(): LoadedPreset | undefined {
    return selectedPickerPreset(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );
  }

  /**
   * Memoized drift-reason lookup for the currently-active preset.
   *
   * Keyed on the active state's identity (`scope:name:dirty`) so a tools
   * toggle or a scope change invalidates the cache, but a filter keystroke
   * or page scroll does not. The compared snapshot lives on `active.declared`
   * — no disk I/O.
   */
  private computeDriftReasons(
    active: NonNullable<ReturnType<ActivePresetSession["current"]>>,
    pi: ExtensionAPI,
  ): readonly string[] {
    const signature = `${active.scope}:${active.name}:${active.dirty ? "1" : "0"}`;

    if (this.driftReasonsCache?.signature === signature) {
      return this.driftReasonsCache.reasons;
    }

    const reasons = detectDriftReasons(active.declared, pi, this.ctx);

    this.driftReasonsCache = { reasons, signature };

    return reasons;
  }

  /** {@link PickerCommandHost} member. */
  getAllPresets(): readonly LoadedPreset[] {
    return this.allPresets;
  }

  /** {@link PickerCommandHost} member. */
  async runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T> {
    return withHiddenOverlay(this.overlayHandle, this.requestRender, fn);
  }

  /** {@link PickerCommandHost} member. */
  async refreshPresets(selectionKey?: string): Promise<void> {
    const { presets, warnings } = await loadAll(this.ctx);

    surfaceWarnings(this.ctx, warnings);
    this.allPresets = presets;
    this.inheritedTools = this.pi?.getActiveTools() ?? this.inheritedTools;
    this.invalidateVisible();
    this.driftReasonsCache = undefined;
    this.state = preservePickerSelectionOrFirst(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
      selectionKey ??
        selectedPickerPresetKey(
          this.state,
          this.allPresets,
          this.filterInput.getValue(),
        ),
      this.pageSize,
    );
    this.requestRender();
  }

  /**
   * {@link PickerCommandHost} member.
   *
   * Idempotent resolver — guards against double-resolve from rapid Enter.
   */
  finish(result: PickerResult | undefined): void {
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
      return `${label}${this.theme.fg("dim", "Type to filter.")}`;
    }

    const inputLine = this.filterInput.render(inputWidth)[0] ?? "";

    return `${label}${inputLine}`;
  }

  private renderFooterContent(): string {
    const noMatches = this.visiblePresets().length === 0;
    const activateHint = noMatches
      ? `⏎ ${ACTIVATE_LABEL} (no matches)`
      : `⏎ ${ACTIVATE_LABEL}`;
    const footer =
      this.state.focusMode === "filter"
        ? `${activateHint} · Esc ${LIST_LABEL} · ←/→ ${CURSOR_LABEL} · ↑/↓ ${MOVE_LABEL} · PgUp/PgDn`
        : `${activateHint} · n ${NEW_LABEL} · e ${EDIT_LABEL} · d ${DUPLICATE_LABEL} · x ${DELETE_LABEL} · c ${CLEAR_LABEL} · s ${STATUS_ACTION_LABEL} · Ctrl+↑/↓ ${REORDER_LABEL} · / ${FILTER_LABEL} · Esc ${CLOSE_LABEL}`;

    return this.theme.fg("dim", ` ${footer}`);
  }

  private renderList(width: number): RenderListResult {
    const visiblePresets = this.visiblePresets();

    if (visiblePresets.length === 0) {
      this.renderedPageSize = undefined;

      return {
        lines: [
          frameLine("", width),
          frameLine(
            centerText(
              this.theme.fg("warning", "No matching presets"),
              width - 2,
            ),
            width,
          ),
          frameLine("", width),
        ],
        renderedCards: 0,
      };
    }

    let scrollOffset = this.state.scrollOffset;
    let packed = this.packList(width, scrollOffset);
    let correctedScrollOffset: number | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const lastPackedIndex = scrollOffset + packed.renderedCards - 1;

      if (
        this.state.selectedIndex >= scrollOffset &&
        this.state.selectedIndex <= lastPackedIndex
      ) {
        this.renderedPageSize = Math.max(MIN_PAGE_SIZE, packed.renderedCards);

        if (correctedScrollOffset !== undefined) {
          return {
            correctedScrollOffset,
            lines: packed.lines,
            renderedCards: packed.renderedCards,
          };
        }

        return { lines: packed.lines, renderedCards: packed.renderedCards };
      }

      const nextScrollOffset = clampScrollToFit(
        { ...this.state, scrollOffset },
        packed.renderedCards,
        visiblePresets.length,
      ).scrollOffset;

      if (nextScrollOffset === scrollOffset) break;

      correctedScrollOffset = nextScrollOffset;
      scrollOffset = nextScrollOffset;
      packed = this.packList(width, scrollOffset);
    }

    this.renderedPageSize = Math.max(MIN_PAGE_SIZE, packed.renderedCards);

    if (correctedScrollOffset !== undefined) {
      return {
        correctedScrollOffset,
        lines: packed.lines,
        renderedCards: packed.renderedCards,
      };
    }

    return { lines: packed.lines, renderedCards: packed.renderedCards };
  }

  private packList(width: number, scrollOffset: number): PackedListResult {
    const visiblePresets = this.visiblePresets();
    const active = this.session.current();
    const lines: string[] = [];
    const lineBudget = this.listLineBudget();
    let renderedCards = 0;

    for (
      let absoluteIndex = scrollOffset;
      absoluteIndex < visiblePresets.length;
      absoluteIndex++
    ) {
      if (this.fixedPageSize !== undefined && renderedCards >= this.pageSize) {
        break;
      }

      const preset = visiblePresets[absoluteIndex];

      if (!preset) continue;

      const isActive = samePresetIdentity(active, preset);
      const driftReasons =
        isActive && active?.dirty && this.pi
          ? this.computeDriftReasons(active, this.pi)
          : undefined;
      const card = presetCard(preset, this.theme, {
        active: isActive,
        ...(isActive && active?.dirty ? { dirty: true } : {}),
        ...(driftReasons ? { driftReasons } : {}),
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

    return { lines, renderedCards };
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
  let currentPicker: PresetPickerComponent | undefined;

  return ctx.ui.custom<PickerResult | undefined>(
    (tui, theme, _keybindings, done) => {
      const picker = new PresetPickerComponent(
        presets,
        ctx,
        options.pi,
        ctx.ui,
        theme,
        tui.terminal,
        options.pageSize,
        inheritedTools,
        options.hotkeys,
        options.session,
        (preset) => options.onActivate(preset),
        done,
        () => tui.requestRender(),
      );

      currentPicker = picker;

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
      onHandle: (handle) => currentPicker?.setOverlayHandle(handle),
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
