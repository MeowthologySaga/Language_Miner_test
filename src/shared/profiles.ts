import { defaultLearningProfile, languagePresets, normalizeLearningProfile } from "./languages";
import type { LearningProfile, LearningProfileRecord, ProfileId } from "./types";

export const DEFAULT_PROFILE_ID = "profile-english";
export const TEMP_JAPANESE_PROFILE_ID = "profile-japanese-temp";

const initialCreatedAt = "2026-01-01T00:00:00.000Z";

export function createDefaultProfiles(
  savedLearningProfile: Partial<LearningProfile> | undefined
): LearningProfileRecord[] {
  return [
    {
      id: DEFAULT_PROFILE_ID,
      name: "영어 기본",
      learningProfile: normalizeLearningProfile(savedLearningProfile),
      createdAt: initialCreatedAt,
      updatedAt: initialCreatedAt
    },
    {
      id: TEMP_JAPANESE_PROFILE_ID,
      name: "일본어 임시",
      learningProfile: {
        targetLanguage: languagePresets.find((language) => language.code === "ja") ?? {
          code: "ja",
          nameKo: "일본어",
          nameEn: "Japanese"
        },
        nativeLanguage: languagePresets.find((language) => language.code === "ko") ?? {
          code: "ko",
          nameKo: "한국어",
          nameEn: "Korean"
        }
      },
      createdAt: initialCreatedAt,
      updatedAt: initialCreatedAt
    }
  ];
}

export function normalizeProfiles(
  value: unknown,
  savedLearningProfile: Partial<LearningProfile> | undefined
): LearningProfileRecord[] {
  const fallbackProfiles = createDefaultProfiles(savedLearningProfile);
  if (!Array.isArray(value)) {
    return fallbackProfiles;
  }

  const profileMap = new Map<ProfileId, LearningProfileRecord>();
  for (const fallback of fallbackProfiles) {
    profileMap.set(fallback.id, fallback);
  }

  for (const item of value) {
    const candidate = normalizeProfileRecord(item);
    if (candidate) {
      profileMap.set(candidate.id, candidate);
    }
  }

  return Array.from(profileMap.values());
}

export function normalizeActiveProfileId(
  value: unknown,
  profiles: LearningProfileRecord[]
): ProfileId {
  const profileId = typeof value === "string" ? value.trim() : "";
  if (profileId && profiles.some((profile) => profile.id === profileId)) {
    return profileId;
  }
  return profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}

export function getProfileLabel(profile: LearningProfileRecord) {
  const { targetLanguage, nativeLanguage } = profile.learningProfile;
  return `${profile.name} · ${targetLanguage.nameKo} / ${nativeLanguage.nameKo}`;
}

function normalizeProfileRecord(value: unknown): LearningProfileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LearningProfileRecord>;
  const id = candidate.id?.trim();
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    name: candidate.name?.trim() || id,
    learningProfile: normalizeLearningProfile(candidate.learningProfile ?? defaultLearningProfile),
    createdAt: candidate.createdAt || now,
    updatedAt: candidate.updatedAt || now
  };
}
