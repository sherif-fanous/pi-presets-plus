/**
 * Custom TUI editor for creating, editing, and testing one preset.
 *
 * Owns form state, row-level keyboard handling, validation, and persistence
 * orchestration for a single preset; it does NOT own picker list state,
 * storage file parsing, or activation internals beyond the injected test
 * callback.
 */
import type { ActivePresetSession } from "../activation/session.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { findPreset, samePresetIdentity } from "../preset-identity.js";
import {
  addPreset,
  loadAll,
  removePreset,
  toPersistedPreset,
  updatePreset,
} from "../store/api.js";
import type { LoadedPreset, Preset } from "../types.js";
import { openConfirm } from "./confirm.js";
import {
  EDITOR_ROWS,
  type EditorFormState,
  type EditorRowId,
  type FieldDiagnostic,
  type ModelItem,
} from "./editor-types.js";
import { wrapIndex } from "./editor/row-render.js";
import type { EditorRow, EditorRowHost } from "./editor/row.js";
import { makeButtonsRow } from "./editor/rows/buttons.js";
import { makeHotkeyRow } from "./editor/rows/hotkey.js";
import { makeInstructionsRow } from "./editor/rows/instructions.js";
import { makeModelRow } from "./editor/rows/model.js";
import { makeNameRow } from "./editor/rows/name.js";
import { makeProviderRow } from "./editor/rows/provider.js";
import { makeScopeRow } from "./editor/rows/scope.js";
import {
  makeThinkingRow,
  renderThinkingRowsForState,
  snapThinkingSelection,
} from "./editor/rows/thinking.js";
import { makeToolsRow } from "./editor/rows/tools.js";
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import {
  findConflictingPreset,
  isPiBuiltin,
  parseHotkey,
} from "./hotkey-input.js";
import { openInfoDialog } from "./info-dialog.js";
import { isHelpKey } from "./key-fallbacks.js";
import { MOVE_LABEL, MOVE_PRESET_TITLE } from "./labels.js";
import { withHiddenOverlay } from "./overlay-host.js";
import { openPromptEditor } from "./prompt-editor.js";
import { confirmReload, reloadAfterOverlayClose } from "./reload-prompt.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  type Component,
  type Focusable,
  type OverlayHandle,
} from "@earendil-works/pi-tui";

export { EDITOR_ROWS, renderThinkingRowsForState, snapThinkingSelection };
export type { EditorFormState };

export interface EditorOptions {
  pi?: Pick<
    ExtensionAPI,
    "appendEntry" | "getActiveTools" | "getAllTools" | "getThinkingLevel"
  >;
  /**
   * Optional pre-loaded preset list. When provided the editor uses it
   * verbatim for collision/conflict checks and skips the initial `loadAll`
   * round-trip; callers that already keep a fresh in-memory list (the
   * picker) avoid a redundant disk read. Standalone callers omit this and
   * the editor falls back to `loadAll(ctx)`.
   */
  hotkeys?: HotkeyRegistry;
  presets?: readonly LoadedPreset[];
  session: ActivePresetSession;
  onReloadRequested?(): void;
  onTest?(preset: LoadedPreset): Promise<{ ok: boolean }>;
}

export interface EditorResult {
  reloadRequested?: boolean;
  saved?: LoadedPreset;
  /**
   * The synthetic candidate preset assembled from the form when the user
   * pressed the Test button and activation succeeded. Carries enough
   * identity for the picker's outer notification surface to name the
   * right preset; never persisted to disk.
   */
  tested?: LoadedPreset;
}

type ValidationResult =
  | { fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>; ok: true }
  | {
      fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>;
      flowError?: string;
      ok: false;
    };

