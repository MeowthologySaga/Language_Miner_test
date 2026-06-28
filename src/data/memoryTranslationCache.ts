import type {
  ProfileId,
  TranslatePdfSegmentsInput,
  TranslateTextResult,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationUsageEvent
} from "../shared/types";

export function entryToLookupInput(entry: TranslationCacheEntry): TranslationCacheLookupInput {
  return {
    profileId: entry.profileId,
    text: entry.sourceText,
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang,
    providerName: entry.providerName,
    model: entry.model,
    promptVersion: entry.promptVersion,
    contextHash: entry.contextHash
  };
}

export function segmentCacheInput(
  input: TranslatePdfSegmentsInput,
  segment: TranslatePdfSegmentsInput["segments"][number]
): TranslationCacheLookupInput {
  return {
    profileId: input.profileId,
    text: segment.text,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    providerName: input.providerName,
    model: input.model,
    promptVersion: input.promptVersion,
    contextHash: input.translationContext?.contextHash ?? input.contextHash
  };
}

export function createTranslationCacheEntry({
  existing,
  id,
  input,
  normalizedProfileId,
  now,
  translatedText
}: {
  existing?: TranslationCacheEntry;
  id: string;
  input: TranslationCacheLookupInput;
  normalizedProfileId: ProfileId;
  now: string;
  translatedText: string;
}): TranslationCacheEntry {
  return {
    id,
    profileId: normalizedProfileId,
    providerName: input.providerName,
    sourceLang: normalizeSourceLang(input.sourceLang),
    targetLang: normalizeTargetLang(input.targetLang),
    sourceHash: hashText(normalizeTranslationText(input.text)),
    sourceText: input.text.trim(),
    translatedText,
    model: normalizeTranslationModel(input.model),
    promptVersion: normalizePromptVersion(input.promptVersion),
    contextHash: normalizeContextHash(input.contextHash),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

export function translationResultFromEntry(
  entry: TranslationCacheEntry,
  cacheStatus: TranslateTextResult["cacheStatus"],
  usage?: TranslationUsageEvent
): TranslateTextResult {
  return {
    translatedText: entry.translatedText,
    providerName: entry.providerName,
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang,
    cacheStatus,
    usage,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

export function getTranslationCacheKey(input: TranslationCacheLookupInput, profileId: ProfileId) {
  return [
    profileId,
    input.providerName,
    normalizeSourceLang(input.sourceLang),
    normalizeTargetLang(input.targetLang),
    normalizeTranslationModel(input.model),
    normalizePromptVersion(input.promptVersion),
    normalizeContextHash(input.contextHash),
    hashText(normalizeTranslationText(input.text))
  ].join(":");
}

export function normalizeTranslationText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeSourceLang(sourceLang?: string) {
  return sourceLang?.trim() || "auto";
}

export function normalizeTargetLang(targetLang: string) {
  return targetLang.trim() || "ko";
}

export function normalizeTranslationModel(model?: string) {
  return model?.trim() || "legacy-model";
}

export function normalizePromptVersion(promptVersion?: string) {
  return promptVersion?.trim() || "legacy-prompt";
}

export function normalizeContextHash(contextHash?: string) {
  return contextHash?.trim() || "no-context";
}

export function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
