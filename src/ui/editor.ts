/**
 * Custom TUI editor for creating, editing, and testing one preset.
 *
 * Owns form state, row-level keyboard handling, validation, and persistence
 * orchestration for a single preset; it does NOT own picker list state,
 * storage file parsing, or activation internals beyond the injected test
 * callback.
 */
import { getActive, setActive } from "../activation/active-state.js";
import { validThinkingLevels } from "../activation/thinking.js";
import {
  recordReloadPromptDeclined,
  saveNeedsHotkeyReload,
} from "../hotkey-reload-baseline.js";
import {
  addPreset,
  loadAll,
  removePreset,
  updatePreset,
} from "../store/api.js";
import type {
  LoadedPreset,
  Preset,
  PresetScope,
  ThinkingLevel,
} from "../types.js";
import { openConfirm } from "./confirm.js";
import { centerText, frameLine, frameSegment, padToWidth } from "./frame.js";
import {
  findConflictingPreset,
  isPiBuiltin,
  parseHotkey,
} from "./hotkey-input.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  CANCEL_LABEL,
  MODEL_LABEL,
  MOVE_PRESET_TITLE,
  SAVE_LABEL,
  TEST_LABEL,
  THINKING_LABEL,
  TOOLS_LABEL,
} from "./labels.js";
import { confirmReload, reloadAfterOverlayClose } from "./reload-prompt.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  decodeKittyPrintable,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  type Component,
  type Focusable,
  type OverlayHandle,
} from "@mariozechner/pi-tui";

export interface EditorFormState {
  hotkey: string;
  instructions: string;
  model: string;
  name: string;
  provider: string;
  scope: PresetScope;
  selectedTools: string[];
  thinkingLevel: ThinkingLevel;
  toolsMode: ToolsMode;
}

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
  presets?: readonly LoadedPreset[];
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

interface EditorRowHelpEntry {
  readonly body: readonly string[];
  /**
   * Extra paragraphs shown only when the editor is opened for an existing
   * preset (`this.initialPreset !== undefined`). Lets us mention
   * edit-only consequences (rename moves the file, scope-change moves the
   * file) without cluttering the new-preset experience.
   */
  readonly editAddendum?: readonly string[];
  readonly title: string;
}

interface ModelItem {
  /**
   * True when the model has a resolvable API key / auth configured.
   * Unavailable models are still surfaced in the editor (so users editing
   * a preset whose key was rotated away can still see and re-select their
   * model) but are rendered with a dim `(no key)` suffix. Preset-level
   * availability enforcement happens downstream at apply time via
   * `computeAvailability`; this flag is purely a UI hint.
   */
  readonly available: boolean;
  readonly id: string;
  readonly model: Model<Api>;
  readonly provider: string;
}

type ButtonAction = "cancel" | "save" | "test";

type EditorRowId =
  | "buttons"
  | "hotkey"
  | "instructions"
  | "model"
  | "name"
  | "provider"
  | "scope"
  | "thinking"
  | "tools";

type FieldDiagnostic = {
  message: string;
  severity: "error" | "warning";
};

type ToolsMode = "preset" | "session";

type ValidationResult =
  | { fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>; ok: true }
  | {
      fieldDiagnostics: ReadonlyMap<EditorRowId, FieldDiagnostic>;
      flowError?: string;
      ok: false;
    };

