/**
 * Picker action-key commands.
 *
 * Owns the user-facing CRUD and dialog flows triggered from the picker
 * (delete, duplicate, reorder, clear, status, new, edit). It does NOT
 * own picker state, rendering, scroll/selection invariants, or hotkey
 * activation — those stay in the picker component.
 *
 * Each command runs against a `PickerCommandHost` interface so the
 * commands can be tested without instantiating the live picker, and so
 * the picker file stays focused on view-state orchestration.
 */
import type { ApplyResult } from "../activation/apply.js";
import { clearReturning } from "../activation/clear.js";
import type { ActivePresetSession } from "../activation/session.js";
import { formatStatusBody } from "../commands/presets/status.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { removePreset, reorderWithinScope } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import { renderClearSummary } from "./clear-summary.js";
import { openConfirm } from "./confirm.js";
import { openEditor } from "./editor.js";
import { openInfoDialog } from "./info-dialog.js";
import {
  CLEAR_LABEL,
  DELETE_LABEL,
  DUPLICATE_LABEL,
  EDIT_LABEL,
  NEW_LABEL,
  STATUS_ACTION_LABEL,
  STATUS_DIALOG_TITLE,
} from "./labels.js";
import { loadedPresetKey } from "./picker-state.js";
import { serializeForCopy, uniqueCopyName } from "./preset-copy.js";
import { confirmReload, reloadAfterOverlayClose } from "./reload-prompt.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

/**
 * One row in the picker's selection-targeted action registry.
 *
 * Pairs the single-character trigger key with its footer label and the
 * `PickerCommands` method that runs the action. The picker uses this
 * registry as the single source of truth for both keyboard dispatch and
 * the footer hint string — a new action lands here once and shows up in
 * both surfaces.
 */
export interface PickerAction {
  readonly key: string;
  readonly label: string;
  run(commands: PickerCommands): void;
}

/**
 * Surface the picker exposes to its action-key commands.
 *
 * Each member is something a command genuinely needs; the host
 * implementation (the picker component) decides how those map back onto
 * its private state.
 */
export interface PickerCommandHost {
  readonly ctx: ExtensionCommandContext;
  readonly pi: ExtensionAPI | undefined;
  readonly ui: Pick<ExtensionUIContext, "notify">;
  readonly theme: Theme;
  readonly hotkeys: HotkeyRegistry;
  readonly session: ActivePresetSession;
  /** Snapshot of the loaded preset list at the time of the call. */
  getAllPresets(): readonly LoadedPreset[];
  /** Currently selected preset, honoring the active filter and scope. */
  currentSelection(): LoadedPreset | undefined;
  /** Hide the picker overlay while a nested dialog runs. */
  runWithHiddenOverlay<T>(fn: () => Promise<T>): Promise<T>;
  /** Apply a preset (used by the editor's Test button as a passthrough). */
  onActivate(preset: LoadedPreset): Promise<ApplyResult>;
  /** Reload presets from disk and re-focus on `selectionKey`, if given. */
  refreshPresets(selectionKey?: string): Promise<void>;
  /** Close the picker; pass an `activated` payload when a preset was applied. */
  finish(result: { activated?: LoadedPreset } | undefined): void;
}

/**
 * Ordered list of selection-targeted action keys.
 *
 * Order is the footer-display order. Excludes universal hints like
 * Enter / Esc / Ctrl+↑↓ / `/` because those are wired directly in the
 * picker's render and dispatch — they are not selection-targeted CRUD.
 */
export const PICKER_ACTIONS: readonly PickerAction[] = [
  {
    key: "n",
    label: NEW_LABEL,
    run: (commands) => void commands.openEditorForNew(),
  },
  {
    key: "e",
    label: EDIT_LABEL,
    run: (commands) => void commands.openEditorForSelection(),
  },
  {
    key: "d",
    label: DUPLICATE_LABEL,
    run: (commands) => void commands.duplicate(),
  },
  {
    key: "x",
    label: DELETE_LABEL,
    run: (commands) => void commands.delete(),
  },
  {
    key: "c",
    label: CLEAR_LABEL,
    run: (commands) => void commands.clearActive(),
  },
  {
    key: "s",
    label: STATUS_ACTION_LABEL,
    run: (commands) => void commands.showStatus(),
  },
];

export class PickerCommands {
  constructor(private readonly host: PickerCommandHost) {}

  async clearActive(): Promise<void> {
    const { ctx, pi, session, theme } = this.host;

    if (!pi) {
      await this.showUnavailableDialog("Clear Unavailable");

      return;
    }

    if (!session.current()) {
      await this.host.runWithHiddenOverlay(() =>
        openInfoDialog(ctx, {
          body: "No preset is active.",
          title: "Clear Unavailable",
          // No active preset is a normal empty state, unlike missing Pi API.
          tone: "info",
        }),
      );

      return;
    }

    const confirmed = await this.host.runWithHiddenOverlay(() =>
      openConfirm(
        ctx,
        "Clear active preset?",
        "Clear the active preset and restore managed settings?",
      ),
    );

    if (!confirmed) return;

    const result = await clearReturning(ctx, pi, session);

    if (result) {
      await this.host.runWithHiddenOverlay(() =>
        openInfoDialog(ctx, {
          body: renderClearSummary(result.name, result.parts, theme),
          title: "Preset Cleared",
          tone: "info",
        }),
      );
    }

    await this.host.refreshPresets();
  }