class PresetEditorComponent implements Component, Focusable, EditorRowHost {
  private actionInFlight = false;
  private fieldDiagnostics: Map<EditorRowId, FieldDiagnostic> = new Map();
  private flowError: string | undefined;
  private focusedRowIndex = 0;
  private overlayHandle: OverlayHandle | undefined;
  readonly nameInput = new Input();
  readonly hotkeyInput = new Input();
  private resolved = false;
  /**
   * Source-of-truth row registry. Built once in the constructor; consumed
   * by `handleInput`, `openHelpForFocusedRow`, and `renderRows`. Iteration
   * order comes from `EDITOR_ROWS`; the map is for id-keyed lookup.
   */
  private readonly rowsById: ReadonlyMap<EditorRowId, EditorRow>;
  /**
   * Direct alias for `options.session`. Pinned to a class field so dead-code
   * analysis (fallow) can trace method calls without losing the edge through
   * the `EditorOptions` interface boundary; mirrors how `PresetPickerComponent`
   * stores its session.
   */
  readonly session: ActivePresetSession;
  readonly canTest: boolean;
  readonly pi:
    | Pick<
        ExtensionAPI,
        "appendEntry" | "getActiveTools" | "getAllTools" | "getThinkingLevel"
      >
    | undefined;
  readonly initialActiveTools: readonly string[];
  private _focused = false;

  constructor(
    readonly ctx: ExtensionCommandContext,
    readonly theme: Theme,
    readonly models: readonly ModelItem[],
    private readonly allPresets: readonly LoadedPreset[],
    readonly allTools: readonly string[],
    readonly initialPreset: LoadedPreset | undefined,
    private readonly options: EditorOptions,
    private readonly done: (result: EditorResult | undefined) => void,
    private readonly requestRender: () => void,
    private state: EditorFormState = initialState(
      initialPreset,
      models,
      options.pi?.getActiveTools() ?? [],
    ),
  ) {
    this.session = options.session;
    this.pi = options.pi;
    this.initialActiveTools = options.pi?.getActiveTools() ?? [];
    this.canTest = options.onTest !== undefined;
    setInputValueCursorAtEnd(this.nameInput, this.state.name);
    setInputValueCursorAtEnd(this.hotkeyInput, this.state.hotkey);
    this.rowsById = this.buildRowsRegistry();
    // Note: we deliberately do NOT auto-snap thinking level on open. A
    // preset whose declared level will clamp at apply time stays selected
    // here so save-without-edit round-trips the original value; only
    // user-driven model/provider changes mutate the selected level.
    this.syncFocus();
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.syncFocus();
  }

  handleInput(input: string): void {
    if (this.actionInFlight) return;

    if (matchesKey(input, Key.escape)) {
      this.finish(undefined);

      return;
    }

    // Audited pi-tui Input.handleInput, this editor's textarea handler, and
    // the shortcut chain below: none bind F1, Ctrl+S, or Ctrl+T, so intercept
    // before row delegation. Re-audit if pi-tui's Input changes its key map.
    if (isHelpKey(input)) {
      void this.runAsync(() => this.openHelpForFocusedRow());

      return;
    }

    if (matchesKey(input, Key.ctrl("s"))) {
      this.activateButton("save");

      return;
    }

    if (this.options.onTest !== undefined && matchesKey(input, Key.ctrl("t"))) {
      this.activateButton("test");

      return;
    }

    if (matchesKey(input, Key.tab) || matchesKey(input, Key.down)) {
      this.moveFocus(1);

      return;
    }

    if (matchesKey(input, Key.shift(Key.tab)) || matchesKey(input, Key.up)) {
      this.moveFocus(-1);

      return;
    }

    this.rowsById.get(this.currentRow())?.handleInput(input);
  }

  invalidate(): void {}

  setOverlayHandle(handle: OverlayHandle): void {
    this.overlayHandle = handle;
  }

