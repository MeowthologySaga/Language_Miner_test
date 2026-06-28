import { buildPdfTranslationContext } from "../shared/pdfTranslationContext";
import { PDF_SEGMENT_TRANSLATION_PROMPT_VERSION } from "../shared/translationPrompts";
import type {
  AppSettings,
  PdfTextSegment,
  PdfTranslationContext,
  TranslationCacheLookupInput,
  TranslationProviderName,
  TranslatePdfSegmentsInput
} from "../shared/types";

type PdfReaderTranslationSettings = Pick<
  AppSettings,
  | "translationProviderName"
  | "googleTranslateApiKey"
  | "geminiApiKey"
  | "geminiModel"
  | "geminiPlan"
  | "ollamaBaseUrl"
  | "ollamaModel"
  | "learningProfile"
  | "pdfExportMode"
>;

export function buildPdfReaderTranslationContext(
  segments: PdfTextSegment[],
  settings: Pick<AppSettings, "learningProfile">
) {
  return buildPdfTranslationContext({
    segments,
    sourceLang: settings.learningProfile.targetLanguage.code,
    targetLang: settings.learningProfile.nativeLanguage.code
  });
}

export function createPdfSegmentTranslationRequest(input: {
  segments: PdfTextSegment[];
  translationContext: PdfTranslationContext;
  settings: PdfReaderTranslationSettings;
  selectedTranslationModel: string;
  bypassTranslationCache: boolean;
}): TranslatePdfSegmentsInput {
  const { settings } = input;
  return {
    segments: input.segments,
    sourceLang: settings.learningProfile.targetLanguage.code,
    targetLang: settings.learningProfile.nativeLanguage.code,
    providerName: settings.translationProviderName,
    bypassCache: input.bypassTranslationCache,
    model: input.selectedTranslationModel,
    promptVersion: PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
    contextHash: input.translationContext.contextHash,
    googleApiKey: settings.googleTranslateApiKey,
    geminiApiKey: settings.geminiApiKey,
    geminiModel: settings.geminiModel,
    geminiPlan: settings.geminiPlan,
    ollamaBaseUrl: settings.ollamaBaseUrl,
    ollamaModel: settings.ollamaModel,
    sourceLanguage: settings.learningProfile.targetLanguage,
    outputLanguage: settings.learningProfile.nativeLanguage,
    translationContext: input.translationContext
  };
}

export function createPdfTranslationCacheLookupInput(input: {
  segment: PdfTextSegment;
  settings: Pick<AppSettings, "translationProviderName" | "learningProfile">;
  selectedTranslationModel: string;
  contextHash: string;
  providerName?: TranslationProviderName;
  sourceLang?: string;
  targetLang?: string;
}): TranslationCacheLookupInput {
  return {
    text: input.segment.text,
    sourceLang: input.sourceLang ?? input.settings.learningProfile.targetLanguage.code,
    targetLang: input.targetLang ?? input.settings.learningProfile.nativeLanguage.code,
    providerName: input.providerName ?? input.settings.translationProviderName,
    model: input.selectedTranslationModel,
    promptVersion: PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
    contextHash: input.contextHash
  };
}
