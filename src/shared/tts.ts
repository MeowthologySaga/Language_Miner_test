import type {
  AppSettings,
  StudyCard,
  StudyCardTtsAudio,
  TtsProviderName,
  TtsSynthesisInput
} from "./types";
import { isInputToNativeDirection } from "./cardDeck";

export const DEFAULT_TTS_MODEL = "windows-system-default";
export const DEFAULT_TTS_PROVIDER: TtsProviderName = "system";
export const DEFAULT_TTS_RATE = 0;

export function getCardTtsText(card: StudyCard) {
  if (card.cardType === "life_expression") {
    return normalizeTtsText(card.targetText || extractMeLine(card.literalTranslationKo) || "");
  }

  return normalizeTtsText(card.frontText || card.sourceSentence || "");
}

export function createCardTtsInput(card: StudyCard, settings: AppSettings): TtsSynthesisInput | null {
  const text = getCardTtsText(card);
  if (!text) {
    return null;
  }
  const languageCode = getCardTtsLanguageCode(card, settings);

  return {
    text,
    languageCode,
    providerName: settings.ttsProviderName || DEFAULT_TTS_PROVIDER,
    model: settings.ttsModel || DEFAULT_TTS_MODEL,
    voiceName: settings.ttsVoiceName.trim() || undefined,
    rate: Number.isFinite(settings.ttsRate) ? settings.ttsRate : DEFAULT_TTS_RATE
  };
}

export function getCachedCardTtsAudio(
  card: StudyCard,
  input: TtsSynthesisInput | null
): StudyCardTtsAudio | null {
  if (!input || !card.ttsAudio?.length) {
    return null;
  }

  const id = createTtsCacheId(input);
  return card.ttsAudio.find((audio) => audio.id === id) ?? null;
}

export function createTtsCacheId(input: TtsSynthesisInput) {
  return [
    "tts-v2",
    input.providerName,
    input.model,
    input.languageCode,
    normalizeTtsText(input.voiceName || "auto"),
    String(input.rate ?? 0),
    hashTtsText(input.text)
  ].join(":");
}

export function getDefaultTtsSettings(): Pick<
  AppSettings,
  "ttsProviderName" | "ttsModel" | "ttsVoiceName" | "ttsRate" | "preGenerateCardTts"
> {
  return {
    ttsProviderName: DEFAULT_TTS_PROVIDER,
    ttsModel: DEFAULT_TTS_MODEL,
    ttsVoiceName: "",
    ttsRate: DEFAULT_TTS_RATE,
    preGenerateCardTts: true
  };
}

export function getCardTtsLanguageCode(card: StudyCard, settings: AppSettings) {
  const text = getCardTtsText(card);
  if (card.cardType === "life_expression" || !isInputToNativeDirection(card.direction)) {
    return normalizeTtsLanguageCode(
      inferTtsLanguageCode(text, settings.learningProfile.targetLanguage.code)
    );
  }

  const metadataLanguage = card.languageMetadata?.actualSourceLanguageCode;
  if (metadataLanguage && metadataLanguage !== "unknown") {
    return normalizeTtsLanguageCode(metadataLanguage);
  }

  const metadataTargetLanguage = card.languageMetadata?.profileTargetLanguageCode;
  if (metadataTargetLanguage && metadataTargetLanguage !== "unknown") {
    return normalizeTtsLanguageCode(inferTtsLanguageCode(text, metadataTargetLanguage));
  }

  return normalizeTtsLanguageCode(
    inferTtsLanguageCode(text, settings.learningProfile.targetLanguage.code)
  );
}

function inferTtsLanguageCode(text: string, fallbackLanguageCode: string) {
  const normalizedText = normalizeTtsText(text);
  if (/[가-힣]/.test(normalizedText)) {
    return "ko";
  }
  if (/[\u3040-\u30ff]/.test(normalizedText)) {
    return "ja";
  }
  if (/[A-Za-z]/.test(normalizedText)) {
    return "en";
  }
  return fallbackLanguageCode || "en";
}

function normalizeTtsLanguageCode(languageCode: string) {
  return languageCode.trim().toLowerCase().split("-")[0] || "en";
}

function extractMeLine(value: string | undefined) {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meLine = lines.find((line) => /^\s*(?:Me|나|내 말)\s*[:：]/i.test(line));
  return meLine?.replace(/^\s*(?:Me|나|내 말)\s*[:：]\s*/i, "") || "";
}

export function normalizeTtsText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function hashTtsText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