  render(width: number): string[] {
    const frameWidth = Math.max(2, width);
    const bodyWidth = Math.max(1, frameWidth - 2);
    const title = this.initialPreset
      ? `Edit preset: ${this.initialPreset.name}`
      : "New preset";
    const lines = [
      frameSegment("┌", "─", "┐", frameWidth),
      frameLine(
        centerText(this.theme.fg("accent", this.theme.bold(title)), bodyWidth),
        frameWidth,
      ),
      frameLine("", frameWidth),
      ...this.renderRows(bodyWidth).map((line) => frameLine(line, frameWidth)),
      frameLine("", frameWidth),
      frameLine(this.theme.fg("dim", this.renderFooterHint()), frameWidth),
      frameSegment("└", "─", "┘", frameWidth),
    ];

    return lines.map((line) => truncateToWidth(line, frameWidth, ""));
  }

  private async confirm(title: string, message: string): Promise<boolean> {
    return this.runWithHiddenOverlay(() =>
      openConfirm(this.ctx, title, message),
    );
  }

  private async promptReloadHidden(): Promise<boolean> {
    return this.runWithHiddenOverlay(() => confirmReload(this.ctx));
  }

  private async openHelpForFocusedRow(): Promise<void> {
    const entry = this.rowsById.get(this.currentRow())?.help;

    if (!entry) return;

    // Edit-mode addenda surface consequences that only apply to existing
    // presets (rename migrates the file, scope-change moves the file)
    // without cluttering the new-preset experience.
    const isEdit = this.initialPreset !== undefined;
    const paragraphs = [
      ...entry.body,
      ...(isEdit ? (entry.editAddendum ?? []) : []),
    ];

    await this.runWithHiddenOverlay(() =>
      openInfoDialog(this.ctx, {
        body: paragraphs.join("\n\n"),
        title: entry.title,
      }),
    );
  }

  private async runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T> {
    return withHiddenOverlay(this.overlayHandle, this.requestRender, fn);
  }

  currentModel(): Model<Api> | undefined {
    return this.models.find(
      (item) =>
        item.provider === this.state.provider && item.id === this.state.model,
    )?.model;
  }

  currentRow(): EditorRowId {
    return EDITOR_ROWS[this.focusedRowIndex] ?? "name";
  }

  getState(): EditorFormState {
    return this.state;
  }

  setState(state: EditorFormState): void {
    this.state = state;
  }

  getFieldDiagnostic(row: EditorRowId): FieldDiagnostic | undefined {
    return this.fieldDiagnostics.get(row);
  }

  modelsForProvider(provider: string): readonly ModelItem[] {
    return this.models.filter((item) => item.provider === provider);
  }

  /**
   * Triggered after a user-driven model/provider change. If the chosen
   * level is still valid for the new model, no-op; otherwise snap to
   * `"off"`. Never called from the constructor — opening must not
   * silently mutate the form.
   */
  snapThinkingIfInvalid(): void {
    this.state = snapThinkingSelection(this.state, this.currentModel());
  }

  /**
   * Hide the editor overlay, open the multi-line prompt editor, and
   * commit the result into the form state when the user confirms.
   */
  async openPromptEditor(): Promise<void> {
    const result = await this.runWithHiddenOverlay(() =>
      openPromptEditor(this.ctx, {
        initialText: this.state.instructions,
        presetName: this.state.name,
      }),
    );

    if (result.confirmed) {
      this.state = { ...this.state, instructions: result.text };
    }
  }

  activateButton(action: "cancel" | "save" | "test"): void {
    void this.runAsync(() => this.executeButton(action));
  }

  private async executeButton(
    action: "cancel" | "save" | "test",
  ): Promise<void> {
    switch (action) {
      case "cancel":
        this.finish(undefined);

        break;
      case "save":
        await this.save();

        break;
      case "test":
        await this.testPreset();

        break;
    }
  }

  private finish(result: EditorResult | undefined): void {
    if (this.resolved) return;
    this.resolved = true;
    this.done(result);
  }

  private moveFocus(direction: -1 | 1): void {
    this.focusedRowIndex = wrapIndex(
      this.focusedRowIndex,
      EDITOR_ROWS.length,
      direction,
    );
    this.syncFocus();
  }

  providers(): readonly string[] {
    return [...new Set(this.models.map((item) => item.provider))];
  }