const EDITOR_ROW_HELP: Record<EditorRowId, EditorRowHelpEntry> = {
  buttons: {
    body: [
      "Save writes this preset to disk after checking the values you entered.",
      "Cancel closes the editor and discards any changes you made.",
      "Test applies this preset to the current session without saving it \u2014 useful for trying things out.",
    ],
    title: "Actions",
  },
  hotkey: {
    body: [
      "Hotkeys let you switch to this preset with a single key combination.",
      "Use Pi's format, like ctrl+shift+1 or ctrl+m. Leave it blank if you don't want a hotkey.",
      "If your choice conflicts with another preset or a Pi built-in, you'll see a warning, but you can still save.",
    ],
    title: "Hotkey",
  },
  instructions: {
    body: [
      "Whatever you write here gets added to Pi's system prompt when this preset is active. It doesn't replace what Pi already has \u2014 it adds to it.",
      "Use it to describe your project's conventions, the tone you want, or any rules Pi should follow.",
    ],
    title: "Prompt",
  },
  model: {
    body: [
      "Pick which model Pi should use whenever this preset is active.",
      "Models marked (no key) don't have an API key set up yet, but you can still pick them \u2014 handy if you need to repair a preset whose key was removed.",
    ],
    title: "Model",
  },
  name: {
    body: [
      "Give your preset a short, memorable name.",
      "Names need to be unique within their scope, so two user-scope presets can't share a name.",
    ],
    editAddendum: [
      "If you rename this preset, its file is renamed automatically too.",
    ],
    title: "Name",
  },
  provider: {
    body: [
      "The provider is the service that hosts the model, like OpenAI or Anthropic.",
      "Only providers Pi knows about show up here. Switching providers refreshes the model list.",
    ],
    title: "Provider",
  },
  scope: {
    body: [
      "User presets follow you everywhere \u2014 across every project on your machine. Project presets stay tied to this project, which makes them easy to share with collaborators.",
    ],
    editAddendum: [
      "If you switch scope on an existing preset, its file moves to the new location.",
    ],
    title: "Scope",
  },
  thinking: {
    body: [
      "Thinking is how much extra reasoning effort Pi asks the model to spend. Higher levels can produce better answers but take longer and cost more.",
      "Off means no extra reasoning. Some models support fewer levels than others.",
    ],
    title: "Thinking",
  },
  tools: {
    body: [
      "Tools are the abilities Pi has during a session \u2014 things like reading files, running commands, or searching the web.",
      "Session means this preset uses whatever tools are active when you apply it.",
      "Preset means this preset always uses the specific tools you pick here, no matter what's currently active.",
    ],
    title: "Tools",
  },
};

const ALL_BUTTONS: readonly ButtonAction[] = ["save", "cancel", "test"];

/**
 * Source-of-truth row order for the editor's focus chain.
 *
 * Exported so tests can iterate every row without depending on positional
 * indices that would silently shift if the order changes here.
 */
export const EDITOR_ROWS = [
  "name",
  "scope",
  "provider",
  "model",
  "thinking",
  "tools",
  "instructions",
  "hotkey",
  "buttons",
] as const satisfies readonly EditorRowId[];

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ThinkingLevel[];
const EDITOR_LABEL_WIDTH = 15;
const EMPTY_INPUT_PLACEHOLDER = "—";

class PresetEditorComponent implements Component, Focusable {
  private actionInFlight = false;
  private readonly buttonOrder: readonly ButtonAction[];
  private buttonAction: ButtonAction = "save";
  private fieldDiagnostics: Map<EditorRowId, FieldDiagnostic> = new Map();
  private flowError: string | undefined;
  private focusedRowIndex = 0;
  private instructionsCursor = 0;
  private overlayHandle: OverlayHandle | undefined;
  private readonly nameInput = new Input();
  private readonly hotkeyInput = new Input();
  private resolved = false;
  private toolIndex = 0;
  private _focused = false;

