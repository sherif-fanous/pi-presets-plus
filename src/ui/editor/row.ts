/**
 * The two contracts that join the editor to its rows: what each row
 * implements and what the editor exposes to the rows in return.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import type {
  EditorFormState,
  EditorRowHelpEntry,
  EditorRowId,
  FieldDiagnostic,
  ModelItem,
} from "../editor-types.js";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Input } from "@earendil-works/pi-tui";

/**
 * One editor row: its help content, its keyboard handling, and its
 * rendered lines.
 */
export interface EditorRow {
  readonly id: EditorRowId;
  readonly help: EditorRowHelpEntry;
  handleInput(input: string): void;
  renderLines(width: number): string[];
}

/**
 * The editor surface rows read and act on: shared context, form state,
 * diagnostics, and the helpers for actions a row triggers. Per-row cursor
 * state stays inside the row's own closure.
 */
export interface EditorRowHost {
  readonly ctx: ExtensionCommandContext;
  readonly theme: Pick<Theme, "fg" | "bold">;
  readonly models: readonly ModelItem[];
  readonly allTools: readonly string[];
  readonly nameInput: Input;
  readonly hotkeyInput: Input;
  readonly session: ActivePresetSession;
  /**
   * The tools that were active when the editor opened, captured once so
   * the tools row pre-fills the same set every time.
   */
  readonly initialActiveTools: readonly string[];
  /** True when the caller wired a Test callback. */
  readonly canTest: boolean;

  getState(): EditorFormState;
  setState(state: EditorFormState): void;
  currentRow(): EditorRowId;

  getFieldDiagnostic(row: EditorRowId): FieldDiagnostic | undefined;
  clearFieldDiagnosticsFor(row: EditorRowId): void;

  modelsForProvider(provider: string): readonly ModelItem[];
  providers(): readonly string[];
  currentModel(): Model<Api> | undefined;

  /** Run the Save, Cancel, or Test action. */
  activateButton(action: "cancel" | "save" | "test"): void;
  /** Run an async row action, ignoring further input until it settles. */
  runAsync(fn: () => Promise<void>): Promise<void>;
  /** Open the multi-line prompt editor for the instructions row. */
  openPromptEditor(): Promise<void>;
  /** Recompute the hotkey row's diagnostic after the user types. */
  recomputeHotkeyDiagnostic(): void;

  /** The pi API the tools row reads, absent in headless tests. */
  readonly pi: Pick<ExtensionAPI, "getActiveTools"> | undefined;
}
