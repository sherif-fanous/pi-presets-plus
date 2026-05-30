/**
 * Editor row contracts.
 *
 * Owns the `EditorRow` interface that each row module satisfies and the
 * `EditorRowHost` surface those modules consume. It does NOT own row
 * implementations, shared render primitives, or any specific row's
 * behavior; that lives in `rows/<id>.ts` and `row-render.ts`.
 *
 * Centralizing the contracts lets the editor entry point compose row
 * factories without each module having to know how the editor
 * stitches them together.
 */
import type { ActivePresetSession } from "../../activation/session.js";
import type { LoadedPreset } from "../../types.js";
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
 * Behavior + presentation contract for one editor row.
 *
 * Each row module's factory builds and returns an entry; the editor
 * stores them keyed by id and consumes them from input dispatch, help
 * lookup, and the render sequence.
 */
export interface EditorRow {
  readonly id: EditorRowId;
  readonly help: EditorRowHelpEntry;
  handleInput(input: string): void;
  renderLines(width: number): string[];
}

/**
 * Surface the editor exposes to its row modules.
 *
 * Each member is something at least one row genuinely needs: read-only
 * context (theme, models, inputs), form-state get/set, diagnostic
 * access, and side-effect helpers for the rows that open nested
 * dialogs or trigger save/test actions. Mutable per-row state (e.g.
 * the current tool cursor or button selection) stays inside the
 * owning row's closure.
 */
export interface EditorRowHost {
  readonly ctx: ExtensionCommandContext;
  readonly theme: Pick<Theme, "fg" | "bold">;
  readonly models: readonly ModelItem[];
  readonly allTools: readonly string[];
  readonly initialPreset: LoadedPreset | undefined;
  readonly nameInput: Input;
  readonly hotkeyInput: Input;
  readonly session: ActivePresetSession;
  /**
   * `pi.getActiveTools()` at the time the editor opened. Captured up
   * front so the tools row's "session" mode pre-fill is stable.
   */
  readonly initialActiveTools: readonly string[];
  /** Set when the editor was opened with a `Test` callback wired. */
  readonly canTest: boolean;

  getState(): EditorFormState;
  setState(state: EditorFormState): void;
  currentRow(): EditorRowId;

  getFieldDiagnostic(row: EditorRowId): FieldDiagnostic | undefined;
  clearFieldDiagnosticsFor(row: EditorRowId): void;

  modelsForProvider(provider: string): readonly ModelItem[];
  providers(): readonly string[];
  currentModel(): Model<Api> | undefined;

  /** Activate a row-level button (Save / Cancel / Test). */
  activateButton(action: "cancel" | "save" | "test"): void;
  /** Run an async row action, gating new input until it resolves. */
  runAsync(fn: () => Promise<void>): Promise<void>;
  /** Open the multi-line prompt editor for the instructions row. */
  openPromptEditor(): Promise<void>;
  /** Recompute the hotkey-row diagnostic after user-typed input. */
  recomputeHotkeyDiagnostic(): void;
  /** Snap the thinking selection if the model change made it invalid. */
  snapThinkingIfInvalid(): void;

  /** Subset of the pi API the tools row consumes; undefined in headless tests. */
  readonly pi: Pick<ExtensionAPI, "getActiveTools"> | undefined;
}
