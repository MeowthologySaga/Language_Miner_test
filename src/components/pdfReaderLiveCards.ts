import {
  estimateCardGenerationUsage,
  type CardGenerationUsageEstimate as CardGenerationUsageEstimateData
} from "../shared/cardGenerationUsage";
import type { AppSettings, GenerateReadingCardInput } from "../shared/types";
import type { SentenceExtractionResult } from "../utils/sentenceExtraction";

type PdfLiveCardUsageSettings = Pick<
  AppSettings,
  | "providerName"
  | "ollamaModel"
  | "geminiModel"
  | "geminiPlan"
  | "learningProfile"
  | "dailyAppTokenLimit"
  | "monthlySpendLimitKrw"
>;

export type PdfLiveCardUsageEstimate = CardGenerationUsageEstimateData;

export function createPdfLiveCardRequest(
  extraction: SentenceExtractionResult,
  learningProfile: AppSettings["learningProfile"]
): GenerateReadingCardInput {
  return {
    selectedText: extraction.selectedText,
    sourceSentence: extraction.sourceSentence,
    beforeSentence: extraction.beforeSentence,
    afterSentence: extraction.afterSentence,
    readerTextContext: extraction.normalizedFullText,
    learningProfile,
    learnerLevel: "intermediate"
  };
}

export function estimatePdfLiveCardUsage(
  extraction: SentenceExtractionResult,
  settings: PdfLiveCardUsageSettings
): PdfLiveCardUsageEstimate {
  return estimateCardGenerationUsage({
    selectedText: extraction.selectedText,
    sourceSentence: extraction.sourceSentence,
    beforeSentence: extraction.beforeSentence,
    afterSentence: extraction.afterSentence,
    readerTextContext:
      extraction.extractionConfidence === "fallback"
        ? extraction.sourceSentence
        : extraction.normalizedFullText,
    settings
  });
}
