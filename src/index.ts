/**
 * pi-presets-plus extension entry point.
 *
 * Responsibilities (this change, add-preset-storage):
 * - Register a single `/presets` command that routes `list` and `reload`
 *   subcommands and pointing the user at them on bare invocation.
 * - On `session_start` (startup, reload, new, resume, fork) call
 *   `loadAll(ctx)` once and surface any rolled-up warnings via a single
 *   `ctx.ui.notify`. Storage state itself is not cached: every consumer
 *   re-reads via `loadAll`, so `ctx.reload()` automatically picks up
 *   external file edits without bookkeeping here.
 *
 * Later changes layer activation, picker UI, editor UI, drift detection,
 * and entry-point shortcuts on top of this same factory.
 */

import {
  getArgumentCompletions,
  handlePresetsCommand,
  surfaceWarnings,
} from "./commands/presets/index.js";
import { loadAll } from "./store/api.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function presetsPlus(pi: ExtensionAPI) {
  pi.registerCommand("presets", {
    description:
      "Manage and switch presets that bundle a model, thinking level, tools, and system prompt. Subcommands: `list`, `reload`.",
    getArgumentCompletions: (prefix) => getArgumentCompletions(prefix),
    handler: (args, ctx) => handlePresetsCommand(args, ctx),
  });

  pi.on("session_start", async (_event, ctx) => {
    // Pre-warm the loader once per session so any file-level warnings
    // (malformed JSON, unsupported version) surface immediately rather
    // than waiting for the first `/presets list` call. Errors here
    // must never crash session startup; loadAll already encodes
    // failures as warnings rather than throwing.
    try {
      const { warnings } = await loadAll(ctx);

      surfaceWarnings(ctx, warnings);
    } catch (err) {
      // Defense in depth: loadAll is designed not to throw, but a
      // surprise (e.g. a permission error during readFile that we
      // didn't anticipate) should not block the session.
      ctx.ui.notify(
        `pi-presets-plus failed to load preset files: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  });
}
