/**
 * Interactive picker for browsing and activating presets.
 *
 * Owns the `ctx.ui.custom` state machine that drives the picker dialog;
 * it does NOT own persistence, scope/rank filtering, card formatting, or
 * the activation side effects (the `onActivate` callback is injected by
 * the caller).
 */
import { detectDriftReasons } from "../activation/drift.js";
import type { ActivationResult } from "../activation/request.js";
import type { ActivePresetSession } from "../activation/session.js";
import { surfaceWarnings } from "../commands/presets/notify.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { samePresetIdentity } from "../preset-identity.js";
import { loadAll } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import { formatActionError } from "./action-error.js";
import type { ScopeFilter } from "./filter.js";
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  ACTIVATE_LABEL,
  ACTIVATION_FAILED_TITLE,
  CLOSE_LABEL,
  CURSOR_LABEL,
  FILTER_LABEL,
  LIST_LABEL,
  MOVE_LABEL,
  REORDER_LABEL,
} from "./labels.js";
import { withHiddenOverlay } from "./overlay-host.js";
import {
  PICKER_ACTIONS,
  PickerCommands,
  type PickerCommandHost,
} from "./picker-commands.js";
import {
  layoutPickerViewport,
  pickerFallbackPageSize,
  pickerListLineBudget,
} from "./picker-layout.js";
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
import { formatScopeName, presetCard } from "./widgets.js";
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
  sliceByColumn,
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
   * Activation callback. Returns `{ ok: true }` to close the picker, or
   * `{ ok: false, reason }` to keep it open and surface the refusal in an
   * overlay-appropriate dialog.
   */
  onActivate(preset: LoadedPreset): Promise<ActivationResult>;
  hotkeys: HotkeyRegistry;
  pi?: ExtensionAPI;
  session: ActivePresetSession;
}

export interface PickerResult {
  activated?: LoadedPreset;
}

interface RenderListResult {
  readonly lines: string[];
  readonly pageSize: number;
  readonly scrollOffset: number;
}

class PresetPickerComponent implements Component, Focusable, PickerCommandHost {
  private _focused = false;
  private state: PickerState = initialPickerState();
  private readonly filterInput = new Input();
  private cachedVisible?: { key: string; presets: readonly LoadedPreset[] };
  private overlayHandle: OverlayHandle | undefined;
  private renderedPageSize: number | undefined;
  private resolved = false;
  private actionInFlight = false;
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
    private inheritedTools: readonly string[],
    readonly hotkeys: HotkeyRegistry,
    readonly session: ActivePresetSession,
    readonly onActivate: (preset: LoadedPreset) => Promise<ActivationResult>,
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
    if (this.actionInFlight) return;

