import { findConversationSpeakerMarkers } from "./lifeConversationParser";
import type { LifeLog, LifeLogMessage, LifeLogMessageRole, LifeLogMetadata } from "./types";

export type LifeLogDisplayMessage = {
  speaker: string;
  text: string;
  role: "me" | "other";
};

const LIFE_LOG_MESSAGE_ROLES = new Set<LifeLogMessageRole>([
  "user",
  "assistant",
  "other",
  "system"
]);

export function normalizeRawLifeLogContent(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function normalizeLifeLogMessages(value: unknown): LifeLogMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): LifeLogMessage | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const rawContent = normalizeRawLifeLogContent(
        candidate.raw_content ?? candidate.rawContent ?? candidate.text
      );
      if (!rawContent) {
        return null;
      }

      const role = normalizeLifeLogMessageRole(candidate.role);
      const speaker = normalizeLifeLogSpeaker(candidate.speaker) || defaultSpeakerForRole(role);
      const timestamp = normalizeOptionalMetadataString(candidate.timestamp);

      return {
        role,
        speaker,
        raw_content: rawContent,
        ...(timestamp ? { timestamp } : {})
      };
    })
    .filter((message): message is LifeLogMessage => Boolean(message));
}

export function sanitizeLifeLogMetadataMessages(
  metadata: LifeLogMetadata | undefined
): LifeLogMessage[] {
  return normalizeLifeLogMessages(metadata?.messages);
}

export function getLifeLogDisplayMessages(
  log: LifeLog,
  fallbackSpeaker = "상대"
): LifeLogDisplayMessage[] {
  const metadataMessages = normalizeLifeLogMessages(log.metadata?.messages);
  if (metadataMessages.length) {
    const currentUserSpeaker = normalizeLifeLogSpeaker(log.metadata?.currentUserSpeaker);
    return metadataMessages.map((message) => {
      const isMe =
        message.role === "user" ||
        Boolean(
          currentUserSpeaker &&
            areSameLifeLogSpeaker(message.speaker, currentUserSpeaker)
      );
      return {
        speaker: isMe ? "나" : message.speaker || defaultSpeakerForRole(message.role),
        text: normalizeRawLifeLogContent(message.raw_content),
        role: isMe ? "me" : "other"
      };
    });
  }

  return getLegacyLifeLogDisplayMessages(log, fallbackSpeaker);
}

export function normalizeOptionalMetadataString(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || undefined;
}

function getLegacyLifeLogDisplayMessages(
  log: LifeLog,
  fallbackSpeaker: string
): LifeLogDisplayMessage[] {
  const beforeMessages = parseLegacyLifeLogConversationMessages(log.beforeContext, fallbackSpeaker);
  const meMessage: LifeLogDisplayMessage = {
    speaker: "나",
    text: normalizeDisplayMessageText(log.text),
    role: "me"
  };
  const afterMessages = parseLegacyLifeLogConversationMessages(log.afterContext, fallbackSpeaker);
  return [...beforeMessages, meMessage, ...afterMessages].filter((message) => message.text);
}

function parseLegacyLifeLogConversationMessages(
  value: string | undefined,
  fallbackSpeaker: string
): LifeLogDisplayMessage[] {
  const text = normalizeDisplayMessageText(value);
  if (!text) {
    return [];
  }

  const markers = findConversationSpeakerMarkers(text);
  if (!markers.length) {
    return [
      {
        speaker: fallbackSpeaker || "상대",
        text,
        role: "other"
      }
    ];
  }

  return markers
    .map((marker, index) => {
      const nextMarker = markers[index + 1];
      const messageText = normalizeDisplayMessageText(
        text.slice(marker.contentStart, nextMarker?.markerStart ?? text.length)
      );
      if (!messageText) {
        return null;
      }
      return {
        speaker: getLegacyDisplaySpeaker(marker.speaker),
        text: messageText,
        role: isLegacyMeSpeaker(marker.speaker) ? ("me" as const) : ("other" as const)
      };
    })
    .filter((message): message is LifeLogDisplayMessage => Boolean(message));
}

function normalizeDisplayMessageText(value?: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLifeLogMessageRole(value: unknown): LifeLogMessageRole {
  const normalized = String(value ?? "").trim().toLowerCase() as LifeLogMessageRole;
  return LIFE_LOG_MESSAGE_ROLES.has(normalized) ? normalized : "other";
}

function normalizeLifeLogSpeaker(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[:\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function areSameLifeLogSpeaker(left: unknown, right: unknown) {
  return normalizeLifeLogSpeakerKey(left) === normalizeLifeLogSpeakerKey(right);
}

function normalizeLifeLogSpeakerKey(value: unknown) {
  return normalizeLifeLogSpeaker(value).toLocaleLowerCase();
}

function defaultSpeakerForRole(role: LifeLogMessageRole) {
  if (role === "user") {
    return "나";
  }
  if (role === "assistant") {
    return "Assistant";
  }
  if (role === "system") {
    return "System";
  }
  return "상대";
}

function isLegacyMeSpeaker(value: string) {
  return /^(?:me|나|내|내가|내 말|you|user|사용자|learner)$/i.test(value.trim());
}

function getLegacyDisplaySpeaker(value: string) {
  return isLegacyMeSpeaker(value) ? "나" : value;
}
