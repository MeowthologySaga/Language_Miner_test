import type { LocalEnglishMinerApi } from "../data/api";
import {
  createCardTtsInput,
  createTtsCacheId,
  getCachedCardTtsAudio,
  getDefaultTtsSettings,
  normalizeTtsText
} from "../shared/tts";
import type { AppSettings, StudyCard } from "../shared/types";
import { languagePresets, normalizeLearningProfile } from "../shared/languages";

export async function prepareCardTtsAudio(
  card: StudyCard,
  settings: AppSettings,
  api: LocalEnglishMinerApi
): Promise<StudyCard> {
  if (!settings.preGenerateCardTts) {
    return card;
  }

  const input = createCardTtsInput(card, settings);
  if (!input || getCachedCardTtsAudio(card, input)) {
    return card;
  }

  try {
    const result = await api.tts?.synthesize(input);
    if (!result?.audioDataUrl || !result.mimeType) {
      return card;
    }

    return {
      ...card,
      ttsAudio: [
        ...(card.ttsAudio ?? []),
        {
          id: createTtsCacheId(input),
          text: input.text,
          languageCode: input.languageCode,
          providerName: result.providerName,
          model: result.model,
          voiceName: result.voiceName,
          mimeType: result.mimeType,
          audioDataUrl: result.audioDataUrl,
          createdAt: result.createdAt
        }
      ]
    };
  } catch {
    return card;
  }
}

export async function playCardTts(card: StudyCard, settings?: AppSettings) {
  const ttsSettings = settings ?? readStoredTtsSettings(card);
  const input = createCardTtsInput(card, ttsSettings);
  if (!input) {
    return "읽을 문장이 없습니다.";
  }

  const cached = getCachedCardTtsAudio(card, input);
  if (cached?.audioDataUrl) {
    await playAudioDataUrl(cached.audioDataUrl);
    return "캐시된 TTS를 재생했습니다.";
  }

  try {
    const result = await window.localEnglishMiner?.tts?.synthesize(input);
    if (result?.audioDataUrl) {
      await playAudioDataUrl(result.audioDataUrl);
      return "TTS를 생성해 재생했습니다.";
    }
  } catch {
    // Fall through to speechSynthesis.
  }

  speakWithBrowser(input.text, input.languageCode, input.rate);
  return "브라우저 TTS로 재생했습니다.";
}

function playAudioDataUrl(audioDataUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(audioDataUrl);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("TTS audio playback failed."));
    void audio.play().catch(reject);
  });
}

function speakWithBrowser(text: string, languageCode: string, rate = 0) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error("TTS를 사용할 수 없습니다.");
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = normalizeSpeechLanguage(languageCode);
  utterance.rate = Math.min(1.6, Math.max(0.6, 1 + rate * 0.05));
  window.speechSynthesis.speak(utterance);
}

function normalizeSpeechLanguage(languageCode: string) {
  const normalized = languageCode.trim().toLowerCase();
  if (normalized === "en") {
    return "en-US";
  }
  if (normalized === "ko") {
    return "ko-KR";
  }
  if (normalized === "ja") {
    return "ja-JP";
  }
  return languageCode || "en-US";
}

function readStoredTtsSettings(card?: StudyCard): AppSettings {
  const defaults = getDefaultTtsSettings();
  try {
    const stored = JSON.parse(localStorage.getItem("lem:settings") ?? "{}") as Partial<AppSettings>;
    return {
      ...(stored as AppSettings),
      learningProfile: resolveCardTtsLearningProfile(stored, card),
      webReaderCustomSources: stored.webReaderCustomSources ?? [],
      ttsProviderName: stored.ttsProviderName ?? defaults.ttsProviderName,
      ttsModel: normalizeTtsText(stored.ttsModel || defaults.ttsModel),
      ttsVoiceName: stored.ttsVoiceName ?? defaults.ttsVoiceName,
      ttsRate: Number.isFinite(stored.ttsRate) ? Number(stored.ttsRate) : defaults.ttsRate,
      preGenerateCardTts: stored.preGenerateCardTts ?? defaults.preGenerateCardTts
    };
  } catch {
    return {
      learningProfile: resolveCardTtsLearningProfile({}, card),
      webReaderCustomSources: [],
      ...defaults
    } as unknown as AppSettings;
  }
}

function resolveCardTtsLearningProfile(
  stored: Partial<AppSettings>,
  card?: StudyCard
): AppSettings["learningProfile"] {
  const profileLearningProfile = readCardProfileLearningProfile(card?.profileId);
  if (profileLearningProfile) {
    return profileLearningProfile;
  }

  const metadata = card?.languageMetadata;
  if (metadata?.profileTargetLanguageCode) {
    return {
      targetLanguage: getProfileLanguage(metadata.profileTargetLanguageCode, "en"),
      nativeLanguage: getProfileLanguage(metadata.profileNativeLanguageCode, "ko")
    };
  }

  return normalizeLearningProfile(
    stored.learningProfile ?? {
      targetLanguage: getProfileLanguage("en", "en"),
      nativeLanguage: getProfileLanguage("ko", "ko")
    }
  );
}

function readCardProfileLearningProfile(profileId: string | undefined) {
  if (!profileId || typeof localStorage === "undefined") {
    return null;
  }
  try {
    const profiles = JSON.parse(localStorage.getItem("lem:profiles") ?? "[]") as Array<{
      id?: string;
      learningProfile?: Partial<AppSettings["learningProfile"]>;
    }>;
    const profile = profiles.find((candidate) => candidate.id === profileId);
    return profile?.learningProfile ? normalizeLearningProfile(profile.learningProfile) : null;
  } catch {
    return null;
  }
}

function getProfileLanguage(languageCode: string | undefined, fallbackCode: string) {
  const normalizedCode = String(languageCode || fallbackCode)
    .trim()
    .toLowerCase()
    .split("-")[0];
  return (
    languagePresets.find((language) => language.code === normalizedCode) ?? {
      code: normalizedCode || fallbackCode,
      nameKo: normalizedCode || fallbackCode,
      nameEn: normalizedCode || fallbackCode
    }
  );
}
