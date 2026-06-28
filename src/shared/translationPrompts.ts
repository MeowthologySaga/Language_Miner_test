import { compactPdfTranslationContextForSegments } from "./pdfTranslationContext";
import type { PdfTranslationContext, ProfileLanguage } from "./types";

export const PDF_TRANSLATION_PROMPT_VERSION = "pdf-translation-v5";
export const PDF_SEGMENT_TRANSLATION_PROMPT_VERSION = "pdf-segment-translation-v3";

type PdfTranslationPromptInput = {
  sourceLanguage: ProfileLanguage;
  outputLanguage: ProfileLanguage;
};

type PdfSegmentPromptInput = PdfTranslationPromptInput & {
  segmentCount: number;
  translationContext?: PdfTranslationContext;
};

type PdfSegmentPromptSegment = {
  id: string;
  text: string;
};

export function buildPdfTranslationSystemPrompt(input: PdfTranslationPromptInput) {
  const { sourceLanguage, outputLanguage } = input;

  return [
    `You are translating ${sourceLanguage.nameEn} text into ${outputLanguage.nameEn} for careful reading practice.`,
    `Return only the ${outputLanguage.nameEn} translation. Do not add commentary, labels, markdown, or explanations.`,
    "Preserve paragraph breaks and the rough visual structure of title pages when useful.",
    "For proper nouns, author names, publishers, book titles, chapter titles, and series titles, use an established translation only when you are confident it is widely used.",
    "If you are not confident about the established translation of a name or title, preserve the original source spelling instead of guessing.",
    "Do not invent names, translate names into unrelated words, or create malformed title translations.",
    "Do not introduce foreign-language words, romanized fragments, or script-mixed names that are not present in the source.",
    "Preserve measurement values exactly in meaning, but translate ordinary unit words naturally when the target language normally translates them.",
    ...faithfulDialogueRules(),
    "For title pages, translate the title like a book title and keep the author line clear.",
    ...koreanOutputRules(outputLanguage)
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPdfSegmentTranslationSystemPrompt(input: PdfSegmentPromptInput) {
  const { sourceLanguage, outputLanguage } = input;

  return [
    `You translate PDF text segments from ${sourceLanguage.nameEn} into ${outputLanguage.nameEn}.`,
    `The user will send a JSON object with context and exactly ${input.segmentCount} segment objects.`,
    "Return only a top-level JSON array. The first character must be [ and the last character must be ].",
    "Do not wrap the array in an object such as {\"segments\": [...]}, {\"translations\": [...]}, or {\"items\": [...]}.",
    "Do not add markdown, commentary, labels, warnings, or explanations.",
    "Each output item must contain exactly these keys: id, translationKo.",
    "The output array must contain one item for every input id, with no missing ids, duplicate ids, extra ids, merged segments, or summarized segments.",
    "Translate each segment independently enough to preserve its id, but use the provided document context when resolving pronouns and terms.",
    "Context terms are hints for consistency, not permission to leave ordinary source words untranslated.",
    "Do not omit dates, names, titles, edition details, citations, or parenthetical details.",
    "Preserve measurement values exactly in meaning, but translate ordinary unit words naturally when the target language normally translates them.",
    "Follow context.terms for consistency, but translate all ordinary words and do not invent translations for names or titles.",
    "Only preserve source spelling for terms whose policy is preserve, or for preserve_if_uncertain names/titles when no established translation is confidently known.",
    "For proper nouns, author names, publishers, book titles, chapter titles, and series titles, use an established translation only when you are confident it is widely used.",
    "If you are not confident about the established translation of a name or title, preserve the original source spelling instead of guessing.",
    "Do not introduce foreign-language words, romanized fragments, or script-mixed names that are not present in the source.",
    ...faithfulDialogueRules(),
    ...koreanOutputRules(outputLanguage)
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPdfSegmentTranslationUserPrompt(
  segments: PdfSegmentPromptSegment[],
  translationContext?: PdfTranslationContext
) {
  const compactContext = translationContext
    ? compactPdfTranslationContextForSegments(translationContext, segments)
    : undefined;

  return JSON.stringify(
    {
      context: compactContext
        ? {
            sourceLang: compactContext.sourceLang,
            targetLang: compactContext.targetLang,
            contextHash: compactContext.contextHash,
            styleGuide: compactContext.styleGuide,
            terms: compactContext.terms.map((term) => ({
              source: term.source,
              target: term.target,
              category: term.category,
              policy: term.policy,
              confidence: term.confidence
            }))
          }
        : null,
      segments: segments.map((segment) => ({
        id: segment.id,
        text: segment.text
      }))
    }
  );
}

export function buildPdfSegmentTranslationRepairUserPrompt(input: {
  segments: PdfSegmentPromptSegment[];
  previousTranslations: Array<{ id: string; translationKo: string; issues: string[] }>;
  translationContext?: PdfTranslationContext;
}) {
  const compactContext = input.translationContext
    ? compactPdfTranslationContextForSegments(input.translationContext, input.segments)
    : undefined;

  return JSON.stringify(
    {
      task: "repair_pdf_segment_translations",
      instructions: [
        "Repair only the listed segment translations.",
        "Fix the detected issues while preserving every source detail.",
        "Translate ordinary English source text into the target language; do not leave long source passages copied into the translation.",
        "Return only the same top-level JSON array shape: [{\"id\":\"...\",\"translationKo\":\"...\"}].",
        "The first character must be [ and the last character must be ]. Do not wrap the array in an object."
      ],
      context: compactContext
        ? {
            sourceLang: compactContext.sourceLang,
            targetLang: compactContext.targetLang,
            contextHash: compactContext.contextHash,
            styleGuide: compactContext.styleGuide,
            terms: compactContext.terms.map((term) => ({
              source: term.source,
              target: term.target,
              category: term.category,
              policy: term.policy,
              confidence: term.confidence
            }))
          }
        : null,
      previousTranslations: input.previousTranslations,
      segments: input.segments.map((segment) => ({
        id: segment.id,
        text: segment.text
      }))
    }
  );
}

export function buildPdfTranslationRevisionPrompt(input: {
  sourceText: string;
  previousTranslation: string;
  sourceLanguage: ProfileLanguage;
  outputLanguage: ProfileLanguage;
  issueMessages: string[];
}) {
  return [
    `Revise the previous ${input.outputLanguage.nameEn} translation of the ${input.sourceLanguage.nameEn} source text.`,
    "Fix only translation quality problems. Keep all source content, names, dates, edition details, and paragraph breaks.",
    "Return only the revised translation. Do not add commentary, labels, markdown, or explanations.",
    input.issueMessages.length
      ? `Detected problems to fix:\n${input.issueMessages.map((message) => `- ${message}`).join("\n")}`
      : "",
    "Carefully re-check every proper noun, author name, publisher, book title, chapter title, and series title against the source text.",
    "Use established translations only when confident. If uncertain, keep the original source spelling.",
    "Fix malformed or guessed title/name translations.",
    "Remove or correct any foreign-language word, romanized fragment, or script-mixed name that does not appear in the source.",
    ...faithfulDialogueRules(),
    ...koreanOutputRules(input.outputLanguage),
    "SOURCE TEXT:",
    input.sourceText,
    "PREVIOUS TRANSLATION:",
    input.previousTranslation
  ].join("\n");
}

function faithfulDialogueRules() {
  return [
    "For dialogue, subtitles, fiction, quoted speech, or humor, translate slang, profanity, adult innuendo, and sexual jokes faithfully when present in the source.",
    "Do not censor, sanitize, moralize, refuse, euphemize, or omit ordinary adult dialogue, but do not make the translation more explicit than the source."
  ];
}

function koreanOutputRules(outputLanguage: ProfileLanguage) {
  if (outputLanguage.code !== "ko") {
    return [];
  }

  return [
    "For Korean output, write natural modern Korean only.",
    "Do not output Japanese kana, Japanese grammar, Japanese words, or mixed Japanese/Korean fragments.",
    "Do not mix Chinese-style machine translation or unnecessary Chinese characters into Korean output unless they appear in a proper noun that is normally written that way.",
    "If a source phrase is unknown, keep the original English title/name rather than guessing a Japanese, Chinese, or unrelated Korean rendering."
  ];
}
