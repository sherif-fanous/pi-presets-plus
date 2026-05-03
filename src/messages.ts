/**
 * Custom conversation messages for preset activation.
 *
 * Owns the `presets-plus:activated` message shape and renderer for OpenSpec
 * change `add-preset-activation`; it does NOT send messages. Future messages
 * should use separate custom types to keep renderers simple.
 *
 * Renderer is intentionally a single muted line ("Preset <name> applied")
 * because the picker card already showed the resolved model/thinking values
 * the user just chose. The full details remain on `message.details` so
 * future callers (session replay, telemetry, drift detection) can still
 * read the resolved fields without us repeating them in the conversation.
 */
import type { ThinkingLevel } from "./types.js";
import type { MessageRenderer } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

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
