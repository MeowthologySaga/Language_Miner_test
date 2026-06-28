import { findConversationSpeakerMarkers } from "./lifeConversationParser";
import type { StudyCard } from "./types";

export type LifeConversationMessage = {
  speaker: string;
  text: string;
  role: "me" | "other";
};

export type LifeExpressionPreview = {
  summary: string;
  messages: LifeConversationMessage[];
  targetText: string;
};

export const LIFE_CONTEXT_MESSAGE_LIMIT = 4;
export const LIFE_BUBBLE_COLLAPSE_LENGTH = 220;

export function getLifeExpressionPreview(card: StudyCard): LifeExpressionPreview {
  const frontText = normalizeLifeText(card.frontText || "");
  const sourceText =
    normalizeLifeText(card.sourceSentence) ||
    normalizeLifeText(extractLastMeText(frontText)) ||
    frontText;
  const summary = extractLifeSection(frontText, "맥락");
  const originalText = extractLifeSection(frontText, "원문") || frontText;
  const parsedMessages = parseLifeConversationMessages(originalText);
  const currentMeIndex = findCurrentMeMessageIndex(parsedMessages, sourceText);
  const priorMessages = parsedMessages.filter((_, index) => index !== currentMeIndex);
  const currentMessage =
    currentMeIndex >= 0
      ? parsedMessages[currentMeIndex]
      : sourceText
        ? { speaker: "나", text: sourceText, role: "me" as const }
        : null;
  const messages = [
    ...priorMessages.slice(-LIFE_CONTEXT_MESSAGE_LIMIT),
    ...(currentMessage ? [currentMessage] : [])
  ];

  return {
    summary,
    messages,
    targetText: sourceText
  };
}

export function parseLifeConversationMessages(value?: string): LifeConversationMessage[] {
  const text = normalizeLifeText(value || "");
  if (!text) {
    return [];
  }

  const markers = findConversationSpeakerMarkers(text);
  if (!markers.length) {
    return [
      {
        speaker: "상대",
        text,
        role: "other"
      }
    ];
  }

  return markers
    .map((marker, index) => {
      const nextMarker = markers[index + 1];
      const textForSpeaker = normalizeLifeText(
        text.slice(marker.contentStart, nextMarker?.markerStart ?? text.length)
      );
      if (!textForSpeaker) {
        return null;
      }
      return {
        speaker: getDisplaySpeaker(marker.speaker),
        text: textForSpeaker,
        role: isMeSpeaker(marker.speaker) ? ("me" as const) : ("other" as const)
      };
    })
    .filter((message): message is LifeConversationMessage => Boolean(message));
}

export function shouldCollapseLifeMessage(message: LifeConversationMessage) {
  return message.role === "other" && message.text.length > LIFE_BUBBLE_COLLAPSE_LENGTH;
}

function extractLifeSection(value: string, heading: "맥락" | "원문") {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return "";
  }

  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => isLifeHeading(line, heading));
  if (startIndex >= 0) {
    const endIndex = lines.findIndex(
      (line, index) => index > startIndex && isAnyLifeHeading(line)
    );
    return lines
      .slice(startIndex + 1, endIndex >= 0 ? endIndex : undefined)
      .join("\n")
      .trim();
  }

  const nextHeadings =
    heading === "맥락"
      ? ["원문", "original", "conversation"]
      : ["맥락", "context"];
  const pattern = new RegExp(
    `${escapeRegExp(heading)}\\s*([\\s\\S]*?)(?=\\s*(?:${nextHeadings
      .map(escapeRegExp)
      .join("|")})\\s|$)`,
    "i"
  );
  return pattern.exec(text)?.[1]?.trim() || "";
}

function isLifeHeading(line: string, heading: "맥락" | "원문") {
  const normalized = line.trim().toLowerCase();
  if (heading === "맥락") {
    return normalized === "맥락" || normalized === "context";
  }
  return normalized === "원문" || normalized === "original" || normalized === "conversation";
}

function isAnyLifeHeading(line: string) {
  return isLifeHeading(line, "맥락") || isLifeHeading(line, "원문");
}

function findCurrentMeMessageIndex(messages: LifeConversationMessage[], sourceText: string) {
  if (!sourceText) {
    return findLastIndex(messages, (message) => message.role === "me");
  }

  const normalizedSource = normalizeComparableText(sourceText);
  const exactIndex = findLastIndex(
    messages,
    (message) => message.role === "me" && normalizeComparableText(message.text) === normalizedSource
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  return findLastIndex(
    messages,
    (message) =>
      message.role === "me" &&
      (normalizeComparableText(message.text).includes(normalizedSource) ||
        normalizedSource.includes(normalizeComparableText(message.text)))
  );
}

function extractLastMeText(value: string) {
  const messages = parseLifeConversationMessages(extractLifeSection(value, "원문") || value);
  const index = findLastIndex(messages, (candidate) => candidate.role === "me");
  return index >= 0 ? messages[index].text : "";
}

function isMeSpeaker(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^(?:me|나|내|내가|you|user|사용자|learner)$/.test(normalized);
}

function getDisplaySpeaker(value: string) {
  return isMeSpeaker(value) ? "나" : value;
}

function normalizeLifeText(value?: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparableText(value: string) {
  return normalizeLifeText(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
