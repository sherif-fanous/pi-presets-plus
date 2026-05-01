/**
 * Custom conversation messages for preset activation.
 *
 * Owns the `presets-plus:activated` message shape and renderer for OpenSpec
 * change `add-preset-activation`; it does NOT send messages. Future messages
 * should use separate custom types to keep renderers simple.
 */
import type { ThinkingLevel } from "./types.js";
import type { MessageRenderer } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export const ACTIVATED_MESSAGE_TYPE = "presets-plus:activated";

const ACTIVATED_LABELS = ["preset:", "model:", "thinking level:"] as const;
const ACTIVATED_LABEL_WIDTH = Math.max(
  ...ACTIVATED_LABELS.map((label) => label.length),
);

interface ActivatedMessageDetails {
  name: string;
  model: string;
  thinkingLevel: ThinkingLevel;
}

export function formatActivatedMessage(
  details: ActivatedMessageDetails,
  theme: Parameters<MessageRenderer<ActivatedMessageDetails>>[2],
): string {
  return [
    theme.bold(theme.fg("accent", "preset applied")),
    formatRow("preset:", details.name, theme),
    formatRow("model:", details.model, theme),
    formatRow("thinking level:", details.thinkingLevel, theme),
  ].join("\n");
}

export const renderActivatedMessage: MessageRenderer<
  ActivatedMessageDetails
> = (message, _options, theme) => {
  const details = message.details;

  if (!details) return undefined;

  return new Text(formatActivatedMessage(details, theme));
};

function formatRow(
  label: (typeof ACTIVATED_LABELS)[number],
  value: string,
  theme: Parameters<MessageRenderer<ActivatedMessageDetails>>[2],
): string {
  const padding = " ".repeat(ACTIVATED_LABEL_WIDTH - label.length);

  return `  ${theme.fg("muted", label)}${padding} ${value}`;
}
