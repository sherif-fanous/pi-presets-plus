/**
 * Custom TUI editor for creating, editing, and testing one preset. Holds
 * the form state, routes keyboard input to the rows, validates the draft,
 * and drives saving it to disk.
 */
import type { ActivePresetSession } from "../activation/session.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { findPreset, samePresetIdentity } from "../preset-identity.js";
import { addPreset, loadAll, movePreset, updatePreset } from "../store/api.js";
import type { LoadedPreset, Preset } from "../types.js";
import { formatActionError } from "./action-error.js";
import { openConfirm } from "./confirm.js";
import {
  EDITOR_ROWS,
  type EditorFormState,
  type EditorRowId,
  type FieldDiagnostic,
  type ModelItem,
} from "./editor-types.js";
import { buildPreset, initialState } from "./editor/draft.js";
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

export { EDITOR_ROWS, renderThinkingRowsForState };
export type { EditorFormState };

/** Collaborators and callbacks the editor needs while it is open. */
export interface EditorOptions {
  pi?: Pick<
    ExtensionAPI,
    "appendEntry" | "getActiveTools" | "getAllTools" | "getThinkingLevel"
  >;
  hotkeys?: HotkeyRegistry;
  /**
   * Preset list used for name collision and hotkey conflict checks.
   * Callers that already hold a fresh in-memory list pass it here to skip
   * the initial disk read; otherwise the editor calls `loadAll(ctx)`.
   */
  presets?: readonly LoadedPreset[];
  session: ActivePresetSession;
  onReloadRequested?(): void;
  onTest?(preset: LoadedPreset): Promise<{ ok: boolean }>;
}

/** What the editor hands back to its caller when it closes. */
export interface EditorResult {
  reloadRequested?: boolean;
  saved?: LoadedPreset;
  /**
   * The candidate preset assembled from the form when the user pressed
   * Test and activation succeeded. It carries enough identity for the
   * caller to name the preset in a notification and is never written to
   * disk.
   */
  tested?: LoadedPreset;
}

/**
 * Entry options for one editor session, keyed by `mode`. The `seed`
 * pre-populates the rows and `target` names the on-disk preset a Save
 * mutates: `new` has neither, `edit` sets both to the same preset, and
 * `duplicate` seeds a renamed copy with no target, alongside the `source`
 * preset the window title names.
 */
export type EditorOpenOptions =
  | { mode: "new"; seed?: undefined; target?: undefined }
  | { mode: "edit"; seed: LoadedPreset; target: LoadedPreset }
  | {
      mode: "duplicate";
      seed: LoadedPreset;
      source: LoadedPreset;
      target?: undefined;
    };

/** One validation pass: per-row diagnostics plus an optional flow error. */
type ValidationResult =
  | { fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>; ok: true }
  | {
      fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>;
      flowError?: string;
      ok: false;
    };

