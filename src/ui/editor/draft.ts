/**
 * Pure preset-editor draft transitions and persistence projection.
 *
 * Owns form initialization, coupled provider/model/thinking changes, tool
 * selection changes, and conversion to a persisted preset. It does NOT own
 * input handling, rendering, validation diagnostics, dialogs, or I/O.
 */
import { validThinkingLevels } from "../../activation/thinking.js";
import { toPersistedPreset } from "../../store/api.js";
import type { LoadedPreset, Preset } from "../../types.js";
import type { EditorFormState, ModelItem, ToolsMode } from "../editor-types.js";
import type { Api, Model } from "@earendil-works/pi-ai";

/** Convert a draft to the canonical persisted preset shape. */
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

/** Build the initial draft for a new or existing preset. */
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

/** Select a model and repair the current thinking selection if needed. */
export function selectModel(
  state: EditorFormState,
  model: ModelItem,
): EditorFormState {
  return snapThinkingSelection({ ...state, model: model.id }, model.model);
}

/** Select a provider and its first model, repairing thinking if needed. */
export function selectProvider(
  state: EditorFormState,
  provider: string,
  models: readonly ModelItem[],
): EditorFormState {
  const model = models.find((item) => item.provider === provider);

  return snapThinkingSelection(
    { ...state, model: model?.id ?? "", provider },
    model?.model,
  );
}

/** Enter or leave preset-controlled tools mode. */
export function selectToolsMode(
  state: EditorFormState,
  toolsMode: ToolsMode,
  initialActiveTools: readonly string[],
): EditorFormState {
  if (toolsMode === "session") return { ...state, toolsMode };

  const selectedTools =
    state.selectedTools.length > 0 ? state.selectedTools : initialActiveTools;

  return {
    ...state,
    selectedTools: [...selectedTools],
    toolsMode,
  };
}

/** Repair thinking after a user-driven provider or model change. */
export function snapThinkingSelection(
  state: EditorFormState,
  model: Model<Api> | undefined,
): EditorFormState {
  if (validThinkingLevels(model).includes(state.thinkingLevel)) return state;

  return { ...state, thinkingLevel: "off" };
}

/** Toggle one tool while preserving the selection order. */
export function toggleSelectedTool(
  state: EditorFormState,
  tool: string,
): EditorFormState {
  const selectedTools = new Set(state.selectedTools);

  if (selectedTools.has(tool)) {
    selectedTools.delete(tool);
  } else {
    selectedTools.add(tool);
  }

  return { ...state, selectedTools: [...selectedTools] };
}