    this.dispatchInput(input);
    // Blanket request-render after every key dispatch keeps sync mutators
    // (moveSelection, cycleScope, setFocusMode, filter typing) visible
    // without each path having to opt in. Async paths request their own
    // render via runWithHiddenOverlay / refreshPresets; this trailing
    // request is idempotent in those cases.
    this.requestRender();
  }

  private dispatchInput(input: string): void {
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
      this.runAction(() => this.activateSelection());
    } else if (matchesKey(input, Key.escape)) {
      this.finish(undefined);
    } else if (matchesKey(input, Key.ctrl(Key.up))) {
      this.runAction(() => this.commands.reorder(-1));
    } else if (matchesKey(input, Key.ctrl(Key.down))) {
      this.runAction(() => this.commands.reorder(1));
    } else if (normalized === "/") {
      this.setFocusMode("filter");
    } else {
      // Source-of-truth dispatch over PICKER_ACTIONS so a new action key
      // lands once in the registry and shows up in both the handler chain
      // and the footer hint.
      const action = PICKER_ACTIONS.find(
        (candidate) => candidate.key === normalized,
      );

      if (action) this.runAction(() => action.run(this.commands));
    }
  }

  private runAction(action: () => Promise<void>): void {
    this.actionInFlight = true;

    void (async () => {
      try {
        await action();
      } catch (error) {
        this.ui.notify(formatActionError(error), "error");
      } finally {
        this.actionInFlight = false;
        this.requestRender();
      }
    })();
  }

  invalidate(): void {}

  setOverlayHandle(handle: OverlayHandle): void {
    this.overlayHandle = handle;
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);

    const list = this.renderList(frameWidth);

    this.renderedPageSize = list.pageSize > 0 ? list.pageSize : undefined;

    if (list.scrollOffset !== this.state.scrollOffset) {
      this.state = { ...this.state, scrollOffset: list.scrollOffset };
    }

    return [
      this.renderTopBorder(frameWidth),
      frameLine(this.renderActiveStatusContent(frameWidth), frameWidth),
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

    const result = await this.runWithHiddenOverlay(async () => {
      const activationResult = await this.onActivate(preset);

      if (!activationResult.ok && activationResult.kind !== "cancelled") {
        await openInfoDialog(this.ctx, {
          body: activationResult.reason,
          title: ACTIVATION_FAILED_TITLE,
          tone: "error",
        });
      }

      return activationResult;
    });

    if (result.ok) this.finish({ activated: preset });
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

  /**
   * Page size in cards, learned from the last variable-height layout pass.
   * The fallback keeps navigation usable before the first render.
   */
  private get pageSize(): number {
    return this.renderedPageSize ?? pickerFallbackPageSize(this.terminal.rows);
  }

  private renderBottomBorder(width: number): string {
    return frameSegment("└", "─", "┘", width);
  }

  private renderFilterContent(width: number): string {
    const label = this.theme.fg("muted", " Filter: ");
    const inputWidth = labelledContentWidth(width, label);
    const query = this.filterInput.getValue();

    if (this.state.focusMode !== "filter" && query.length === 0) {
      return `${label}${this.theme.fg("dim", "Type to filter.")}`;
    }

    const inputLine = this.filterInput.render(inputWidth)[0] ?? "";

    return `${label}${inputLine}`;
  }

  private renderActiveStatusContent(width: number): string {
    const label = this.theme.fg("muted", " Active: ");
    const contentWidth = labelledContentWidth(width, label);
    const active = this.session.current();

    // No active preset: render the sentinel in `dim` so it reads as an
    // absence marker, not a preset literally named "none" (names are only
    // required to be non-empty, so `none` is a legal preset name).
    if (!active) {
      const sentinel = this.theme.fg(
        "dim",
        middleEllipsize("none", contentWidth),
      );

      return `${label}${sentinel}`;
    }

    // Disambiguate by scope (rendered `dim`) so the row identifies the active
    // preset as precisely as the in-list dot, which matches on name + scope.
    const scopeSuffix = ` (${formatScopeName(active.scope)})`;
    const nameWidth = Math.max(1, contentWidth - visibleWidth(scopeSuffix));
    const name = middleEllipsize(active.name, nameWidth);

    return `${label}${name}${this.theme.fg("dim", scopeSuffix)}`;
  }

  private renderFooterContent(): string {
    const noMatches = this.visiblePresets().length === 0;
    const activateHint = noMatches
      ? `⏎ ${ACTIVATE_LABEL} (no matches)`
      : `⏎ ${ACTIVATE_LABEL}`;
    const actionHints = PICKER_ACTIONS.map(
      (action) => `${action.key} ${action.label}`,
    ).join(" · ");
    const footer =
      this.state.focusMode === "filter"
        ? `${activateHint} · Esc ${LIST_LABEL} · ←/→ ${CURSOR_LABEL} · ↑/↓ ${MOVE_LABEL} · PgUp/PgDn`
        : `${activateHint} · ${actionHints} · Ctrl+↑/↓ ${REORDER_LABEL} · / ${FILTER_LABEL} · Esc ${CLOSE_LABEL}`;

    return this.theme.fg("dim", ` ${footer}`);
  }

  private renderList(width: number): RenderListResult {
    const visiblePresets = this.visiblePresets();

    if (visiblePresets.length === 0) {
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
        pageSize: 0,
        scrollOffset: this.state.scrollOffset,
      };
    }

    const active = this.session.current();
    const cardLinesByIndex = new Map<number, readonly string[]>();
    const cardHeightAt = (absoluteIndex: number): number => {
      const cachedLines = cardLinesByIndex.get(absoluteIndex);

      if (cachedLines) return cachedLines.length;

      const preset = visiblePresets[absoluteIndex];

      if (!preset) return 0;

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

      cardLinesByIndex.set(absoluteIndex, cardLines);

      return cardLines.length;
    };
    const layout = layoutPickerViewport(
      visiblePresets.length,
      this.state.selectedIndex,
      this.state.scrollOffset,
      pickerListLineBudget(this.terminal.rows),
      cardHeightAt,
    );
    const lines: string[] = [];

    for (
      let absoluteIndex = layout.startIndex;
      absoluteIndex < layout.endIndex;
      absoluteIndex++
    ) {
      if (absoluteIndex > layout.startIndex) lines.push(frameLine("", width));

      const cardLines = cardLinesByIndex.get(absoluteIndex) ?? [];

      for (const cardLine of cardLines) {
        lines.push(frameLine(cardLine, width));
      }
    }

    return {
      lines,
      pageSize: layout.pageSize,
      scrollOffset: layout.scrollOffset,
    };
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
        inheritedTools,
        options.hotkeys,
        options.session,
        (preset) => options.onActivate(preset),
        done,
        () => tui.requestRender(),
      );

      currentPicker = picker;

      return picker;
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

/**
 * Visible-column budget for a labelled chrome row's value, after the row
 * label and the two border columns are reserved.
 *
 * `visibleWidth` strips ANSI, so callers MUST pass the already-themed label
 * (the same string concatenated into the rendered row) to keep the measured
 * width aligned with what `frameLine` later pads/truncates against. Clamped
 * to a minimum of 1 so an over-wide label degrades to a single value column
 * rather than a negative budget.
 */
function labelledContentWidth(width: number, label: string): number {
  return Math.max(1, width - 2 - visibleWidth(label));
}

/**
 * Truncate `text` in the middle to fit `width` visible columns, preserving
 * the leading and trailing portions around a single `…`.
 *
 * Invariants:
 *  - Returns `text` unchanged when it already fits (no spurious ellipsis).
 *  - The result's visible width never exceeds `width`.
 *  - The prefix and suffix can never overlap: the ellipsis branch is only
 *    reached when `visibleWidth(text) > width`, and the two side budgets sum
 *    to `width - 1`, which is strictly less than `visibleWidth(text)`.
 *  - The prefix receives the larger half (`ceil`) and the suffix the smaller
 *    (`floor`) of the side budget, biasing retention toward the start.
 * Both sides truncate on grapheme-cluster boundaries so neither half can
 * split a multi-code-point glyph.
 */
function middleEllipsize(text: string, width: number): string {
  const textWidth = visibleWidth(text);

  if (textWidth <= width) return text;

  if (width <= 1) return truncateToWidth(text, width, "…");

  const ellipsis = "…";
  const sideBudget = width - visibleWidth(ellipsis);
  const prefixWidth = Math.ceil(sideBudget / 2);
  const suffixWidth = Math.floor(sideBudget / 2);
  const prefix = truncateToWidth(text, prefixWidth, "");
  const suffix = sliceByColumn(
    text,
    textWidth - suffixWidth,
    suffixWidth,
    true,
  );

  return `${prefix}${ellipsis}${suffix}`;
}
