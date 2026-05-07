/**
 * Canonical user-facing label vocabulary.
 *
 * Owns repeated field labels, action labels, and dialog titles shared across
 * surfaces; it does NOT compose full prose messages or own rendering layout.
 */

// Field labels shared by status, clear, editor rows, and picker cards.
export const MODEL_LABEL = "Model";
export const THINKING_LABEL = "Thinking level";
export const TOOLS_LABEL = "Tools";
export const PRESET_LABEL = "Preset";
export const SCOPE_LABEL = "Scope";
export const STATUS_LABEL = "Status";

// Per-surface composed labels used by status and related summaries.
export const BASELINE_MODEL_LABEL = "Baseline model";
export const BASELINE_THINKING_LABEL = "Baseline thinking level";
export const BASELINE_TOOLS_LABEL = "Baseline tools";
export const PRESET_MODEL_LABEL = "Preset model";
export const PRESET_THINKING_LABEL = "Preset thinking level";
export const PRESET_TOOLS_LABEL = "Preset tools";
export const CURRENT_MODEL_LABEL = "Current model";
export const CURRENT_THINKING_LABEL = "Current thinking level";
export const CURRENT_TOOLS_LABEL = "Current tools";
export const RESTORE_LABEL = "Restore";

// Dialog titles shared by overlays and formatter headings.
export const STATUS_DIALOG_TITLE = "Preset Status";
export const CLEAR_DIALOG_TITLE = "Preset cleared";
export const ACTIVATION_FAILED_TITLE = "Activation failed";
export const RELOAD_PROMPT_TITLE = "Reload Pi?";
export const MOVE_PRESET_TITLE = "Move preset?";
export const HOTKEY_SHADOWS_TITLE = "Hotkey shadows pi";
export const HOTKEY_CONFLICT_TITLE = "Hotkey conflict";

// Action labels, including single-use footer labels kept here for auditability.
export const ACTIVATE_LABEL = "Activate";
export const FILTER_LABEL = "Filter";
export const STATUS_ACTION_LABEL = "Status";
export const QUIT_LABEL = "Quit";
export const NEW_LABEL = "New";
export const EDIT_LABEL = "Edit";
export const DUPLICATE_LABEL = "Duplicate";
export const DELETE_LABEL = "Delete";
export const CLEAR_LABEL = "Clear";
export const REORDER_LABEL = "Reorder";
export const CLOSE_LABEL = "Close";
export const LIST_LABEL = "List";
export const CURSOR_LABEL = "Cursor";
export const MOVE_LABEL = "Move";
export const SAVE_LABEL = "Save";
export const CANCEL_LABEL = "Cancel";
export const TEST_LABEL = "Test (apply temporarily)";
