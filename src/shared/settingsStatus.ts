import type { AppSettings } from "./types";

type SensitiveSettings = Pick<AppSettings, "geminiApiKey" | "googleTranslateApiKey">;

const CONFIGURED_SECRET_REDACTION = "[secret redacted]";
const API_KEY_REDACTION = "[API key redacted]";

export function sanitizeSettingsStatusMessage(message: string, settings: SensitiveSettings) {
  return sanitizeSecretStatusMessage(message, [
    settings.geminiApiKey,
    settings.googleTranslateApiKey
  ]);
}

export function sanitizeSecretStatusMessage(message: string, sensitiveValues: string[] = []) {
  const normalizedSensitiveValues = sensitiveValues
    .map((value) => value.trim())
    .filter((value) => value.length >= 6);

  let sanitized = message;
  for (const value of normalizedSensitiveValues) {
    sanitized = sanitized.split(value).join(CONFIGURED_SECRET_REDACTION);
  }

  return sanitized
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bsk-[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bya29\.[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bgh[pousr]_[0-9A-Za-z_]{10,}\b/g, API_KEY_REDACTION)
    .replace(
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[0-9A-Za-z._~+/=-]{12,}["']?/gi,
      `$1=${CONFIGURED_SECRET_REDACTION}`
    );
}
