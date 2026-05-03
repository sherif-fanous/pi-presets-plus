/**
 * Preset apply flow.
 *
 * Owns the end-to-end activation of a preset: writing model, thinking, and
 * tool state, recording the baseline overlay, persisting activation, and
 * refreshing status. It does NOT own command lookup, session restore, or
 * picker UI.
 */
import { ACTIVATED_MESSAGE_TYPE } from "../messages.js";
import type { LoadedPreset } from "../types.js";
import { updateStatus } from "../ui/status.js";
import { getActive, setActive } from "./active-state.js";
import { captureBaseline } from "./baseline.js";
import { stateMatches } from "./state-matches.js";
import { effectiveThinkingLevel } from "./thinking.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

let selfTriggeredModelSet = false;

export async function apply(
  preset: LoadedPreset,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<{ ok: boolean }> {
  if (preset.unavailable) {
    ctx.ui.notify(
      `preset "${preset.name}" is unavailable (${preset.unavailable}). activation skipped.`,
      "error",
    );

    return { ok: false };
  }

  const current = getActive();

  if (
    current?.name === preset.name &&
    current.scope === preset.scope &&
    current.restore.kind === "baseline" &&
    stateMatches(preset, pi, ctx)
  ) {
    return { ok: true };
  }

  const model = ctx.modelRegistry.find(preset.provider, preset.model);

  if (!model) {
    ctx.ui.notify(
      `preset "${preset.name}" references unknown model ${preset.provider}/${preset.model}.`,
      "error",
    );

    return { ok: false };
  }

  const previousBaseline =
    current?.restore.kind === "baseline" ? current.restore : undefined;
  const baseline = previousBaseline?.baseline ?? captureBaseline(pi, ctx);
  const applyCount = (previousBaseline?.applyCount ?? 0) + 1;
  const previousAppliedTools = previousBaseline?.lastApplied.tools;
  const previousOwnedTools = previousBaseline?.owned.tools ?? false;

  if (!(await setModelGuarded(pi, ctx, preset.provider, preset.model))) {
    return { ok: false };
  }

  const effective = effectiveThinkingLevel(preset, model);
  const declared = preset.thinkingLevel ?? "off";

  pi.setThinkingLevel(effective);

  if (effective !== declared) {
    ctx.ui.notify(
      `preset "${preset.name}" requested thinking:${declared} for ${preset.provider}/${preset.model}. applied "${effective}" instead.`,
      "info",
    );
  }

  let appliedTools = previousAppliedTools;
  let ownedTools = previousOwnedTools;

  if (preset.tools && preset.tools.length > 0) {
    const validTools = filterValidTools(preset.tools, pi.getAllTools());
    const dropped = preset.tools.filter(
      (toolName) => !validTools.includes(toolName),
    );

    if (dropped.length > 0) {
      ctx.ui.notify(
        `preset "${preset.name}" references unknown tools: ${dropped.join(", ")}. they were ignored.`,
        "warning",
      );
    }

    pi.setActiveTools(validTools);
    appliedTools = validTools;
    ownedTools = true;
  }

  setActive({
    name: preset.name,
    restore: {
      applyCount,
      baseline,
      kind: "baseline",
      lastApplied: {
        ...(appliedTools !== undefined ? { tools: appliedTools } : {}),
        model: { id: preset.model, provider: preset.provider },
        thinkingLevel: effective,
      },
      owned: { model: true, thinkingLevel: true, tools: ownedTools },
    },
    scope: preset.scope,
  });

  pi.appendEntry("presets-plus:active", {
    name: preset.name,
    scope: preset.scope,
  });

  pi.sendMessage({
    customType: ACTIVATED_MESSAGE_TYPE,
    content: `Preset ${preset.name} applied`,
    display: true,
    details: {
      name: preset.name,
      model: `${preset.provider}/${preset.model}`,
      thinkingLevel: effective,
    },
  });

  updateStatus(ctx, getActive(), (name, scope) =>
    name === preset.name && scope === preset.scope ? preset : undefined,
  );

  return { ok: true };
}

export function isSelfTriggeredModelSet(): boolean {
  return selfTriggeredModelSet;
}

/**
 * Run `fn` with the self-call flag raised so a `model_select` event triggered
 * by `pi.setModel` inside `fn` is recognized as our own write and ignored by
 * the drift-detection handler.
 */
export async function withSelfTriggeredModelSet<T>(
  fn: () => Promise<T>,
): Promise<T> {
  selfTriggeredModelSet = true;

  try {
    return await fn();
  } finally {
    selfTriggeredModelSet = false;
  }
}

function filterValidTools(
  desired: readonly string[],
  allTools: readonly { name: string }[],
): string[] {
  const available = new Set(allTools.map((tool) => tool.name));

  return desired.filter((toolName) => available.has(toolName));
}

async function setModelGuarded(
  pi: Pick<ExtensionAPI, "setModel">,
  ctx: Pick<ExtensionCommandContext, "modelRegistry" | "ui">,
  provider: string,
  modelId: string,
): Promise<boolean> {
  const model = ctx.modelRegistry.find(provider, modelId);

  if (!model) {
    ctx.ui.notify(`model not found: ${provider}/${modelId}`, "error");

    return false;
  }

  const success = await withSelfTriggeredModelSet(() => pi.setModel(model));

  if (!success) {
    ctx.ui.notify(`no api key configured for ${provider}/${modelId}.`, "error");
  }

  return success;
}
