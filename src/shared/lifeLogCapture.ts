import type { LifeLog, LifeLogMetadata } from "./types";
import {
  normalizeLifeLogMessages,
  normalizeOptionalMetadataString,
  normalizeRawLifeLogContent
} from "./lifeLogMessages";

export const LIFE_MINER_BRIDGE_HOST = "127.0.0.1";
export const LIFE_MINER_BRIDGE_PORT = 17345;
export const LIFE_MINER_BRIDGE_BASE_URL = `http://${LIFE_MINER_BRIDGE_HOST}:${LIFE_MINER_BRIDGE_PORT}`;

export type LifeMinerCaptureInput = {
  text?: string;
  beforeContext?: string;
  afterContext?: string;
  appName?: string;
  metadata?: LifeLogMetadata;
};

export type LifeLogCaptureRejectionReason =
  | "too_short"
  | "low_signal_reaction"
  | "emoji_only"
  | "url_only"
  | "empty";

export type PreparedLifeLogCapture =
  | {
      accepted: true;
      lifeLogInput: Omit<LifeLog, "id" | "processed" | "createdAt">;
    }
  | {
      accepted: false;
      reason: LifeLogCaptureRejectionReason;
      text: string;
    };

export function prepareLifeLogCapture(
  input: LifeMinerCaptureInput,
  options: { minLength?: number; filterLowSignalTargets?: boolean } = {}
): PreparedLifeLogCapture {
  const rawText = normalizeRawLifeLogContent(input.text ?? "");
  const rejectionReason = getLifeLogTextRejectionReason(rawText, options);
  if (rejectionReason) {
    return {
      accepted: false,
      reason: rejectionReason,
      text: rawText
    };
  }

  return {
    accepted: true,
    lifeLogInput: {
      text: maskSensitiveText(rawText),
      beforeContext: maskOptionalSensitiveText(input.beforeContext),
      afterContext: maskOptionalSensitiveText(input.afterContext),
      appName: normalizeOptionalText(input.appName),
      metadata: sanitizeLifeLogMetadata(input.metadata),
      sourceType: "browser_extension"
    }
  };
}

export function getLifeLogTextRejectionReason(
  text: string,
  options: { minLength?: number; filterLowSignalTargets?: boolean } = {}
): LifeLogCaptureRejectionReason | null {
  const normalizedText = normalizeLifeLogText(text);
  if (!normalizedText) {
    return "empty";
  }

  if (isUrlOnly(normalizedText)) {
    return "url_only";
  }

  if (options.filterLowSignalTargets === false) {
    return null;
  }

  if (normalizedText.length < (options.minLength ?? 4)) {
    return "too_short";
  }

  if (isLowSignalReaction(normalizedText)) {
    return "low_signal_reaction";
  }

  if (isEmojiOnly(normalizedText)) {
    return "emoji_only";
  }

  return null;
}

export function normalizeLifeLogText(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function maskSensitiveText(text: string) {
  return normalizeRawLifeLogContent(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[token]")
    .replace(/\bgh[pousr]_[0-9A-Za-z_]{20,}\b/g, "[token]")
    .replace(/\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g, "[token]")
    .replace(/\bsk(?:-proj)?-[0-9A-Za-z_-]{16,}\b/g, "[token]")
    .replace(/\beyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g, "[token]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[0-9A-Za-z._~+/=-]{12,}["']?/gi,
      "$1=[secret]"
    )
    .replace(
      /(?<!\w)(?:\+?\d{1,3}[-.\s]?)?(?:\(?0?\d{1,3}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}(?!\w)/g,
      "[phone]"
    )
    .replace(/\b\d{9,}\b/g, "[number]");
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = normalizeLifeLogText(value ?? "");
  return normalized || undefined;
}

function maskOptionalSensitiveText(value: string | undefined) {
  const normalized = normalizeRawLifeLogContent(value ?? "");
  return normalized ? maskSensitiveText(normalized) : undefined;
}

function sanitizeLifeLogMetadata(metadata: LifeLogMetadata | undefined) {
  if (!metadata) {
    return undefined;
  }

  const sanitizedEntries: Array<readonly [string, unknown]> = Object.entries(metadata)
    .map(([key, value]) => {
      if (key === "messages") {
        const messages = normalizeLifeLogMessages(value).map((message) => ({
          ...message,
          raw_content: maskSensitiveText(message.raw_content)
        }));
        return [key, messages.length ? messages : undefined] as const;
      }

      if (typeof value === "boolean") {
        return [key, value] as const;
      }

      return [key, normalizeOptionalMetadataString(value)] as const;
    })
    .filter((entry) => entry[1] !== undefined);

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries) as LifeLogMetadata;
}

function isLowSignalReaction(text: string) {
  const compact = text.replace(/[\s!?.,~…\-_/\\|()[\]{}'"]+/g, "");
  if (!compact || compact.length > 10) {
    return false;
  }

  return /^(ㅋ+|ㅎ+|ㅇ+|ㄱ+|ㄴ+|ㅜ+|ㅠ+)+$/u.test(compact);
}

function isEmojiOnly(text: string) {
  const withoutEmoji = text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\s\p{P}\p{S}\uFE0F]/gu, "");
  return withoutEmoji.length === 0 && /\p{Extended_Pictographic}/u.test(text);
}

function isUrlOnly(text: string) {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => /^https?:\/\/\S+$/i.test(token));
}
