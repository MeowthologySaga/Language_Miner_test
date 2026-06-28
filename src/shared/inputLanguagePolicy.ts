import type {
  AppSettings,
  CardLanguageMetadata,
  InputLanguageCode,
  InputLanguagePolicyStatus,
  InputLanguageSourceKind,
  LearningProfile,
  StudyCard
} from "./types";

export type InputLanguageDetection = {
  languageCode: InputLanguageCode;
  confidence: number;
  signalLength: number;
};

export type InputLanguagePolicyAssessment = {
  expectedLanguageCode: string;
  nativeLanguageCode: string;
  detectedLanguageCode: InputLanguageCode;
  actualSourceLanguageCode: InputLanguageCode | string;
  confidence: number;
  policyStatus: InputLanguagePolicyStatus;
  sourceKind: InputLanguageSourceKind;
  shouldBlock: boolean;
  message: string;
};

export type InputLanguagePolicyInput = {
  text: string;
  contextText?: string;
  learningProfile: LearningProfile;
  sourceKind?: InputLanguageSourceKind;
  override?: boolean;
  actualSourceLanguageCode?: string;
};

const supportedInputLanguageCodes = new Set(["en", "ja", "ko"]);
const highConfidenceThreshold = 0.72;

export function detectInputLanguage(text: string): InputLanguageDetection {
  const normalized = normalizeDetectionText(text);
  if (!normalized) {
    return { languageCode: "unknown", confidence: 0, signalLength: 0 };
  }

  const counts = countLanguageSignals(normalized);
  const signalLength = counts.en + counts.ja + counts.ko;
  if (signalLength < 8) {
    return { languageCode: "unknown", confidence: signalLength / 8, signalLength };
  }

  const candidates: Array<{ languageCode: InputLanguageCode; count: number }> = [
    { languageCode: "en" as const, count: counts.en },
    { languageCode: "ja" as const, count: counts.ja },
    { languageCode: "ko" as const, count: counts.ko }
  ].sort((left, right) => right.count - left.count);
  const dominant = candidates[0];
  const second = candidates[1];
  if (!dominant || dominant.count <= 0) {
    return { languageCode: "unknown", confidence: 0, signalLength };
  }

  const confidence = Math.round((dominant.count / signalLength) * 100) / 100;
  if (second && second.count > 0 && second.count / dominant.count >= 0.3) {
    return { languageCode: "unknown", confidence, signalLength };
  }
  if (confidence < 0.5) {
    return { languageCode: "unknown", confidence, signalLength };
  }

  return {
    languageCode: dominant.languageCode,
    confidence,
    signalLength
  };
}

export function assessInputLanguagePolicy(
  input: InputLanguagePolicyInput
): InputLanguagePolicyAssessment {
  const expectedLanguageCode = normalizeLanguageCode(input.learningProfile.targetLanguage.code);
  const nativeLanguageCode = normalizeLanguageCode(input.learningProfile.nativeLanguage.code);
  const detection = detectInputLanguage([input.text, input.contextText].filter(Boolean).join("\n"));
  const sourceKind = input.sourceKind ?? (input.override ? "manual_override" : "original");
  const actualSourceLanguageCode =
    normalizeLanguageCode(input.actualSourceLanguageCode) || detection.languageCode;

  let policyStatus: InputLanguagePolicyStatus = "unknown";
  if (input.override) {
    policyStatus = "override";
  } else if (
    detection.languageCode !== "unknown" &&
    supportedInputLanguageCodes.has(expectedLanguageCode) &&
    detection.confidence >= highConfidenceThreshold
  ) {
    policyStatus = detection.languageCode === expectedLanguageCode ? "match" : "mismatch";
  }

  const shouldBlock = policyStatus === "mismatch";
  return {
    expectedLanguageCode,
    nativeLanguageCode,
    detectedLanguageCode: detection.languageCode,
    actualSourceLanguageCode,
    confidence: detection.confidence,
    policyStatus,
    sourceKind,
    shouldBlock,
    message: createInputLanguagePolicyMessage({
      expectedLanguageCode,
      detectedLanguageCode: detection.languageCode,
      confidence: detection.confidence,
      policyStatus
    })
  };
}

export function createCardLanguageMetadata(
  assessment: InputLanguagePolicyAssessment
): CardLanguageMetadata {
  return {
    profileTargetLanguageCode: assessment.expectedLanguageCode,
    profileNativeLanguageCode: assessment.nativeLanguageCode,
    detectedSourceLanguageCode: assessment.detectedLanguageCode,
    actualSourceLanguageCode: assessment.actualSourceLanguageCode,
    confidence: assessment.confidence,
    policyStatus: assessment.policyStatus,
    sourceKind: assessment.sourceKind
  };
}

export function withInputLanguageMetadata<T extends StudyCard>(
  card: T,
  assessment: InputLanguagePolicyAssessment
): T {
  return {
    ...card,
    languageMetadata: createCardLanguageMetadata(assessment)
  };
}

export function assessCardInputLanguage(input: {
  card: StudyCard;
  settings: Pick<AppSettings, "learningProfile">;
  override?: boolean;
  sourceKind?: InputLanguageSourceKind;
}) {
  return assessInputLanguagePolicy({
    text: input.card.sourceSentence || input.card.frontText,
    contextText: input.card.frontText,
    learningProfile: input.settings.learningProfile,
    override: input.override,
    sourceKind: input.sourceKind
  });
}

export function isInputLanguageMismatch(assessment: InputLanguagePolicyAssessment) {
  return assessment.shouldBlock;
}

export function normalizeLanguageCode(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .split("-")[0];
}

function normalizeDetectionText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function countLanguageSignals(text: string) {
  let en = 0;
  let ja = 0;
  let ko = 0;
  for (const char of text) {
    if (/[A-Za-z]/.test(char)) {
      en += 1;
    } else if (/[\u3040-\u30ff]/u.test(char)) {
      ja += 2;
    } else if (/[\uac00-\ud7af]/u.test(char)) {
      ko += 2;
    } else if (/[\u3400-\u9fff]/u.test(char)) {
      ja += 1;
    }
  }
  return { en, ja, ko };
}

function createInputLanguagePolicyMessage(input: {
  expectedLanguageCode: string;
  detectedLanguageCode: InputLanguageCode;
  confidence: number;
  policyStatus: InputLanguagePolicyStatus;
}) {
  if (input.policyStatus === "mismatch") {
    return `현재 프로필은 ${formatLanguageCode(input.expectedLanguageCode)} 학습용이지만, 선택 문장은 ${formatLanguageCode(input.detectedLanguageCode)}로 보입니다.`;
  }
  if (input.policyStatus === "override") {
    return "언어 불일치 가능성을 사용자가 확인하고 현재 프로필에 저장했습니다.";
  }
  if (input.policyStatus === "match") {
    return "선택 문장이 현재 프로필 학습어와 일치합니다.";
  }
  return "선택 문장의 언어를 확실히 판별하지 못해 저장을 허용합니다.";
}

export function formatLanguageCode(languageCode: string) {
  if (languageCode === "en") {
    return "영어";
  }
  if (languageCode === "ja") {
    return "일본어";
  }
  if (languageCode === "ko") {
    return "한국어";
  }
  return "알 수 없는 언어";
}
