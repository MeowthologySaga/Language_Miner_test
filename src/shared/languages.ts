import type { LearningProfile, ProfileLanguage } from "./types";

export const languagePresets: ProfileLanguage[] = [
  {
    code: "en",
    nameKo: "영어",
    nameEn: "English"
  },
  {
    code: "ko",
    nameKo: "한국어",
    nameEn: "Korean"
  },
  {
    code: "ja",
    nameKo: "일본어",
    nameEn: "Japanese"
  }
];

export const defaultLearningProfile: LearningProfile = {
  targetLanguage: languagePresets[0],
  nativeLanguage: languagePresets[1]
};

export function normalizeProfileLanguage(
  input: Partial<ProfileLanguage> | undefined,
  fallback: ProfileLanguage
): ProfileLanguage {
  const code = input?.code?.trim().toLowerCase() || fallback.code;
  const nameKo = input?.nameKo?.trim() || fallback.nameKo;
  const nameEn = input?.nameEn?.trim() || fallback.nameEn;

  return {
    code,
    nameKo,
    nameEn
  };
}

export function normalizeLearningProfile(
  input: Partial<LearningProfile> | undefined
): LearningProfile {
  return {
    targetLanguage: normalizeProfileLanguage(
      input?.targetLanguage,
      defaultLearningProfile.targetLanguage
    ),
    nativeLanguage: normalizeProfileLanguage(
      input?.nativeLanguage,
      defaultLearningProfile.nativeLanguage
    )
  };
}

export function areSameLanguage(left: ProfileLanguage, right: ProfileLanguage) {
  return left.code.trim().toLowerCase() === right.code.trim().toLowerCase();
}
