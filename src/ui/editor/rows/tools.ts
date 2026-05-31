/**
 * "Tools" row factory.
 *
 * Owns the session/preset mode toggle, the per-tool checkbox cursor,
 * help payload, and render. The cursor (`toolIndex`) is private
 * mutable state in the factory's closure so it stays scoped to this
 * row instead of leaking onto the editor class.
 */
import { TOOLS_LABEL } from "../../labels.js";
import { renderValueRow } from "../row-render.js";
import type { EditorRow, EditorRowHost } from "../row.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";

export function makeToolsRow(host: EditorRowHost): EditorRow {
  let toolIndex = 0;

  function enterPresetToolsMode(): void {
    const state = host.getState();
    const selectedTools =
      state.selectedTools.length > 0
        ? state.selectedTools
        : host.initialActiveTools;

    host.setState({
      ...state,
      selectedTools: [...selectedTools],
      toolsMode: "preset",
    });
    toolIndex = 0;
  }

  return {
    id: "tools",
    help: {
      body: [
        "Tools are the abilities Pi has during a session \u2014 things like reading files, running commands, or searching the web.",
        "Session means this preset uses whatever tools are active when you apply it.",
        "Preset means this preset always uses the specific tools you pick here, no matter what's currently active.",
      ],
      title: "Tools",
    },
    handleInput(input) {
      const state = host.getState();

      if (matchesKey(input, Key.left)) {
        if (state.toolsMode === "preset" && toolIndex === 0) {
          host.setState({ ...state, toolsMode: "session" });
        } else {
          toolIndex = Math.max(0, toolIndex - 1);
        }
      } else if (matchesKey(input, Key.right)) {
        if (state.toolsMode === "session") {
          enterPresetToolsMode();
        } else {
          toolIndex = Math.min(
            Math.max(0, host.allTools.length - 1),
            toolIndex + 1,
          );
        }
      } else if (input === " ") {
        if (state.toolsMode === "session") {
          enterPresetToolsMode();
        } else {
          host.setState({ ...state, toolsMode: "session" });
        }
      } else if (matchesKey(input, Key.enter) && state.toolsMode === "preset") {
        const tool = host.allTools[toolIndex];

        if (!tool) return;

        const selected = new Set(state.selectedTools);

        if (selected.has(tool)) {
          selected.delete(tool);
        } else {
          selected.add(tool);
        }

        host.setState({ ...state, selectedTools: [...selected] });
      }
    },
    renderLines() {
      const state = host.getState();
      const focused = host.currentRow() === "tools";
      // Tools-capability gating is intentionally out of scope until
      // pi-ai exposes a supports-tools flag.
      //
      // Labels pair with `formatToolsSummary` on the picker card so
      // the editor and card share one vocabulary:
      //   session — session tools pass through at apply time (no
      //             `tools` field is persisted).
      //   preset  — an explicit `tools: [...]` list is persisted and
      //             wins at apply time.
      const sessionMarker = state.toolsMode === "session" ? "●" : "○";
      const presetMarker = state.toolsMode === "preset" ? "●" : "○";
      const mode = `${sessionMarker} session   ${presetMarker} preset`;
      const lines = [renderValueRow(host.theme, TOOLS_LABEL, mode, focused)];

      if (state.toolsMode === "session") {
        // Explain the less-obvious mode inline; in `preset` mode the
        // multi-toggle list below speaks for itself.
        lines.push(
          host.theme.fg("dim", "    Session: inherits the active tool set."),
        );
      } else if (host.allTools.length === 0) {
        lines.push(host.theme.fg("dim", "    No tools available"));
      } else {
        const selected = new Set(state.selectedTools);
        const renderedTools = host.allTools.map((tool, index) => {
          const marker = selected.has(tool) ? "x" : " ";
          const text = `[${marker}] ${tool}`;

          return index === toolIndex && focused
            ? host.theme.fg("accent", text)
            : text;
        });

        lines.push(`    ${renderedTools.join("  ")}`);
      }

      const diagnostic = host.getFieldDiagnostic("tools");

      if (!diagnostic) return lines;

      const color = diagnostic.severity === "warning" ? "warning" : "error";

      return [...lines, host.theme.fg(color, `    ${diagnostic.message}`)];
    },
  };
}
