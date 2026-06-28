import { detectInputLanguage, normalizeLanguageCode } from "./inputLanguagePolicy";
import type { LearningProfile, ProfileLanguage } from "./types";

type NormalizeTargetLanguageVocabularyExamplesInput = {
  values: unknown;
  fallbackValues?: unknown;
  term: string;
  sourceTexts?: unknown[];
  targetLanguage?: ProfileLanguage;
  targetLanguageCode?: string;
  maxExamples?: number;
};

const supportedLocalLanguageCodes = new Set(["en", "ja", "ko"]);

export function createVocabularyExampleLanguageRules(profile: LearningProfile) {
  const targetLabel = formatPromptLanguageLabel(profile.targetLanguage);
  const nativeLabel = formatPromptLanguageLabel(profile.nativeLanguage);
  return [
    `- vocabularyItems[].examples must be 3 short, new sentences written only in ${targetLabel}.`,
    `- Do not translate vocabularyItems[].examples into ${nativeLabel}; examples are target-language usage examples, not native-language explanations.`,
    "- Each examples[] sentence should use the vocabulary item naturally; keep the selected term or its normal inflected form visible when possible.",
    "- If the target language normally uses a non-Latin script, examples must use that script rather than English or native-language explanation sentences."
  ];
}

export function normalizeTargetLanguageVocabularyExamples({
  values,
  fallbackValues,
  term,
  sourceTexts = [],
  targetLanguage,
  targetLanguageCode,
  maxExamples = 3
}: NormalizeTargetLanguageVocabularyExamplesInput) {
  const normalizedTargetLanguageCode = normalizeLanguageCode(
    targetLanguageCode || targetLanguage?.code
  );
  const sourceFingerprints = new Set(sourceTexts.map(normalizeExampleFingerprint).filter(Boolean));
  const candidates = uniqueNonEmptyStrings([
    ...normalizeUnknownStringList(values),
    ...normalizeUnknownStringList(fallbackValues)
  ]).filter((example) => !sourceFingerprints.has(normalizeExampleFingerprint(example)));

  const shouldValidate = supportedLocalLanguageCodes.has(normalizedTargetLanguageCode);
  const targetLanguageCandidates = shouldValidate
    ? candidates.filter(
        (example) => !isHighConfidenceExampleLanguageMismatch(example, normalizedTargetLanguageCode)
      )
    : candidates;

  const fallbackExamples = shouldValidate
    ? createTargetLanguageFallbackExamples(term, normalizedTargetLanguageCode).filter(
        (example) => !sourceFingerprints.has(normalizeExampleFingerprint(example))
      )
    : [];

  return uniqueNonEmptyStrings([...targetLanguageCandidates, ...fallbackExamples]).slice(
    0,
    maxExamples
  );
}

export function createTargetLanguageFallbackExamples(term: string, targetLanguageCode: string) {
  const normalizedTerm = normalizeExampleTerm(term);
  const code = normalizeLanguageCode(targetLanguageCode);
  if (!normalizedTerm) {
    return [];
  }
  if (code === "ja") {
    const quotedTerm = `「${normalizedTerm}」`;
    return [
      `${quotedTerm}はこの文で自然に使えます。`,
      `彼は${quotedTerm}という表現を使いました。`,
      `この場面では${quotedTerm}が大切な意味を持ちます。`
    ];
  }
  if (code === "ko") {
    return [
      `"${normalizedTerm}"은 이 문장에서 자연스럽게 쓰입니다.`,
      `그는 "${normalizedTerm}"이라는 표현을 사용했습니다.`,
      `이 글에서는 "${normalizedTerm}"이 중요한 역할을 합니다.`
    ];
  }
  if (code === "en") {
    return [
      `I noticed "${normalizedTerm}" in the sentence.`,
      `Try using "${normalizedTerm}" in a short reply.`,
      `The expression "${normalizedTerm}" changes the tone.`
    ];
  }
  return [];
}

export function isHighConfidenceExampleLanguageMismatch(
  example: string,
  targetLanguageCode: string
) {
  const normalizedTargetLanguageCode = normalizeLanguageCode(targetLanguageCode);
  if (!supportedLocalLanguageCodes.has(normalizedTargetLanguageCode)) {
    return false;
  }
  const detection = detectInputLanguage(example);
  return (
    detection.languageCode !== "unknown" &&
    detection.languageCode !== normalizedTargetLanguageCode &&
    detection.confidence >= 0.72
  );
}

function formatPromptLanguageLabel(language: ProfileLanguage) {
  const code = normalizeLanguageCode(language.code);
  return `${language.nameEn || code} (${code || "unknown"})`;
}

function normalizeUnknownStringList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeExampleFingerprint(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExampleTerm(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,!?;:、。！？；："'“”‘’\s]+|[.,!?;:、。！？；："'“”‘’\s]+$/g, "");
}
