/**
 * Interactive picker for browsing and activating presets.
 *
 * Owns the `ctx.ui.custom` state machine that drives the picker dialog;
 * it does NOT own persistence, scope/rank filtering, card formatting, or
 * the activation side effects (the `onActivate` callback is injected by
 * the caller).
 */
import { getActive } from "../activation/active-state.js";
import { clear as clearPreset } from "../activation/clear.js";
import { surfaceWarnings } from "../commands/presets/notify.js";
import {
  addPreset,
  loadAll,
  removePreset,
  reorderWithinScope,
} from "../store/api.js";
import type { LoadedPreset, Preset } from "../types.js";
import { openConfirm } from "./confirm.js";
import { openEditor } from "./editor.js";
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
  ExtensionAPI,
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
  type OverlayHandle,
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
  pi?: ExtensionAPI;
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
  private overlayHandle: OverlayHandle | undefined;
  private renderedPageSize: number | undefined;
  private resolved = false;
  private applying = false;

  constructor(
    private allPresets: LoadedPreset[],
    private readonly ctx: ExtensionCommandContext,
    private readonly pi: ExtensionAPI | undefined,
    private readonly ui: Pick<ExtensionUIContext, "notify">,
    private readonly theme: Theme,
    private readonly terminal: Pick<Terminal, "rows">,
    private readonly fixedPageSize: number | undefined,
    private inheritedTools: readonly string[],
    private readonly onActivate: (
      preset: LoadedPreset,
    ) => Promise<{ ok: boolean }>,
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
      void this.reorderSelection(-1);
    } else if (matchesKey(input, Key.ctrl(Key.down))) {
      void this.reorderSelection(1);
    } else if (normalized === "/") {
      this.setFocusMode("filter");
    } else if (normalized === "n") {
      void this.openNewFromPicker();
    } else if (normalized === "e") {
      void this.openEditorForSelection();
    } else if (normalized === "d") {
      void this.duplicateSelection();
    } else if (normalized === "x") {
      void this.deleteSelection();
    } else if (normalized === "c") {
      void this.clearActivePreset();
    }
  }

  invalidate(): void {}

  setOverlayHandle(handle: OverlayHandle): void {
    this.overlayHandle = handle;
  }

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

  private async clearActivePreset(): Promise<void> {
    if (!this.pi) return;

    const confirmed = await this.runWithHiddenOverlay(() =>
      openConfirm(
        this.ctx,
        "Clear active preset?",
        "Clear the active preset and restore managed settings?",
      ),
    );

    if (!confirmed) return;

    await clearPreset(this.ctx, this.pi);
    await this.refreshPresets();
  }

  private async deleteSelection(): Promise<void> {
    await this.confirmAndActOnSelection(
      (preset) => ({
        title: `Delete '${preset.name}'?`,
        message: `Remove preset "${preset.name}" from ${preset.scope} scope?`,
      }),
      async (preset) => {
        const result = await removePreset(preset.name, preset.scope, this.ctx);

        if (!result.ok) {
          this.ui.notify(result.reason, "error");

          return;
        }

        await this.refreshPresets(loadedPresetKey(preset));
      },
    );
  }

  private async duplicateSelection(): Promise<void> {
    await this.confirmAndActOnSelection(
      (preset) => ({
        title: `Duplicate '${preset.name}'?`,
        message: `Create a copy of "${preset.name}" in ${preset.scope} scope?`,
      }),
      async (preset) => {
        const scopedNames = this.allPresets
          .filter((candidate) => candidate.scope === preset.scope)
          .map((candidate) => candidate.name);
        const copyName = uniqueCopyName(preset.name, scopedNames);
        const copy = serializeForCopy(preset, copyName);
        // Route through the canonical CRUD primitive so any future
        // invariant checks added to addPreset apply here too. The preset
        // is appended at the end of the scope; the reorderWithinScope
        // call below moves it immediately after its source.
        const added = await addPreset(copy, preset.scope, this.ctx);

        if (!added.ok) {
          this.ui.notify(added.reason, "error");

          return;
        }

        const sourceIndex = scopedNames.indexOf(preset.name);
        const reordered = [...scopedNames];

        reordered.splice(Math.max(0, sourceIndex + 1), 0, copyName);
        await reorderWithinScope(preset.scope, reordered, this.ctx);
        await this.refreshPresets(`${preset.scope}:${copyName}`);
      },
    );
  }

  /**
   * Shared confirm-then-act wrapper for CRUD action keys that operate on
   * the currently-selected preset (delete, duplicate). Resolves the
   * selection, opens the confirm dialog with the caller-supplied copy,
   * and invokes `action(preset)` on yes. A no-op on empty selection or
   * cancelled confirm so each call site stays flat.
   */
  private async confirmAndActOnSelection(
    messages: (preset: LoadedPreset) => { title: string; message: string },
    action: (preset: LoadedPreset) => Promise<void>,
  ): Promise<void> {
    const preset = this.currentSelection();

    if (!preset) return;

    const { title, message } = messages(preset);
    const confirmed = await this.runWithHiddenOverlay(() =>
      openConfirm(this.ctx, title, message),
    );

    if (!confirmed) return;

    await action(preset);
  }

  private currentSelection(): LoadedPreset | undefined {
    return selectedPickerPreset(
      this.state,
      this.allPresets,
      this.filterInput.getValue(),
    );
  }

  private async openNewFromPicker(): Promise<void> {
    await this.openEditorAndDispatch(undefined);
  }

  private async openEditorForSelection(): Promise<void> {
    const preset = this.currentSelection();

    if (!preset) return;

    await this.openEditorAndDispatch(preset);
  }

  /**
   * Shared wrapper for the two editor-entry actions (new, edit-selected).
   * Hides the picker overlay, opens the editor seeded with either an
   * existing preset or `undefined` (new-preset defaults), and routes the
   * result: a `saved` payload refreshes the list with the new selection
   * focused; a `tested` payload closes the picker and reports the
   * candidate preset as `activated` so the outer notification surface
   * names the right preset.
   */
  private async openEditorAndDispatch(
    preset: LoadedPreset | undefined,
  ): Promise<void> {
    const result = await this.runWithHiddenOverlay(() =>
      openEditor(this.ctx, preset, {
        onTest: (candidate) =>
          this.onActivate({
            ...candidate,
            unavailable: undefined,
          }),
        pi: this.pi,
        presets: this.allPresets,
      }),
    );

    if (result?.saved) await this.refreshPresets(loadedPresetKey(result.saved));
    if (result?.tested) this.finish({ activated: result.tested });
  }

  private async runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T> {
    this.overlayHandle?.setHidden(true);

    try {
      return await fn();
    } finally {
      this.overlayHandle?.setHidden(false);
      this.overlayHandle?.focus();
      this.requestRender();
    }
  }

  private async refreshPresets(selectionKey?: string): Promise<void> {
    const { presets, warnings } = await loadAll(this.ctx);

    surfaceWarnings(this.ctx, warnings);
    this.allPresets = presets;
    this.inheritedTools = this.pi?.getActiveTools() ?? this.inheritedTools;
    this.invalidateVisible();
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

  private async reorderSelection(direction: -1 | 1): Promise<void> {
    const preset = this.currentSelection();

    if (!preset) return;

    const scopedPresets = this.allPresets.filter(
      (candidate) => candidate.scope === preset.scope,
    );
    const index = scopedPresets.findIndex(
      (candidate) => candidate.name === preset.name,
    );
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= scopedPresets.length) return;

    const ordered = [...scopedPresets];
    const current = ordered[index];
    const next = ordered[nextIndex];

    if (!current || !next) return;

    ordered[index] = next;
    ordered[nextIndex] = current;
    await reorderWithinScope(
      preset.scope,
      ordered.map((candidate) => candidate.name),
      this.ctx,
    );
    await this.refreshPresets(loadedPresetKey(preset));
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
        : `${activateHint} · n New · e Edit · d Duplicate · x Delete · c Clear · Ctrl+↑/↓ Reorder · / Filter · Esc Close`;

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

function loadedPresetKey(preset: Pick<LoadedPreset, "name" | "scope">): string {
  return `${preset.scope}:${preset.name}`;
}

function serializeForCopy(preset: LoadedPreset, name: string): Preset {
  const copy: Preset = {
    model: preset.model,
    name,
    provider: preset.provider,
  };

  if (preset.thinkingLevel !== undefined)
    copy.thinkingLevel = preset.thinkingLevel;
  if (preset.tools !== undefined) copy.tools = [...preset.tools];
  if (preset.instructions !== undefined)
    copy.instructions = preset.instructions;
  if (preset.order !== undefined) copy.order = preset.order;

  return copy;
}

function uniqueCopyName(
  name: string,
  existingNames: readonly string[],
): string {
  const existing = new Set(existingNames);
  const base = `${name}-copy`;

  if (!existing.has(base)) return base;

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix++) {
    const candidate = `${base}-${suffix}`;

    if (!existing.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
