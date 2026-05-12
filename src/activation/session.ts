/**
 * Active-preset session attachment for pi-presets-plus.
 *
 * Owns the in-memory active-preset cell, session-entry persistence, status
 * badge refresh, dirty transitions, restore reconstruction, and self-trigger
 * guards. It does NOT own apply/clear decisions, storage loading, or picker UI.
 */
import { findPreset } from "../preset-identity.js";
import type {
  ActivePresetState,
  LoadedPreset,
  PresetOverlayBaseline,
} from "../types.js";
import { renderStatusBadge, STATUS_KEY } from "../ui/status.js";
import { snapshotPresetForDrift } from "./drift.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export interface ActivePresetStartOptions {
  readonly baseline: PresetOverlayBaseline;
  readonly lastApplied: Extract<
    ActivePresetState,
    { restore: { kind: "baseline" } }
  >["restore"]["lastApplied"];
  readonly owned: Extract<
    ActivePresetState,
    { restore: { kind: "baseline" } }
  >["restore"]["owned"];
  readonly applyCount: number;
  readonly preset: LoadedPreset;
}

type ActiveEntryData =
  | { readonly name: string; readonly scope?: LoadedPreset["scope"] }
  | { readonly name: null };

type Branch = ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
type SessionContext = Pick<ExtensionContext, "ui">;
type SessionPi = Pick<ExtensionAPI, "appendEntry">;

/** Owns mutable active-preset state for one extension invocation. */
export class ActivePresetSession {
  private active: ActivePresetState | undefined;
  private selfTriggeredModelSetDepth = 0;

  /** Return the current active-preset attachment, if any. */
  current(): ActivePresetState | undefined {
    return this.active;
  }

  /**
   * Refresh the status badge from the current active state.
   *
   * Public so the session-start orchestrator can guarantee the badge is
   * accurate after restoreFromBranch + flag application complete, even
   * when those branches did not themselves take a code path that sets
   * status (e.g. "no entry" or "unavailable" branches of restore).
   */
  refreshStatus(ctx: SessionContext): void {
    this.setStatus(ctx);
  }

  /** Start tracking a freshly-applied preset and persist its session marker. */
  start(
    options: ActivePresetStartOptions,
    ctx: SessionContext,
    pi: SessionPi,
  ): void {
    const { applyCount, baseline, lastApplied, owned, preset } = options;

    this.active = {
      declared: snapshotPresetForDrift({ ...preset, tools: lastApplied.tools }),
      dirty: false,
      name: preset.name,
      restore: {
        applyCount,
        baseline,
        kind: "baseline",
        lastApplied,
        owned,
      },
      scope: preset.scope,
    };

    pi.appendEntry("presets-plus:active", {
      name: preset.name,
      scope: preset.scope,
    });
    this.setStatus(ctx);
  }

  /**
   * Update the active preset identity after an editor rename or scope move.
   *
   * Refreshes the status badge so the footer shows the new name immediately;
   * a missing refresh here was a pre-existing bug surfaced during the session
   * refactor.
   */
  updateIdentity(
    name: string,
    scope: LoadedPreset["scope"],
    ctx: SessionContext,
    pi: SessionPi,
  ): void {
    if (!this.active) return;

    this.active = { ...this.active, name, scope };
    pi.appendEntry("presets-plus:active", { name, scope });
    this.setStatus(ctx);
  }

  /** Clear the active-preset attachment and persist the clear marker. */
  clear(ctx: SessionContext, pi: SessionPi): void {
    this.active = undefined;
    pi.appendEntry("presets-plus:active", { name: null });
    this.setStatus(ctx);
  }

  /** Mark the active preset clean, preserving its restore discriminator. */
  markClean(ctx: SessionContext): void {
    if (!this.active?.dirty) return;

    this.active = { ...this.active, dirty: false };
    this.setStatus(ctx);
  }

  /** Mark the active preset dirty, preserving its restore discriminator. */
  markDirty(ctx: SessionContext): void {
    if (!this.active || this.active.dirty) return;

    this.active = { ...this.active, dirty: true };
    this.setStatus(ctx);
  }

  /** Restore active-preset state from a persisted session branch. */
  restoreFromBranch(
    branch: Branch,
    presets: readonly LoadedPreset[],
    ctx: SessionContext,
  ): { state: ActivePresetState | undefined; warnings: string[] } {
    const result = this.computeRestore(branch, presets);

    this.active = result.state;
    this.setStatus(ctx);

    return result;
  }

  private computeRestore(
    branch: Branch,
    presets: readonly LoadedPreset[],
  ): { state: ActivePresetState | undefined; warnings: string[] } {
    const activeEntry = [...branch]
      .reverse()
      .find(
        (entry): entry is Extract<typeof entry, { type: "custom" }> =>
          entry.type === "custom" && entry.customType === "presets-plus:active",
      );

    if (!activeEntry) {
      return { state: undefined, warnings: [] };
    }

    const data = activeEntry.data as ActiveEntryData | undefined;

    if (!data || data.name === null) {
      return { state: undefined, warnings: [] };
    }

    const preset = findPreset(presets, {
      name: data.name,
      scope: data.scope ?? "user",
    });

    if (!preset) {
      return {
        state: undefined,
        warnings: [
          `Restored session referenced preset "${data.name}" which is not loaded. Not attaching.`,
        ],
      };
    }

    if (preset.unavailable) {
      return {
        state: undefined,
        warnings: [
          `Restored session referenced preset "${data.name}" which is unavailable (${preset.unavailable}). Not attaching.`,
        ],
      };
    }

    return {
      state: {
        declared: snapshotPresetForDrift(preset),
        dirty: false,
        name: preset.name,
        restore: { kind: "unknown" },
        scope: preset.scope,
      },
      warnings: [],
    };
  }

  /** Return whether the current model selection was triggered by this extension. */
  isSelfTriggered(): boolean {
    return this.selfTriggeredModelSetDepth > 0;
  }

  /** Run a model write while suppressing self-triggered drift handling. */
  async withSelfTriggeredModelSet<T>(fn: () => Promise<T>): Promise<T> {
    this.selfTriggeredModelSetDepth++;

    try {
      return await fn();
    } finally {
      this.selfTriggeredModelSetDepth--;
    }
  }

  /**
   * Test-only seam for setting active state directly without going through
   * start/restore. Production code MUST use start/clear/restoreFromBranch so
   * the persistence entry and badge stay in sync; tests use this when they
   * need an active preset baseline cheaply.
   *
   * The leading underscore signals "do not call from production". A future
   * lint rule could enforce this; for now it is a convention.
   */
  _replaceForTest(
    next: ActivePresetState | undefined,
    ctx: SessionContext,
  ): void {
    this.active = next;
    this.setStatus(ctx);
  }

  private setStatus(ctx: SessionContext): void {
    ctx.ui.setStatus(STATUS_KEY, renderStatusBadge(this.active, ctx.ui.theme));
  }
}