  private renderFooterHint(): string {
    const tokens = [
      `⇥/↑/↓ ${MOVE_LABEL}`,
      "←/→ Change",
      "Space Toggle",
      this.currentRow() === "instructions" ? "Enter to edit" : "Enter Action",
      "F1 Help",
      "^S Save",
    ];

    if (this.options.onTest !== undefined) tokens.push("^T Test");

    tokens.push("Esc Cancel");

    return ` ${tokens.join(" · ")}`;
  }

  private renderRows(width: number): string[] {
    const rows: string[] = [];

    for (const id of EDITOR_ROWS) {
      // Hotkey-reload notice + flow error land between the last value row
      // (hotkey) and the buttons row. They are not row-owned content so
      // they live outside the registry.
      if (id === "buttons") rows.push(...this.renderMessages());

      const row = this.rowsById.get(id);

      if (row) rows.push(...row.renderLines(width));
    }

    return rows.map((line) => padToWidth(line, width));
  }

  /**
   * Build the per-instance row registry.
   *
   * Each factory builds an `EditorRow` against `this` as the host. The
   * editor implements `EditorRowHost`; row modules consume only the
   * methods and fields they declare on that interface.
   */
  private buildRowsRegistry(): ReadonlyMap<EditorRowId, EditorRow> {
    const entries: readonly EditorRow[] = [
      makeNameRow(this),
      makeScopeRow(this),
      makeProviderRow(this),
      makeModelRow(this),
      makeThinkingRow(this),
      makeToolsRow(this),
      makeInstructionsRow(this),
      makeHotkeyRow(this),
      makeButtonsRow(this),
    ];

    return new Map(entries.map((entry) => [entry.id, entry]));
  }

  private renderMessages(): string[] {
    const lines: string[] = [];

    const hotkeyNotice = formatHotkeyReloadNotice(
      this.initialPreset?.hotkey ?? "",
      this.state.hotkey,
    );

    if (hotkeyNotice.length > 0) {
      lines.push(...hotkeyNotice.map((line) => this.theme.fg("dim", line)));
    }

    if (this.flowError) {
      lines.push(this.theme.fg("error", `    ${this.flowError}`));
    }

    return lines;
  }

  async runAsync(fn: () => Promise<void>): Promise<void> {
    this.actionInFlight = true;

    try {
      await fn();
    } finally {
      this.actionInFlight = false;
      this.requestRender();
    }
  }

  private async save(): Promise<void> {
    this.clearValidationErrors();

    const validation = this.validateForSave();

    this.applyValidationDiagnostics(validation);

    if (!validation.ok) return;

    const next = buildPreset(this.state);
    const result = await this.persist(next);

    if (!result.ok) {
      this.flowError = result.reason;

      return;
    }

    this.updateActiveAfterMoveOrRename(next);

    const loaded = findPreset((await loadAll(this.ctx)).presets, {
      name: next.name,
      scope: this.state.scope,
    });

    const saved = loaded ?? { ...next, scope: this.state.scope };

    if (this.options.hotkeys?.saveNeedsReload(this.initialPreset, saved)) {
      const reloadRequested = await this.promptReloadHidden();

      this.finish({ reloadRequested, saved });

      if (reloadRequested) {
        if (this.options.onReloadRequested) {
          this.options.onReloadRequested();
        } else {
          reloadAfterOverlayClose(this.ctx);
        }
      } else {
        this.options.hotkeys.recordReloadPromptDeclined(saved);
      }

      return;
    }

    this.finish({ saved });
  }

  private async persist(
    next: Preset,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.initialPreset) return addPreset(next, this.state.scope, this.ctx);

    if (this.initialPreset.scope === this.state.scope) {
      return updatePreset(
        this.initialPreset.name,
        this.state.scope,
        next,
        this.ctx,
      );
    }

    const confirmed = await this.confirm(
      MOVE_PRESET_TITLE,
      `Move "${this.initialPreset.name}" from ${this.initialPreset.scope} to ${this.state.scope}? The old copy will be removed.`,
    );