  async delete(): Promise<void> {
    await this.confirmAndActOnSelection(
      (preset) => ({
        title: `Delete '${preset.name}'?`,
        message: `Remove preset "${preset.name}" from ${preset.scope} scope?`,
      }),
      async (preset) => {
        const result = await removePreset(
          preset.name,
          preset.scope,
          this.host.ctx,
        );

        if (!result.ok) {
          this.host.ui.notify(result.reason, "error");

          return;
        }

        if (this.host.hotkeys.deleteNeedsReload(preset)) {
          const reloadRequested = await this.host.runWithHiddenOverlay(() =>
            confirmReload(this.host.ctx),
          );

          if (reloadRequested) {
            this.host.finish(undefined);
            reloadAfterOverlayClose(this.host.ctx);

            return;
          }

          this.host.hotkeys.recordReloadPromptDeclined(preset, undefined);
        }

        await this.host.refreshPresets(loadedPresetKey(preset));
      },
    );
  }

  async duplicate(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const scopedNames = this.host
      .getAllPresets()
      .filter((candidate) => candidate.scope === preset.scope)
      .map((candidate) => candidate.name);
    const copyName = uniqueCopyName(preset.name, scopedNames);
    const copy = serializeForCopy(preset, copyName);
    // The seed carries only the source scope; load-time metadata
    // (`shadowed`, `unavailable`) is deliberately dropped so the editor
    // recomputes availability for the copy rather than inheriting stale
    // flags from the source.
    const seed: LoadedPreset = { ...copy, scope: preset.scope };

    await this.openEditorAndDispatch({
      mode: "duplicate",
      seed,
      source: preset,
    });
  }

  async openEditorForNew(): Promise<void> {
    await this.openEditorAndDispatch({ mode: "new" });
  }

  async openEditorForSelection(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    await this.openEditorAndDispatch({
      mode: "edit",
      seed: preset,
      target: preset,
    });
  }

  async reorder(direction: -1 | 1): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const scopedPresets = this.host
      .getAllPresets()
      .filter((candidate) => candidate.scope === preset.scope);
    const index = scopedPresets.findIndex(
      (candidate) => candidate.name === preset.name,
    );
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= scopedPresets.length) return;

    const ordered = [...scopedPresets];
    const current = ordered[index];
    const next = ordered[nextIndex];

    if (!current || !next) return;

    ordered[index] = next;
    ordered[nextIndex] = current;
    await reorderWithinScope(
      preset.scope,
      ordered.map((candidate) => candidate.name),
      this.host.ctx,
    );
    await this.host.refreshPresets(loadedPresetKey(preset));
  }

  async showStatus(): Promise<void> {
    const { ctx, pi, session } = this.host;

    if (!pi) {
      await this.showUnavailableDialog("Status Unavailable");

      return;
    }

    const result = await formatStatusBody(ctx, pi, session);

    await this.host.runWithHiddenOverlay(() =>
      openInfoDialog(ctx, {
        body: withWarnings(result.body, result.warnings),
        title: STATUS_DIALOG_TITLE,
        tone: result.severity,
      }),
    );
  }

  /**
   * Confirm-then-act wrapper for CRUD commands that operate on the
   * currently-selected preset. Resolves the selection, opens the confirm
   * dialog with caller-supplied copy, and invokes `action(preset)` on
   * yes. A no-op on empty selection or cancelled confirm so each call
   * site stays flat.
   */
  private async confirmAndActOnSelection(
    messages: (preset: LoadedPreset) => { title: string; message: string },
    action: (preset: LoadedPreset) => Promise<void>,
  ): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const { title, message } = messages(preset);
    const confirmed = await this.host.runWithHiddenOverlay(() =>
      openConfirm(this.host.ctx, title, message),
    );

    if (!confirmed) return;

    await action(preset);
  }

  /**
   * Shared wrapper for the two editor-entry actions (new, edit-selected).
   * Hides the picker overlay, opens the editor seeded with either an
   * existing preset or `undefined` (new-preset defaults), and routes the
   * result: a `saved` payload refreshes the list with the new selection
   * focused; a `tested` payload closes the picker and reports the
   * candidate preset as `activated` so the outer notification surface
   * names the right preset.
   */
  private async openEditorAndDispatch(
    openOptions: Parameters<typeof openEditor>[1],
  ): Promise<void> {
    const result = await this.host.runWithHiddenOverlay(() =>
      openEditor(this.host.ctx, openOptions, {
        onReloadRequested: () => {
          this.host.finish(undefined);
          reloadAfterOverlayClose(this.host.ctx);
        },
        onTest: (candidate) =>
          this.host.onActivate({
            ...candidate,
            unavailable: undefined,
          }),
        pi: this.host.pi,
        hotkeys: this.host.hotkeys,
        presets: this.host.getAllPresets(),
        session: this.host.session,
      }),
    );

    if (result?.saved) {
      if (result.reloadRequested) return;

      await this.host.refreshPresets(loadedPresetKey(result.saved));
    }

    if (result?.tested) this.host.finish({ activated: result.tested });
  }

  private async showUnavailableDialog(title: string): Promise<void> {
    await this.host.runWithHiddenOverlay(() =>
      openInfoDialog(this.host.ctx, {
        body: "This action is unavailable because the Pi API was not provided.",
        title,
        tone: "warning",
      }),
    );
  }
}

function withWarnings(body: string, warnings: readonly string[]): string {
  if (warnings.length === 0) return body;

  return [
    `warnings:`,
    ...warnings.map((warning) => `- ${warning}`),
    "",
    body,
  ].join("\n");
}
