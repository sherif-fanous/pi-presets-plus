import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function presetsPlus(pi: ExtensionAPI) {
  pi.registerCommand("presets", {
    description:
      "Manage and switch presets that bundle a model, thinking level, tools, and system prompt (scaffold; full features coming).",
    handler: (_args, ctx) => {
      ctx.ui.notify(
        "pi-presets-plus is installed. Storage, activation, and UI arrive in subsequent changes.",
        "info",
      );

      return Promise.resolve();
    },
  });
}