    if (!confirmed) return { ok: false, reason: "Move cancelled." };

    const added = await addPreset(next, this.state.scope, this.ctx);

    if (!added.ok) return added;

    await removePreset(
      this.initialPreset.name,
      this.initialPreset.scope,
      this.ctx,
    );

    return { ok: true };
  }

  private async testPreset(): Promise<void> {
    this.clearValidationErrors();

    if (this.options.onTest === undefined) {
      throw new Error("testPreset reached without a wired callback.");
    }

    const validation = this.validateRequired();

    this.applyValidationDiagnostics(validation);

    if (!validation.ok) return;

    const preset = buildPreset(this.state);
    const candidate: LoadedPreset = { ...preset, scope: this.state.scope };
    const result = await this.options.onTest(candidate);

    if (result.ok) this.finish({ tested: candidate });
  }

  /**
   * Keep the in-memory active-preset reference correct after a Save that
   * either renamed the active preset, moved it across scopes, or both.
   * Re-appending `presets-plus:active` is what makes the picker / status
   * surface refresh against the new identity on the next render.
   */
  private updateActiveAfterMoveOrRename(next: Preset): void {
    if (!this.initialPreset || !this.options.pi) return;

    const active = this.session.current();

    if (
      active?.name !== this.initialPreset.name ||
      active.scope !== this.initialPreset.scope
    ) {
      return;
    }

    this.session.updateIdentity(
      next.name,
      this.state.scope,
      this.ctx,
      this.options.pi,
    );
  }

  recomputeHotkeyDiagnostic(): void {
    this.fieldDiagnostics.delete("hotkey");
    this.addHotkeyDiagnostic(this.fieldDiagnostics);
  }

  private addHotkeyDiagnostic(
    fieldDiagnostics: Map<EditorRowId, FieldDiagnostic>,
  ): void {
    const hotkey = this.state.hotkey.trim();

    if (hotkey.length === 0) return;

    const parsed = parseHotkey(hotkey);

    if (!parsed.ok) {
      fieldDiagnostics.set("hotkey", {
        message: parsed.reason,
        severity: "error",
      });

      return;
    }

    if (isPiBuiltin(parsed.parsed)) {
      fieldDiagnostics.set("hotkey", {
        message: hotkeyShadowsBuiltinWarning(parsed.parsed.normalized),
        severity: "warning",
      });

      return;
    }

    const conflict = findConflictingPreset(
      parsed.parsed,
      this.allPresets,
      this.initialPreset?.name,
    );

    // v1 intentionally keeps first-match behavior for combined warning
    // conditions; see this change's design Risks / Trade-offs section.
    if (conflict) {
      fieldDiagnostics.set("hotkey", {
        message: hotkeyConflictWarning(parsed.parsed.normalized, conflict.name),
        severity: "warning",
      });
    }
  }

  private validateForSave(): ValidationResult {
    const required = this.validateRequired();
    const fieldDiagnostics = new Map(required.fieldDiagnostics);

    if (this.hasNameCollision()) {
      fieldDiagnostics.set("name", {
        message: `A preset named "${this.state.name.trim()}" already exists in ${this.state.scope}.`,
        severity: "error",
      });
    }

    this.addHotkeyDiagnostic(fieldDiagnostics);

    const hasError = [...fieldDiagnostics.values()].some(
      (diagnostic) => diagnostic.severity === "error",
    );

    return { fieldDiagnostics, ok: !hasError };
  }

  private hasNameCollision(): boolean {
    return this.allPresets.some((preset) => {
      if (preset.scope !== this.state.scope) return false;
      if (preset.name !== this.state.name.trim()) return false;

      return !(
        this.initialPreset && samePresetIdentity(preset, this.initialPreset)
      );
    });
  }

  private validateRequired(): ValidationResult {
    const fieldDiagnostics = new Map<EditorRowId, FieldDiagnostic>();

    if (this.state.name.trim().length === 0) {
      fieldDiagnostics.set("name", {
        message: "Name is required.",
        severity: "error",
      });
    }

    if (this.state.provider.length === 0) {
      fieldDiagnostics.set("provider", {
        message: "Provider is required.",
        severity: "error",
      });
    }

    if (this.state.model.length === 0) {
      fieldDiagnostics.set("model", {
        message: "Model is required.",
        severity: "error",
      });
    }

    const hasError = fieldDiagnostics.size > 0;

    return { fieldDiagnostics, ok: !hasError };
  }

  /**
   * Apply row-level diagnostics from validation without clearing unrelated
   * flow-state errors. Validation currently does not produce flow errors, but
   * the union retains the field for future non-row failure paths.
   */
  private applyValidationDiagnostics(result: ValidationResult): void {
    this.fieldDiagnostics = new Map(result.fieldDiagnostics);

    if (!result.ok && result.flowError !== undefined) {
      this.flowError = result.flowError;
    }
  }

  private clearValidationErrors(): void {
    this.fieldDiagnostics.clear();
    this.flowError = undefined;
  }

  clearFieldDiagnosticsFor(row: EditorRowId): void {
    this.fieldDiagnostics.delete(row);

    if (row === "scope") this.fieldDiagnostics.delete("name");
    if (row === "provider") this.fieldDiagnostics.delete("model");
  }

  private syncFocus(): void {
    this.nameInput.focused = this._focused && this.currentRow() === "name";
    this.hotkeyInput.focused = this._focused && this.currentRow() === "hotkey";
  }
}

