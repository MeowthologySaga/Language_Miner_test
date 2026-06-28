import {
  estimateCardGenerationUsage,
  type CardGenerationUsageEstimate
} from "../shared/cardGenerationUsage";
import type { AppSettings } from "../shared/types";
import type { SentenceExtractionResult } from "../utils/sentenceExtraction";

export const MAX_SENTENCE_TERMS = 10;

export type SentenceTermsSession = {
  selectedTerms: string[];
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  normalizedFullText: string;
  extractionConfidence: "high" | "medium" | "fallback";
  isSourceSentenceEdited?: boolean;
};

export type CardGenerationRequest = {
  selectedText: string;
  selectedTerms: string[];
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  readerTextContext: string;
  extractionConfidence: "high" | "medium" | "fallback";
  isSourceSentenceEdited?: boolean;
};

type CardGenerationUsageSettings = Pick<
  AppSettings,
  | "providerName"
  | "ollamaModel"
  | "geminiModel"
  | "geminiPlan"
  | "learningProfile"
  | "dailyAppTokenLimit"
  | "monthlySpendLimitKrw"
>;

export function createSentenceTermsSession(
  extraction: SentenceExtractionResult
): SentenceTermsSession {
  return {
    selectedTerms: [extraction.selectedText],
    sourceSentence: extraction.sourceSentence,
    beforeSentence: extraction.beforeSentence,
    afterSentence: extraction.afterSentence,
    normalizedFullText: extraction.normalizedFullText,
    extractionConfidence: extraction.extractionConfidence
  };
}

export function createCardRequestFromExtraction(
  extraction: SentenceExtractionResult,
  options?: {
    fallbackContext?: "normalizedFullText" | "sourceSentence";
  }
): CardGenerationRequest {
  return {
    selectedText: extraction.selectedText,
    selectedTerms: [extraction.selectedText],
    sourceSentence: extraction.sourceSentence,
    beforeSentence: extraction.beforeSentence,
    afterSentence: extraction.afterSentence,
    readerTextContext:
      options?.fallbackContext === "sourceSentence" &&
      extraction.extractionConfidence === "fallback"
        ? extraction.sourceSentence
        : extraction.normalizedFullText,
    extractionConfidence: extraction.extractionConfidence
  };
}

export function createCardRequestFromSentenceTerms(
  session: SentenceTermsSession
): CardGenerationRequest {
  return {
    selectedText: session.selectedTerms.join(", "),
    selectedTerms: session.selectedTerms,
    sourceSentence: session.sourceSentence,
    beforeSentence: session.beforeSentence,
    afterSentence: session.afterSentence,
    readerTextContext:
      session.extractionConfidence === "fallback"
        ? session.sourceSentence
        : session.normalizedFullText,
    extractionConfidence: session.extractionConfidence,
    isSourceSentenceEdited: session.isSourceSentenceEdited
  };
}

export function estimateReaderCardUsage(
  request: CardGenerationRequest,
  settings: CardGenerationUsageSettings
): CardGenerationUsageEstimate {
  return estimateCardGenerationUsage({
    selectedText: request.selectedText,
    sourceSentence: request.sourceSentence,
    beforeSentence: request.beforeSentence,
    afterSentence: request.afterSentence,
    readerTextContext: request.readerTextContext,
    settings
  });
}
