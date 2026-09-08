/**
 * Runs the dialog flows behind the picker's action keys: new, edit,
 * duplicate, delete, reorder, clear, and status.
 */
import { clearReturning } from "../activation/clear.js";
import type { ActivationResult } from "../activation/request.js";
import type { ActivePresetSession } from "../activation/session.js";
import { formatStatusBody } from "../commands/presets/status.js";
import type { HotkeyRegistry } from "../hotkey-registry.js";
import { removePreset, reorderWithinScope } from "../store/api.js";
import type { LoadedPreset } from "../types.js";
import { renderClearSummary } from "./clear-summary.js";
import { styleReportText } from "./command-report.js";
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

/** One action key, its footer label, and the command it runs. */
export interface PickerAction {
  readonly key: string;
  readonly label: string;
  run(commands: PickerCommands): Promise<void>;
}

/**
 * Surface the picker exposes to its action-key commands.
 *
 * Commands run against this interface, so a test can drive them without
 * instantiating the live picker component.
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
  onActivate(preset: LoadedPreset): Promise<ActivationResult>;
  /** Reload presets from disk and re-focus on `selectionKey`, if given. */
  refreshPresets(selectionKey?: string): Promise<void>;
  /** Close the picker; pass an `activated` payload when a preset was applied. */
  finish(result: { activated?: LoadedPreset } | undefined): void;
}

/**
 * Action keys that operate on the selected preset, in footer order.
 *
 * The picker wires Enter, Esc, Ctrl+↑↓, and `/` directly into its own
 * dispatch and footer, so they do not appear here.
 */
export const PICKER_ACTIONS: readonly PickerAction[] = [
  {
    key: "n",
    label: NEW_LABEL,
    run: (commands) => commands.openEditorForNew(),
  },
  {
    key: "e",
    label: EDIT_LABEL,
    run: (commands) => commands.openEditorForSelection(),
  },
  {
    key: "d",
    label: DUPLICATE_LABEL,
    run: (commands) => commands.duplicate(),
  },
  {
    key: "x",
    label: DELETE_LABEL,
    run: (commands) => commands.delete(),
  },
  {
    key: "c",
    label: CLEAR_LABEL,
    run: (commands) => commands.clearActive(),
  },
  {
    key: "s",
    label: STATUS_ACTION_LABEL,
    run: (commands) => commands.showStatus(),
  },
];

/** Action-key commands bound to one picker host. */
export class PickerCommands {
  constructor(private readonly host: PickerCommandHost) {}

  /** Confirm, then clear the active preset and show the restore summary. */
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
          // Informational tone because having no active preset is a normal
          // state rather than a failure.
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
          body: styleReportText(
            renderClearSummary(result.name, result.parts),
            theme,
          ),
          title: "Preset Cleared",
          tone: result.parts.some(
            (part) =>
              part.action === "restore-failed" ||
              part.action === "restored-partial",
          )
            ? "warning"
            : "info",
        }),
      );
    }

    await this.host.refreshPresets();
  }

  /** Confirm, then remove the selected preset, offering a reload if needed. */
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

  /** Open the editor on a copy of the selected preset. */
  async duplicate(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    const scopedNames = this.host
      .getAllPresets()
      .filter((candidate) => candidate.scope === preset.scope)
      .map((candidate) => candidate.name);
    const copyName = uniqueCopyName(preset.name, scopedNames);
    const copy = serializeForCopy(preset, copyName);
    // The seed carries only the source scope. Load-time metadata
    // (`shadowed`, `unavailable`) is dropped so the editor recomputes
    // availability for the copy instead of inheriting stale flags.
    const seed: LoadedPreset = { ...copy, scope: preset.scope };

    await this.openEditorAndDispatch({
      mode: "duplicate",
      seed,
      source: preset,
    });
  }

  /** Open the editor on a blank preset form. */
  async openEditorForNew(): Promise<void> {
    await this.openEditorAndDispatch({ mode: "new" });
  }

  /** Open the editor on the selected preset. */
  async openEditorForSelection(): Promise<void> {
    const preset = this.host.currentSelection();

    if (!preset) return;

    await this.openEditorAndDispatch({
      mode: "edit",
      seed: preset,
      target: preset,
    });
  }

  /** Move the selected preset one slot within its own scope. */
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

    const result = await reorderWithinScope(
      preset.scope,
      ordered.map((candidate) => candidate.name),
      this.host.ctx,
    );

    if (!result.ok) {
      this.host.ui.notify(result.reason, "error");

      return;
    }

    await this.host.refreshPresets(loadedPresetKey(preset));
  }

  /** Show the status report for the active preset in an overlay. */
  async showStatus(): Promise<void> {
    const { ctx, pi, session } = this.host;

    if (!pi) {
      await this.showUnavailableDialog("Status Unavailable");

      return;
    }

    const result = await formatStatusBody(ctx, pi, session);

    await this.host.runWithHiddenOverlay(() =>
      openInfoDialog(ctx, {
        body: styleReportText(
          withWarnings(result.body, result.warnings),
          this.host.theme,
        ),
        title: STATUS_DIALOG_TITLE,
        tone: result.severity,
      }),
    );
  }

  /**
   * Resolve the selection, confirm with caller-supplied copy, and run
   * `action` on yes. An empty selection or a cancelled confirm does
   * nothing, which keeps each call site flat.
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
   * Hide the picker, open the editor with the given seed, and route the
   * result. A `saved` payload refreshes the list with the saved preset
   * focused. A `tested` payload closes the picker and reports the
   * candidate as `activated`, so the outer notification names the preset
   * the user tested.
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
        body: "Pi did not provide the API needed for this action.",
        title,
        tone: "warning",
      }),
    );
  }
}

function withWarnings(body: string, warnings: readonly string[]): string {
  if (warnings.length === 0) return body;

  return [
    `Warnings:`,
    ...warnings.map((warning) => `- ${warning}`),
    "",
    body,
  ].join("\n");
}
