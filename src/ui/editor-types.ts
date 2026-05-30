/**
 * Shared editor types.
 *
 * Owns the union of row ids, form-state shape, and per-row vocabulary
 * (`EditorRowHelpEntry`, `FieldDiagnostic`) used by both the editor
 * entry point and its per-row modules. It does NOT own any editor
 * behavior, row implementations, or rendering primitives.
 *
 * Separated from `editor.ts` so the row modules can import these types
 * without pulling in the editor component itself (and the import cycle
 * it would create).
 */
import type { PresetScope, ThinkingLevel } from "../types.js";
import type { Api, Model } from "@earendil-works/pi-ai";

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

export interface EditorRowHelpEntry {
  readonly body: readonly string[];
  /**
   * Extra paragraphs shown only when the editor is opened for an
   * existing preset. Lets us mention edit-only consequences (rename
   * moves the file, scope-change moves the file) without cluttering
   * the new-preset experience.
   */
  readonly editAddendum?: readonly string[];
  readonly title: string;
}

export interface FieldDiagnostic {
  message: string;
  severity: "error" | "warning";
}

export interface ModelItem {
  /**
   * True when the model has a resolvable API key / auth configured.
   * Unavailable models are still surfaced in the editor (so users
   * editing a preset whose key was rotated away can still see and
   * re-select their model) but are rendered with a dim `(no key)`
   * suffix.
   */
  readonly available: boolean;
  readonly id: string;
  readonly model: Model<Api>;
  readonly provider: string;
}

export type ButtonAction = "cancel" | "save" | "test";

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

export type ToolsMode = "preset" | "session";

/**
 * Source-of-truth row order for the editor's focus chain.
 *
 * Exported so tests can iterate every row without depending on
 * positional indices that would silently shift if the order changes
 * here.
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
