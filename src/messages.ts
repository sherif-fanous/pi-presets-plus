/**
 * Custom conversation message types and renderers for pi-presets-plus.
 *
 * Owns the message shapes and how they appear in the conversation log; it
 * does NOT send messages or own activation logic.
 */
import type { ThinkingLevel } from "./types.js";
import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export const ACTIVATED_MESSAGE_TYPE = "presets-plus:activated";

interface ActivatedMessageDetails {
  name: string;
  model: string;
  thinkingLevel: ThinkingLevel;
}

export function formatActivatedMessage(
  details: ActivatedMessageDetails,
  theme: Parameters<MessageRenderer<ActivatedMessageDetails>>[2],
): string {
  return theme.fg("muted", `Preset ${details.name} applied`);
}

export const renderActivatedMessage: MessageRenderer<
  ActivatedMessageDetails
> = (message, _options, theme) => {
  const details = message.details;

  if (!details) return undefined;

  return new Text(formatActivatedMessage(details, theme));
};
