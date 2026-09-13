/**
 * Type definitions shared across pi-presets-plus: the persisted preset
 * shapes, the scope and loader output types, the activation state, and the
 * thinking levels a preset may record.
 */

/** A parsed version 2 configuration document, including unknown fields. */
export interface ConfigDocument {
  version: 2;
  showInactiveStatus?: boolean;
  presets?: unknown[];
  policy?: unknown;
  [key: string]: unknown;
}

/**
 * A preset carrying the merge and availability metadata computed at load
 * time. Those annotations can change on every reload, so callers must not
 * assume they survive a `ctx.reload()`.
 */
export interface LoadedPreset extends Preset {
  /** Scope of the file this preset was read from. */
  scope: PresetScope;
  /**
   * `true` for a global preset whose name is also defined in the project
   * file (the project entry wins at activation time).
   */
  shadowed?: boolean;
  /**
   * Reason the preset cannot be activated. `"no-model"` means the model id
   * is not registered for the named provider, `"no-key"` means the model is
   * registered but its provider has no API key. Undefined when the preset
   * is available.
   */
  unavailable?: "no-key" | "no-model";
  /**
   * True when the preset asks for extended thinking on a model that clamps
   * it to off at activation time.
   */
  clampWarning?: true;
  /** True when another preset claimed this preset's hotkey first. */
  hotkeyConflict?: true | undefined;
  /** True when the parsed hotkey matches a Pi built-in keybinding. */
  hotkeyShadowsBuiltin?: true | undefined;
}

/**
 * A preset definition as it appears in either scope's JSON file.
 *
 * `name`, `provider`, and `model` are required. Storage validates the
 * shape of the optional fields and round-trips them verbatim.
 */
export interface Preset {
  /** Unique within a single file; merge-time shadowing is by name. */
  name: string;
  /** Provider id (e.g. `"anthropic"`, `"openai"`). */
  provider: string;
  /** Model id within `provider` (e.g. `"claude-opus-4.5"`). */
  model: string;
  /** Reasoning level to apply. Activation falls back to `"off"`. */
  thinkingLevel?: ThinkingLevel;
  /**
   * Tools to activate. Omitting the field or leaving it empty passes the
   * session tools through unchanged.
   */
  tools?: string[];
  /** Free-form text appended to the system prompt at apply time. */
  instructions?: string;
  /** Key combination that activates the preset, such as `ctrl+shift+1`. */
  hotkey?: string;
  /** Ordering value round-tripped by storage; the file order is the default. */
  order?: number;
}

/**
 * Snapshot of the preset fields that drift detection compares against.
 *
 * Cached on `ActivePresetState` when a preset is applied or restored so
 * per-turn drift detection never re-reads the preset files from disk.
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

/** Result of loading one consolidated configuration scope. */
export interface ScopeConfig {
  readonly document: ConfigDocument;
  readonly presets: Preset[];
  readonly showInactiveStatus?: boolean;
  readonly warnings: ScopeWarnings;
}

/** Warnings grouped by the configuration section that produced them. */
export interface ScopeWarnings {
  readonly file: string[];
  readonly settings: string[];
  readonly presets: string[];
  readonly policy: string[];
}

/**
 * In-memory state for the preset applied to the current session.
 *
 * The `"baseline"` restore kind carries everything `/presets clear` needs
 * to put Pi back the way it was; `"unknown"` means no baseline was
 * captured and clearing can only turn the preset off.
 */
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
 * Origin scope for a loaded preset. `"user"` is the global file under
 * `<agent-dir>/presets-plus/config.json`, and `"project"` is the per-cwd file
 * under `<cwd>/.pi/presets-plus/config.json`.
 */
export type PresetScope = "user" | "project";

/**
 * Every reasoning level a preset may declare.
 *
 * Mirrors the levels pi-coding-agent's `getThinkingLevel()` and
 * `setThinkingLevel()` accept, which extend `pi-ai`'s set with `"off"`.
 * Storage accepts all of them; activation checks the model's capabilities
 * before writing a level to Pi.
 */
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

/** Reasoning level recorded on a preset. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

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
