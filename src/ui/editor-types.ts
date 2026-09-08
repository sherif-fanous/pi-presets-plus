/**
 * Types the preset editor and its row modules share: the row ids, the
 * form-state shape, and the per-row help and diagnostic vocabulary.
 */
import type { PresetScope, ThinkingLevel } from "../types.js";
import type { Api, Model } from "@earendil-works/pi-ai";

/** Every value the editor form holds while a preset is being edited. */
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

/** Help dialog content for one editor row. */
export interface EditorRowHelpEntry {
  readonly body: readonly string[];
  /**
   * Extra paragraphs shown only when the editor was opened on an existing
   * preset, for consequences such as a rename or scope change moving the
   * file.
   */
  readonly editAddendum?: readonly string[];
  readonly title: string;
}

/** A validation message rendered under the row it belongs to. */
export interface FieldDiagnostic {
  message: string;
  severity: "error" | "warning";
}

/** One model offered by the editor's provider and model rows. */
export interface ModelItem {
  /**
   * True when the model has auth configured. Models without it stay in the
   * list, dimmed with a `(no key)` suffix, so a preset whose key was
   * rotated away can still be repaired.
   */
  readonly available: boolean;
  readonly id: string;
  readonly model: Model<Api>;
  readonly provider: string;
}

/** Action behind one of the editor's buttons. */
export type ButtonAction = "cancel" | "save" | "test";

/** Identifier for one row of the editor form. */
export type EditorRowId =
  | "buttons"
  | "hotkey"
  | "instructions"
  | "model"
  | "name"
  | "provider"
  | "scope"
  | "thinking"
  | "tools";

/** Whether a preset pins its own tool list or inherits the session's. */
export type ToolsMode = "preset" | "session";

/** Order the editor renders its rows in and cycles focus through. */
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