/**
 * Pure helper: assemble a `Preset` from the form state, omitting fields
 * that should not appear in the on-disk shape (e.g. empty instructions,
 * empty hotkey, `session`-mode tools, `off` thinking).
 *
 * Routes the assembled fields through `toPersistedPreset` so the
 * editor, picker copy, and `saveScope` all share one drop-undefined +
 * defensive-tools-copy contract. Exposed for tests; the editor
 * instance calls this internally.
 */
export function buildPreset(state: EditorFormState): Preset {
  const instructions = state.instructions.trim();
  const hotkey = state.hotkey.trim();

  return toPersistedPreset({
    model: state.model,
    name: state.name.trim(),
    provider: state.provider,
    thinkingLevel:
      state.thinkingLevel !== "off" ? state.thinkingLevel : undefined,
    tools: state.toolsMode === "preset" ? state.selectedTools : undefined,
    instructions: instructions.length > 0 ? instructions : undefined,
    hotkey: hotkey.length > 0 ? hotkey : undefined,
  });
}

export function formatHotkeyReloadNotice(
  previousValue: string,
  nextValue: string,
): string[] {
  const previous = previousValue.trim();
  const next = nextValue.trim();

  if (previous === next) return [];

  if (previous.length === 0) {
    return [
      `    Hotkey added: ${next}.`,
      "    Takes effect after /reload; no binding is active until then.",
    ];
  }

  if (next.length === 0) {
    return [
      `    Hotkey removed (was: ${previous}).`,
      "    Takes effect after /reload. The previous binding remains active until then.",
    ];
  }

  return [
    `    Hotkey changed: ${previous} → ${next}.`,
    "    Takes effect after /reload. The previous binding remains active until then.",
  ];
}

/**
 * Pure helper: derive the editor's initial form state from an existing
 * preset (edit mode) or sensible defaults (new mode). For new presets
 * the thinking level defaults to `"off"` per the spec's "Open editor for
 * a new preset" scenario; the editor never reads the live session's
 * thinking level into a new preset's form because that would silently
 * couple a brand-new preset to whatever the user happened to be doing.
 *
 * `activeTools` seeds the tools row's pre-selection when the preset has
 * no `tools` field yet, per the spec's
 * "pre-checked from ... `pi.getActiveTools()` if the preset has no tools
 * yet" clause. This is purely a UI pre-check: while the user stays in
 * `session` mode the tools field is still omitted from the persisted
 * preset; the pre-fill only materializes if they toggle to `preset` mode
 * and save.
 */
