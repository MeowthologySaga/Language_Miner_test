import type {
  AppSettings,
  LearningProfileRecord,
  TranslationProviderName
} from "../shared/types";

type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

type BrowserTranslatorStatic = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<BrowserTranslatorAvailability>;
};

export function getSettingsTranslationProviderButtonLabel(providerName: TranslationProviderName) {
  switch (providerName) {
    case "browser":
      return "브라우저 내장";
    case "localMt":
      return "로컬 번역기";
    case "local":
      return "Ollama LLM";
    case "gemini":
      return "Gemini";
    case "google":
      return "Google 번역";
    default:
      return providerName;
  }
}

export function getSettingsStatusClassName(message: string) {
  if (/실패|오류|없습니다|지원하지 않습니다|unavailable/i.test(message)) {
    return "status-text danger";
  }
  if (/확인 중|다운로드|downloading/i.test(message)) {
    return "status-text pending";
  }
  return "status-text";
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

export function getBrowserTranslatorApi() {
  const candidate = (globalThis as { Translator?: unknown }).Translator;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const translator = candidate as Partial<BrowserTranslatorStatic>;
  return typeof translator.availability === "function"
    ? (translator as BrowserTranslatorStatic)
    : undefined;
}

export function normalizeTranslatorLanguage(value: string, fallback: string) {
  return value.trim() || fallback;
}

export function createProfilePreset(index: number, settings: AppSettings): LearningProfileRecord {
  const now = new Date().toISOString();
  return {
    id: createProfileId(),
    name: `새 프로필 ${index}`,
    learningProfile: settings.learningProfile,
    createdAt: now,
    updatedAt: now
  };
}

export function createProfileId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getProfileInitials(profile: LearningProfileRecord | undefined) {
  const code = profile?.learningProfile.targetLanguage.code.trim() || "??";
  return code.slice(0, 2).toUpperCase();
}