/** Interactive overlay component that edits a single preset. */
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
   * Row implementations keyed by id, built once in the constructor.
   * Rendering and focus follow the order in `EDITOR_ROWS`; this map serves
   * id-keyed lookup.
   */
  private readonly rowsById: ReadonlyMap<EditorRowId, EditorRow>;
  /**
   * Alias for `options.session`. It lives on a class field so dead-code
   * analysis can follow the method calls across the `EditorOptions`
   * boundary.
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
    private readonly openOptions: EditorOpenOptions,
    private readonly options: EditorOptions,
    private readonly done: (result: EditorResult | undefined) => void,
    private readonly requestRender: () => void,
    private state: EditorFormState = initialState(
      openOptions.seed,
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
    // Opening the editor leaves the declared thinking level alone even when
    // the model would clamp it at apply time, so saving without edits
    // round-trips the original value. Only user-driven model or provider
    // changes move the selection.
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

    // No row handler binds F1, Ctrl+S, or Ctrl+T, so these shortcuts are
    // safe to claim before input reaches the focused row.
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
    const title = editorTitle(this.openOptions);
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

  /**
   * Show the help dialog for the focused row, appending the edit-only
   * paragraphs when the editor was opened on an existing preset.
   */
  private async openHelpForFocusedRow(): Promise<void> {
    const entry = this.rowsById.get(this.currentRow())?.help;

    if (!entry) return;

    const isEdit = this.openOptions.mode === "edit";
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
   * Hide the editor overlay, open the multi-line prompt editor, and write
   * the result into the form state when the user confirms.
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
      // The hotkey reload notice and the flow error belong to the form as a
      // whole, so they render between the last value row and the buttons.
      if (id === "buttons") rows.push(...this.renderMessages());

      const row = this.rowsById.get(id);

      if (row) rows.push(...row.renderLines(width));
    }

    return rows.map((line) => padToWidth(line, width));
  }

  /** Build this instance's rows, each bound to the editor as its host. */
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
      this.openOptions.mode === "edit"
        ? (this.openOptions.target.hotkey ?? "")
        : "",
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
    } catch (error) {
      this.flowError = formatActionError(error);
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

    const reloadBaseline =
      this.openOptions.mode === "edit" ? this.openOptions.target : undefined;

    if (this.options.hotkeys?.saveNeedsReload(reloadBaseline, saved)) {
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
    if (this.openOptions.mode !== "edit") {
      return addPreset(next, this.state.scope, this.ctx);
    }

    const target = this.openOptions.target;

    if (target.scope === this.state.scope) {
      return updatePreset(target.name, this.state.scope, next, this.ctx);
    }

    const confirmed = await this.confirm(
      MOVE_PRESET_TITLE,
      `Move "${target.name}" from ${target.scope} to ${this.state.scope}? This will remove the old copy.`,
    );

    if (!confirmed) return { ok: false, reason: "Move cancelled." };

    return movePreset(
      target.name,
      target.scope,
      this.state.scope,
      next,
      this.ctx,
    );
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
   * Point the active-preset session at the new identity after a Save that
   * renamed the active preset, moved it to another scope, or both.
   */
  private updateActiveAfterMoveOrRename(next: Preset): void {
    if (this.openOptions.mode !== "edit" || !this.options.pi) return;

    const target = this.openOptions.target;
    const active = this.session.current();

    if (active?.name !== target.name || active.scope !== target.scope) {
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
      this.openOptions.mode === "edit"
        ? this.openOptions.target.name
        : undefined,
    );

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
        this.openOptions.mode === "edit" &&
        samePresetIdentity(preset, this.openOptions.target)
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
   * Replace the row diagnostics with the ones validation produced, leaving
   * a flow error raised elsewhere in place.
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
 * Build the notice lines that tell the user a hotkey change takes effect
 * only after `/reload`. Returns an empty array when the hotkey is
 * unchanged.
 */
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
      "    Run /reload to activate it. No binding is active yet.",
    ];
  }

  if (next.length === 0) {
    return [
      `    Hotkey removed: ${previous}.`,
      "    Run /reload to finish removing it. The previous binding is still active.",
    ];
  }

  return [
    `    Hotkey changed: ${previous} → ${next}.`,
    "    Run /reload to activate the change. The previous binding is still active.",
  ];
}

/**
 * Open the preset editor overlay and resolve once it closes, with
 * `undefined` when the user cancels.
 */
export async function openEditor(
  ctx: ExtensionCommandContext,
  openOptions: EditorOpenOptions,
  options: EditorOptions,
): Promise<EditorResult | undefined> {
  const presets = options.presets ?? (await loadAll(ctx)).presets;
  // Include models without configured auth so a preset whose provider lost
  // its API key still appears in the list, dimmed with a `(no key)` suffix.
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
        openOptions,
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
 * Build the window title from the entry mode: a plain label for a new
 * preset, or the preset's name for edit and duplicate.
 */
function editorTitle(openOptions: EditorOpenOptions): string {
  switch (openOptions.mode) {
    case "new":
      return "New preset";
    case "edit":
      return `Edit '${openOptions.target.name}'`;
    case "duplicate":
      return `Duplicate '${openOptions.source.name}'`;

    default: {
      const exhaustive: never = openOptions;

      return exhaustive;
    }
  }
}

/** Warning shown when another preset already binds this hotkey. */
function hotkeyConflictWarning(normalized: string, presetName: string): string {
  return `⚠ ${normalized} is already used by preset "${presetName}". Pi will skip this preset's binding.`;
}

/** Warning shown when the hotkey shadows a Pi built-in binding. */
function hotkeyShadowsBuiltinWarning(normalized: string): string {
  return `⚠ ${normalized} shadows a Pi built-in. Saving will replace Pi's behavior for this key.`;
}

/**
 * Fill a single-line `Input` with a value and leave the caret after the
 * last character. `Input.setValue` only clamps the existing caret, so the
 * `\x1b[F` End sequence fed afterwards is what moves it; Input matches
 * that sequence before user keybindings resolve.
 */
function setInputValueCursorAtEnd(input: Input, value: string): void {
  input.setValue(value);

  if (value.length === 0) return;

  input.handleInput("\x1b[F");
}