export function initialState(
  preset: LoadedPreset | undefined,
  models: readonly ModelItem[],
  activeTools: readonly string[] = [],
): EditorFormState {
  const firstModel = models[0];

  return {
    hotkey: preset?.hotkey ?? "",
    instructions: preset?.instructions ?? "",
    model: preset?.model ?? firstModel?.id ?? "",
    name: preset?.name ?? "",
    provider: preset?.provider ?? firstModel?.provider ?? "",
    scope: preset?.scope ?? "user",
    selectedTools: preset?.tools ? [...preset.tools] : [...activeTools],
    thinkingLevel: preset?.thinkingLevel ?? "off",
    toolsMode: preset?.tools ? "preset" : "session",
  };
}

export async function openEditor(
  ctx: ExtensionCommandContext,
  preset: LoadedPreset | undefined,
  options: EditorOptions,
): Promise<EditorResult | undefined> {
  const presets = options.presets ?? (await loadAll(ctx)).presets;
  // Source all models (not just keyed ones) so a preset whose provider
  // lost its API key still appears in the dropdown; the Model row renders
  // unavailable entries dimmed with a `(no key)` suffix. The picker card
  // already surfaces per-preset `unavailable: "no-key"` at load time; the
  // editor matches that vocabulary rather than hiding models outright.
  const models = ctx.modelRegistry.getAll();
  const modelItems = models.map((model) => ({
    available: ctx.modelRegistry.hasConfiguredAuth(model),
    id: model.id,
    model,
    provider: model.provider,
  }));
  const allTools = options.pi?.getAllTools().map((tool) => tool.name) ?? [];
  let currentEditor: PresetEditorComponent | undefined;

  return ctx.ui.custom<EditorResult | undefined>(
    (tui, theme, _keybindings, done) => {
      const editor = new PresetEditorComponent(
        ctx,
        theme,
        modelItems,
        presets,
        allTools,
        preset,
        options,
        done,
        () => tui.requestRender(),
      );

      currentEditor = editor;

      return editor;
    },
    {
      onHandle: (handle) => currentEditor?.setOverlayHandle(handle),
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: 1,
        maxHeight: "90%",
        minWidth: 72,
        width: "90%",
      },
    },
  );
}

/**
 * Canonical Hotkey-conflict warning used by proactive recompute and the
 * Save-time validation backstop; keep wording aligned with the spec scenario.
 */
function hotkeyConflictWarning(normalized: string, presetName: string): string {
  return `⚠ ${normalized} is already used by preset "${presetName}"; this preset's binding will be skipped.`;
}

/**
 * Canonical Pi built-in shadow warning used by proactive recompute and the
 * Save-time validation backstop; keep wording aligned with the spec scenario.
 */
function hotkeyShadowsBuiltinWarning(normalized: string): string {
  return `⚠ ${normalized} shadows a Pi built-in; saving will replace Pi's behavior for this key.`;
}

/**
 * Seed a single-line `Input` with a pre-populated value while placing the
 * caret at the end of that text. Input.setValue() alone leaves the caret
 * at position 0 (it only clamps the existing caret), so opening the
 * editor for an existing preset would otherwise show the cursor stuck at
 * the start of the name / hotkey — an odd UX.
 *
 * Feeding the Input a legacy `End` sequence after setValue triggers
 * Input's own `tui.editor.cursorLineEnd` handler, which moves the caret
 * after the last grapheme without us needing to reach into private
 * state. `\x1b[F` is one of the sequences Input recognizes as End and
 * is unaffected by user keybinding overrides (the match path fires
 * before user-bindings resolution).
 */
function setInputValueCursorAtEnd(input: Input, value: string): void {
  input.setValue(value);

  if (value.length === 0) return;

  input.handleInput("\x1b[F");
}
