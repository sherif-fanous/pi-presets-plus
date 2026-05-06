/**
 * Shared type definitions for pi-presets-plus.
 *
 * Owns the persistent preset shapes (`Preset`, `PresetsFile`), scope and
 * loader output types (`PresetScope`, `LoadedPreset`), the activation
 * state shape, and a local `ThinkingLevel` that extends `pi-ai`'s level
 * set with the explicit `"off"` value used by pi.
 */

/**
 * A preset enriched with merge/availability metadata.
 *
 * Returned by the storage merge step (`mergeScopes`). `shadowed` and
 * `unavailable` are computed at load time and may change across reloads;
 * callers must not assume they survive a `ctx.reload()`.
 */
export interface LoadedPreset extends Preset {
  /** Origin file's scope; assigned by the loader. */
  scope: PresetScope;
  /**
   * `true` for a global preset whose name is also defined in the project
   * file (the project entry wins at activation time).
   */
  shadowed?: boolean;
  /**
   * Reason the preset cannot be activated, computed at load time:
   * - `"no-model"` — model id not registered for the named provider
   * - `"no-key"`   — model is registered but its provider has no API key
   *
   * Undefined when the preset is fully available.
   */
  unavailable?: "no-key" | "no-model";
  /**
   * True when the preset requests extended thinking for a model that will
   * clamp it to off at activation time. Computed in memory; never persisted.
   */
  clampWarning?: true;
  /** True when another preset claimed this preset's hotkey first. */
  hotkeyConflict?: true | undefined;
}

/**
 * A preset definition as it appears in either scope's JSON file.
 *
 * Required fields: `name`, `provider`, `model`. All other fields are
 * optional and accepted by the loader unchanged; behavior that consumes
 * them (instructions injection, hotkey binding, ordering) lands in later
 * changes. Storage validates the shape and round-trips unknown-but-typed
 * fields verbatim.
 */
export interface Preset {
  /** Unique within a single file; merge-time shadowing is by name. */
  name: string;
  /** Provider id (e.g. `"anthropic"`, `"openai"`). */
  provider: string;
  /** Model id within `provider` (e.g. `"claude-opus-4.5"`). */
  model: string;
  /** Reasoning level. Defaults to `"off"` at apply time (later change). */
  thinkingLevel?: ThinkingLevel;
  /** Active tools at apply time. Omit / empty = session tools pass through unchanged. */
  tools?: string[];
  /** Free-form text appended to the system prompt at apply time. */
  instructions?: string;
  /** Hotkey id; honored by a later change. */
  hotkey?: string;
  /** User-controlled cycle order; default = file order. */
  order?: number;
}

/**
 * In-memory snapshot of the preset fields drift detection compares against.
 *
 * Cached on `ActivePresetState` at apply / restore time so per-turn drift
 * detection never has to re-read the on-disk preset files. Refreshed on
 * apply, on session restore, and on `/presets reload` (via re-apply) — never
 * on `turn_start` or `model_select`.
 */
export interface PresetDriftSnapshot {
  provider: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
  tools?: readonly string[];
}

/** Baseline Pi state captured before a preset overlay starts. */
export interface PresetOverlayBaseline {
  model: { provider: string; id: string } | null;
  thinkingLevel: ThinkingLevel;
  tools: string[];
}

/**
 * On-disk JSON shape for a single preset file (either scope).
 *
 * `version: 1` is the current schema version. Files declaring a different
 * version are treated as empty + warned by the loader (and never rewritten),
 * leaving room for forward-compatible schema evolution.
 */
export interface PresetsFile {
  version: 1;
  presets: Preset[];
}

/** In-memory active-preset state for change `add-preset-activation`. */
export type ActivePresetState =
  | {
      name: string;
      scope: PresetScope;
      restore: {
        kind: "baseline";
        baseline: PresetOverlayBaseline;
        lastApplied: LastAppliedPresetEffects;
        owned: PresetOverlayOwnership;
        applyCount: number;
      };
      dirty: boolean;
      declared: PresetDriftSnapshot;
    }
  | {
      name: string;
      scope: PresetScope;
      restore: { kind: "unknown" };
      dirty: boolean;
      declared: PresetDriftSnapshot;
    };

/**
 * Origin scope for a loaded preset.
 *
 * - `"user"` — the global file under `<agent-dir>/presets-plus/presets.json`
 * - `"project"` — the per-cwd file under `<cwd>/.pi/presets-plus/presets.json`
 */
export type PresetScope = "user" | "project";

/**
 * Reasoning level recorded on a preset.
 *
 * Mirrors pi-coding-agent's `getThinkingLevel()` / `setThinkingLevel()` API,
 * which extends `pi-ai`'s `ThinkingLevel` with the explicit `"off"` value.
 * Storage accepts the literal set verbatim; per-model clamping happens at
 * activation time in a later change.
 */
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** Last values written by presets-plus inside the active overlay. */
interface LastAppliedPresetEffects {
  model: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  tools?: string[];
}

/** Tracks which Pi channels are owned by the active preset overlay. */
interface PresetOverlayOwnership {
  model: true;
  thinkingLevel: true;
  tools: boolean;
}