  constructor(
    private readonly ctx: ExtensionCommandContext,
    private readonly theme: Theme,
    private readonly models: readonly ModelItem[],
    private readonly allPresets: readonly LoadedPreset[],
    private readonly allTools: readonly string[],
    private readonly initialPreset: LoadedPreset | undefined,
    private readonly options: EditorOptions,
    private readonly done: (result: EditorResult | undefined) => void,
    private readonly requestRender: () => void,
    private state: EditorFormState = initialState(
      initialPreset,
      models,
      options.pi?.getActiveTools() ?? [],
    ),
  ) {
    this.buttonOrder = options.onTest
      ? ALL_BUTTONS
      : ALL_BUTTONS.filter((button) => button !== "test");
    setInputValueCursorAtEnd(this.nameInput, this.state.name);
    setInputValueCursorAtEnd(this.hotkeyInput, this.state.hotkey);
    this.instructionsCursor = this.state.instructions.length;
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
    if (isEditorHelpKey(input)) {
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

    const row = this.currentRow();

    switch (row) {
      case "buttons":
        this.handleButtonsInput(input);

        break;
      case "hotkey":
        this.hotkeyInput.handleInput(input);
        this.state = { ...this.state, hotkey: this.hotkeyInput.getValue() };
        this.recomputeHotkeyDiagnostic();

        break;
      case "instructions":
        this.handleInstructionsInput(input);

        break;
      case "model":
        this.handleModelInput(input);

        break;
      case "name":
        this.nameInput.handleInput(input);
        this.state = { ...this.state, name: this.nameInput.getValue() };
        this.clearFieldDiagnosticsFor("name");

        break;
      case "provider":
        this.handleProviderInput(input);

        break;
      case "scope":
        this.handleScopeInput(input);

        break;
      case "thinking":
        this.handleThinkingInput(input);

        break;
      case "tools":
        this.handleToolsInput(input);

        break;
    }
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
    const entry = EDITOR_ROW_HELP[this.currentRow()];
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
    this.overlayHandle?.setHidden(true);

    try {
      return await fn();
    } finally {
      this.restoreOverlay();
    }
  }

  private restoreOverlay(): void {
    this.overlayHandle?.setHidden(false);
    this.overlayHandle?.focus();
    this.requestRender();
  }

  private currentModel(): Model<Api> | undefined {
    return this.models.find(
      (item) =>
        item.provider === this.state.provider && item.id === this.state.model,
    )?.model;
  }

  private currentRow(): EditorRowId {
    return EDITOR_ROWS[this.focusedRowIndex] ?? "name";
  }

  private activateButton(action: ButtonAction): void {
    void this.runAsync(() => this.executeButton(action));
  }

  private async executeButton(
    action: ButtonAction = this.buttonAction,
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

  private handleButtonsInput(input: string): void {
    if (matchesKey(input, Key.left)) {
      this.moveButton(-1);
    } else if (matchesKey(input, Key.right)) {
      this.moveButton(1);
    } else if (matchesKey(input, Key.enter) || input === " ") {
      this.activateButton(this.buttonAction);
    }
  }

  private handleInstructionsInput(input: string): void {
    if (matchesKey(input, Key.left)) {
      this.instructionsCursor = Math.max(0, this.instructionsCursor - 1);

      return;
    }

    if (matchesKey(input, Key.right)) {
      this.instructionsCursor = Math.min(
        this.state.instructions.length,
        this.instructionsCursor + 1,
      );

      return;
    }

    if (matchesKey(input, Key.backspace)) {
      if (this.instructionsCursor === 0) return;
      this.state = {
        ...this.state,
        instructions: `${this.state.instructions.slice(0, this.instructionsCursor - 1)}${this.state.instructions.slice(this.instructionsCursor)}`,
      };
      this.instructionsCursor--;

      return;
    }

    if (matchesKey(input, Key.enter)) {
      this.insertInstructionsText("\n");

      return;
    }

    const printable = decodeKittyPrintable(input) ?? input;

    if (isPrintableText(printable)) this.insertInstructionsText(printable);
  }

  private handleModelInput(input: string): void {
    if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

    const providerModels = this.modelsForProvider(this.state.provider);
    const currentIndex = providerModels.findIndex(
      (item) => item.id === this.state.model,
    );
    const direction = matchesKey(input, Key.right) ? 1 : -1;
    const nextIndex = wrapIndex(currentIndex, providerModels.length, direction);
    const next = providerModels[nextIndex];

    if (!next) return;

    this.state = { ...this.state, model: next.id };
    this.clearFieldDiagnosticsFor("model");
    this.snapThinkingIfInvalid();
  }

  private handleProviderInput(input: string): void {
    if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

    const providers = this.providers();
    const currentIndex = providers.indexOf(this.state.provider);
    const direction = matchesKey(input, Key.right) ? 1 : -1;
    const nextProvider =
      providers[wrapIndex(currentIndex, providers.length, direction)];

    if (!nextProvider) return;

    const nextModel = this.modelsForProvider(nextProvider)[0];

    this.state = {
      ...this.state,
      model: nextModel?.id ?? "",
      provider: nextProvider,
    };
    this.clearFieldDiagnosticsFor("provider");
    this.snapThinkingIfInvalid();
  }

  private handleScopeInput(input: string): void {
    if (
      matchesKey(input, Key.left) ||
      matchesKey(input, Key.right) ||
      input === " "
    ) {
      this.state = {
        ...this.state,
        scope: this.state.scope === "user" ? "project" : "user",
      };
      this.clearFieldDiagnosticsFor("scope");
    }
  }

  private handleThinkingInput(input: string): void {
    if (!matchesKey(input, Key.left) && !matchesKey(input, Key.right)) return;

    const valid = validThinkingLevels(this.currentModel());
    const selectable = THINKING_LEVELS.filter((level) => valid.includes(level));
    const currentIndex = selectable.indexOf(this.state.thinkingLevel);
    const direction = matchesKey(input, Key.right) ? 1 : -1;
    const next =
      selectable[wrapIndex(currentIndex, selectable.length, direction)];

    if (next) this.state = { ...this.state, thinkingLevel: next };
  }

  private handleToolsInput(input: string): void {
    if (matchesKey(input, Key.left)) {
      if (this.state.toolsMode === "preset" && this.toolIndex === 0) {
        this.state = { ...this.state, toolsMode: "session" };
      } else {
        this.toolIndex = Math.max(0, this.toolIndex - 1);
      }
    } else if (matchesKey(input, Key.right)) {
      if (this.state.toolsMode === "session") {
        this.enterPresetToolsMode();
      } else {
        this.toolIndex = Math.min(
          Math.max(0, this.allTools.length - 1),
          this.toolIndex + 1,
        );
      }
    } else if (input === " ") {
      if (this.state.toolsMode === "session") {
        this.enterPresetToolsMode();
      } else {
        this.state = { ...this.state, toolsMode: "session" };
      }
    } else if (
      matchesKey(input, Key.enter) &&
      this.state.toolsMode === "preset"
    ) {
      const tool = this.allTools[this.toolIndex];

      if (!tool) return;

      const selected = new Set(this.state.selectedTools);

      if (selected.has(tool)) {
        selected.delete(tool);
      } else {
        selected.add(tool);
      }

      this.state = { ...this.state, selectedTools: [...selected] };
    }
  }

  private enterPresetToolsMode(): void {
    const selectedTools =
      this.state.selectedTools.length > 0
        ? this.state.selectedTools
        : (this.options.pi?.getActiveTools() ?? []);

    this.state = { ...this.state, selectedTools, toolsMode: "preset" };
    this.toolIndex = 0;
  }

  private insertInstructionsText(text: string): void {
    this.state = {
      ...this.state,
      instructions: `${this.state.instructions.slice(0, this.instructionsCursor)}${text}${this.state.instructions.slice(this.instructionsCursor)}`,
    };
    this.instructionsCursor += text.length;
  }

  /**
   * Triggered after a user-driven model/provider change. If the chosen
   * level is still valid for the new model, no-op; otherwise snap to
   * `"off"`. Never called from the constructor — opening must not
   * silently mutate the form.
   */
  private snapThinkingIfInvalid(): void {
    this.state = snapThinkingSelection(this.state, this.currentModel());
  }

  private modelsForProvider(provider: string): readonly ModelItem[] {
    return this.models.filter((item) => item.provider === provider);
  }

  private moveButton(direction: -1 | 1): void {
    const currentIndex = this.buttonOrder.indexOf(this.buttonAction);
    const next =
      this.buttonOrder[
        wrapIndex(currentIndex, this.buttonOrder.length, direction)
      ];

    if (next) this.buttonAction = next;
  }

  private moveFocus(direction: -1 | 1): void {
    this.focusedRowIndex = wrapIndex(
      this.focusedRowIndex,
      EDITOR_ROWS.length,
      direction,
    );
    this.syncFocus();
  }

  private providers(): string[] {
    return [...new Set(this.models.map((item) => item.provider))];
  }

  private renderFooterHint(): string {
    const tokens = [
      "⇥/↑/↓ Move",
      "←/→ Change",
      "Space Toggle",
      "Enter Action",
      "F1 Help",
      "^S Save",
    ];

    if (this.options.onTest !== undefined) tokens.push("^T Test");

    tokens.push("Esc Cancel");

    return ` ${tokens.join(" · ")}`;
  }

  private renderRows(width: number): string[] {
    const rows = [
      ...this.renderNameRow(width),
      ...this.withFieldDiagnostic(
        renderChoiceRow(
          this.theme,
          "Scope",
          ["user", "project"],
          this.state.scope,
          this.currentRow() === "scope",
        ),
        "scope",
      ),
      ...this.withFieldDiagnostic(
        renderValueRow(
          this.theme,
          "Provider",
          this.state.provider || "none",
          this.currentRow() === "provider",
        ),
        "provider",
      ),
      ...this.withFieldDiagnostic(
        renderValueRow(
          this.theme,
          MODEL_LABEL,
          this.renderModelValue(),
          this.currentRow() === "model",
        ),
        "model",
      ),
      ...this.renderThinkingRows(),
      ...this.renderToolsRows(),
      ...this.renderInstructionsRows(width),
      ...this.renderHotkeyRow(width),
      ...this.renderMessages(),
      renderChoiceRow(
        this.theme,
        "Actions",
        this.buttonOrder.map(formatButton),
        formatButton(this.buttonAction),
        this.currentRow() === "buttons",
      ),
    ];

    return rows.map((line) => padToWidth(line, width));
  }

  private renderHotkeyRow(width: number): string[] {
    return this.renderTextInputRow(
      "Hotkey",
      "hotkey",
      this.hotkeyInput,
      this.state.hotkey,
      width,
    );
  }

  private renderNameRow(width: number): string[] {
    return this.renderTextInputRow(
      "Name",
      "name",
      this.nameInput,
      this.state.name,
      width,
    );
  }

  private renderTextInputRow(
    label: string,
    row: Extract<EditorRowId, "hotkey" | "name">,
    input: Input,
    text: string,
    width: number,
  ): string[] {
    if (this.currentRow() === row) {
      return this.withFieldDiagnostic(
        renderValueRow(
          this.theme,
          label,
          input.render(Math.max(1, width - 16))[0] ?? "",
          true,
        ),
        row,
      );
    }

    const value =
      text.length > 0 ? text : this.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER);

    return this.withFieldDiagnostic(
      renderValueRow(this.theme, label, value, false),
      row,
    );
  }

  private withFieldDiagnostic(line: string, row: EditorRowId): string[] {
    const diagnostic = this.renderFieldDiagnostic(row);

    return diagnostic ? [line, diagnostic] : [line];
  }

  private renderFieldDiagnostic(row: EditorRowId): string | undefined {
    const diagnostic = this.fieldDiagnostics.get(row);

    if (!diagnostic) return undefined;

    const color = diagnostic.severity === "warning" ? "warning" : "error";

    return this.theme.fg(color, `    ${diagnostic.message}`);
  }

  /**
   * Render the Model row's right-hand value with an availability hint
   * appended for unavailable entries. Mirrors the picker card's
   * unavailable status row in intent but stays inline to keep the
   * dropdown compact.
   */
  private renderModelValue(): string {
    if (this.state.model.length === 0) return "none";

    const item = this.models.find(
      (candidate) =>
        candidate.provider === this.state.provider &&
        candidate.id === this.state.model,
    );

    if (!item) {
      // Model id didn't resolve at all (e.g. preset references a provider
      // not present in `models.json`). Mark it so the user isn't left
      // staring at a seemingly-fine value.
      return `${this.state.model} ${this.theme.fg("dim", "(unknown)")}`;
    }

    return item.available
      ? this.state.model
      : `${this.state.model} ${this.theme.fg("dim", "(no key)")}`;
  }

  private renderThinkingRows(): string[] {
    const lines = renderThinkingRowsForState(
      this.theme,
      this.state,
      this.currentModel(),
      this.currentRow() === "thinking",
    );
    const error = this.renderFieldDiagnostic("thinking");

    return error ? [...lines, error] : lines;
  }

  private renderToolsRows(): string[] {
    // Tools-capability gating is intentionally out of scope until pi-ai exposes
    // a supports-tools flag; see gate-thinking-levels-by-model-map.

    // Labels pair with `formatToolsSummary` on the picker card so the
    // editor and card share one vocabulary:
    //   session — session tools pass through at apply time (no `tools`
    //             field is persisted).
    //   preset  — an explicit `tools: [...]` list is persisted and wins
    //             at apply time.
    const sessionMarker = this.state.toolsMode === "session" ? "●" : "○";
    const presetMarker = this.state.toolsMode === "preset" ? "●" : "○";
    const mode = `${sessionMarker} session   ${presetMarker} preset`;
    const lines = [
      renderValueRow(
        this.theme,
        TOOLS_LABEL,
        mode,
        this.currentRow() === "tools",
      ),
    ];

    if (this.state.toolsMode === "session") {
      // Explain the less-obvious mode inline; in `preset` mode the
      // multi-toggle list below speaks for itself.
      lines.push(
        this.theme.fg("dim", "    Session: inherits the active tool set."),
      );
    } else {
      if (this.allTools.length === 0) {
        lines.push(this.theme.fg("dim", "    No tools available"));

        return lines;
      }

      const selected = new Set(this.state.selectedTools);
      const renderedTools = this.allTools.map((tool, toolIndex) => {
        const marker = selected.has(tool) ? "x" : " ";
        const text = `[${marker}] ${tool}`;

        return toolIndex === this.toolIndex && this.currentRow() === "tools"
          ? this.theme.fg("accent", text)
          : text;
      });

      lines.push(`    ${renderedTools.join("  ")}`);
    }

    const error = this.renderFieldDiagnostic("tools");

    return error ? [...lines, error] : lines;
  }

  private renderInstructionsRows(width: number): string[] {
    const preview =
      this.state.instructions.length === 0
        ? this.theme.fg("dim", EMPTY_INPUT_PLACEHOLDER)
        : this.state.instructions.replaceAll("\n", " ↵ ");

    return this.withFieldDiagnostic(
      renderValueRow(
        this.theme,
        "Prompt",
        truncateToWidth(preview, Math.max(1, width - 16), "…"),
        this.currentRow() === "instructions",
      ),
      "instructions",
    );
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

  private async runAsync(fn: () => Promise<void>): Promise<void> {
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

    const loaded = (await loadAll(this.ctx)).presets.find(
      (preset) =>
        preset.name === next.name && preset.scope === this.state.scope,
    );

    const saved = loaded ?? { ...next, scope: this.state.scope };

    if (saveNeedsHotkeyReload(this.initialPreset, saved)) {
      const reloadRequested = await this.promptReloadHidden();

      this.finish({ reloadRequested, saved });

      if (reloadRequested) {
        if (this.options.onReloadRequested) {
          this.options.onReloadRequested();
        } else {
          reloadAfterOverlayClose(this.ctx);
        }
      } else {
        recordReloadPromptDeclined(saved);
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

    const active = getActive();

    if (
      active?.name !== this.initialPreset.name ||
      active.scope !== this.initialPreset.scope
    ) {
      return;
    }

    setActive({ ...active, name: next.name, scope: this.state.scope });
    this.options.pi.appendEntry("presets-plus:active", {
      name: next.name,
      scope: this.state.scope,
    });
  }

  private recomputeHotkeyDiagnostic(): void {
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
        this.initialPreset &&
        preset.name === this.initialPreset.name &&
        preset.scope === this.initialPreset.scope
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

  private clearFieldDiagnosticsFor(row: EditorRowId): void {
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
 * Pure helper: assemble a `Preset` from the form state, omitting
 * fields that should not appear in the on-disk shape (e.g. empty
 * instructions, empty hotkey, `session`-mode tools, `off` thinking).
 *
 * Exposed for tests; the editor instance calls this internally.
 */
export function buildPreset(state: EditorFormState): Preset {
  const preset: Preset = {
    model: state.model,
    name: state.name.trim(),
    provider: state.provider,
  };

  if (state.thinkingLevel !== "off") {
    preset.thinkingLevel = state.thinkingLevel;
  }

  if (state.toolsMode === "preset") {
    preset.tools = [...state.selectedTools];
  }

  const instructions = state.instructions.trim();

  if (instructions.length > 0) preset.instructions = instructions;

  const hotkey = state.hotkey.trim();

  if (hotkey.length > 0) preset.hotkey = hotkey;

  return preset;
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
  preset?: LoadedPreset,
  options: EditorOptions = {},
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
 * Exported solely to enable rendering-side regression coverage of the
 * no-notice contract without instantiating the interactive editor.
 */
export function renderThinkingRowsForState(
  theme: Pick<Theme, "fg">,
  state: EditorFormState,
  model: Model<Api> | undefined,
  focused: boolean,
): string[] {
  const valid = validThinkingLevels(model);
  // Disabled options are conveyed by dim color alone (no " disabled"
  // suffix). The disabled-state legend below the row explains the
  // convention so screen-reader users still get a hint.
  const options = THINKING_LEVELS.map((level) => {
    const label = formatThinking(level);
    const rendered = valid.includes(level) ? label : theme.fg("dim", label);

    return state.thinkingLevel === level ? `● ${rendered}` : `○ ${rendered}`;
  });
  const lines = [
    renderValueRow(theme, THINKING_LABEL, options.join("  "), focused),
  ];

  if (valid.length < THINKING_LEVELS.length) {
    // Undefined models return the full set of valid levels, so this dimmed
    // branch can only fire when the model is defined; the reasoning flag is
    // therefore the complete branch condition.
    const message =
      model?.reasoning === false
        ? "This model does not support thinking."
        : "Dimmed levels are unavailable for this model.";

    lines.push(theme.fg("dim", `    ${message}`));
  }

  return lines;
}

/**
 * Pure helper: consume the returned form state directly after a user-driven
 * model/provider change. If the selected level is still valid for the new
 * model, return the same state object as the explicit no-op signal;
 * otherwise snap the selection to `"off"`.
 */
export function snapThinkingSelection(
  state: EditorFormState,
  model: Model<Api> | undefined,
): EditorFormState {
  if (validThinkingLevels(model).includes(state.thinkingLevel)) {
    return state;
  }

  return { ...state, thinkingLevel: "off" };
}

function formatButton(action: ButtonAction): string {
  switch (action) {
    case "cancel":
      return CANCEL_LABEL;
    case "save":
      return SAVE_LABEL;
    case "test":
      return TEST_LABEL;
  }
}

function formatThinking(level: ThinkingLevel): string {
  return level;
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

function isEditorHelpKey(input: string): boolean {
  if (matchesKey(input, Key.f1)) return true;

  // pi-tui's matchesKey for F-keys checks only the legacy table
  // (\x1bOP, \x1b[11~, \x1b[[A) and never falls through to the Kitty
  // matcher, so when pi-tui auto-enables Kitty's enhanced keyboard
  // protocol (terminal.js sends \x1b[>7u after the handshake) F1 in
  // its Kitty-protocol forms is silently dropped. Two such forms exist:
  //
  // 1. Legacy-with-event-info (observed in Ghostty: F1 press arrived as
  //    `\x1b[1;1:1P`, release as `\x1b[1;1:3P`):
  //      CSI 1 ; <mod> : <event> P
  //    Final byte is the legacy SS3 letter (P for F1). The `:event`
  //    subfield is added when the event-types flag is pushed.
  //
  // 2. Codepoint form (per the Kitty keyboard-protocol spec):
  //      CSI 57364 ; <mod> : <event> u
  //    Final byte is `u`; codepoint 57364 = F1, 57365 = F2, etc.
  //
  // Empirical evidence: a temporary `appendFileSync` instrumentation in
  // `handleInput` recorded what each terminal actually sends inside pi.
  // iTerm2 sent `\x1b[11~` (already covered by the legacy `Key.f1`
  // table); Ghostty sent the legacy-with-event-info `\x1b[1;1:1P`
  // variant; kitty/WezTerm/recent Alacritty are expected to use either
  // form. The six fallbacks below cover both encodings with and without
  // the modifier and event subfields.
  //
  // We match only press events (event subfield 1, or omitted). pi-tui's
  // isKeyRelease does not recognize `:3P` either, so F1 release leaks
  // through to the focused component; matching only press here means
  // the release falls through to row delegation and is harmlessly
  // ignored.
  //
  // Re-audit when pi-tui's matchesKey and isKeyRelease grow F-key
  // Kitty support; this workaround can then go away.
  return (
    input === "\x1b[1P" ||
    input === "\x1b[1;1P" ||
    input === "\x1b[1;1:1P" ||
    input === "\x1b[57364u" ||
    input === "\x1b[57364;1u" ||
    input === "\x1b[57364;1:1u"
  );
}

function isPrintableText(text: string): boolean {
  if (text.length === 0) return false;

  return [...text].every((char) => {
    const code = char.charCodeAt(0);

    return code >= 32 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f);
  });
}

function renderChoiceRow(
  theme: Theme,
  label: string,
  options: readonly string[],
  selected: string,
  focused: boolean,
): string {
  const rendered = options
    .map((option) => (option === selected ? `● ${option}` : `○ ${option}`))
    .join("  ");

  return renderValueRow(theme, label, rendered, focused);
}

function renderValueRow(
  theme: Pick<Theme, "fg">,
  label: string,
  value: string,
  focused: boolean,
): string {
  const marker = focused ? theme.fg("accent", "▌") : " ";
  const paddedLabel = `${label}${" ".repeat(Math.max(0, EDITOR_LABEL_WIDTH - label.length))}`;
  const labelText = theme.fg("muted", paddedLabel);
  const renderedValue = focused ? theme.fg("accent", value) : value;

  return `${marker} ${labelText}${renderedValue}`;
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

function wrapIndex(
  currentIndex: number,
  length: number,
  direction: -1 | 1,
): number {
  if (length <= 0) return 0;

  return (((currentIndex + direction) % length) + length) % length;
}
