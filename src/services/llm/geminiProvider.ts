import type { LLMProvider } from "./types";
import { sampleReadingCard } from "./mockProvider";
import { parseJsonWithLooseEscapes } from "../../shared/jsonParsing";
import {
  requestGeminiContent,
  testGeminiConnection
} from "../../shared/geminiTranslation";
import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  HighlightColorKey,
  LearningProfile
} from "../../shared/types";
import {
  createLifeExpressionFallbackCard,
  createLifeExpressionSystemPrompt,
  createLifeExpressionUserPrompt,
  repairLifeExpressionCardConsistency
} from "./lifeExpressionCard";
import type { LifeExpressionCardDraft } from "./lifeExpressionCard";
import {
  buildCharacterChatSystemPrompt,
  buildCharacterChatUserPrompt
} from "../../shared/characterCards";
import {
  ensureBrowserSentenceSelectedTerms,
  normalizeBrowserVocabularyIpa
} from "../../shared/browserSentenceFallbackCard";
import { defaultLearningProfile } from "../../shared/languages";
import {
  createVocabularyExampleLanguageRules,
  normalizeTargetLanguageVocabularyExamples
} from "../../shared/vocabularyExampleLanguage";

type GeminiProviderOptions = {
  apiKey: string;
  model: string;
  plan?: "free" | "paid";
};

const cardColorKeys: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

export class GeminiProvider implements LLMProvider {
  name = "GeminiProvider";

  constructor(private readonly options: GeminiProviderOptions) {}

  async testConnection() {
    return testGeminiConnection({
      apiKey: this.options.apiKey,
      model: this.options.model
    });
  }

  async generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData> {
    const { targetLanguage, nativeLanguage } = input.learningProfile;
    const selectedTerms = parseSelectedTerms(input.selectedText);
    const systemPrompt = [
      "You are a precise language-learning card generator.",
      "Return valid JSON only. Do not wrap JSON in Markdown.",
      "The card is for verifying a generated word/sentence card inside the app.",
      `The learner studies ${targetLanguage.nameEn} (${targetLanguage.code}).`,
      `Explain in the learner's native language: ${nativeLanguage.nameEn} (${nativeLanguage.code}).`,
      "Keep the source sentence in the target language exactly unless the user-provided edited sentence changes it.",
      "Focus vocabularyItems on the selected word(s) or phrase(s), not on unrelated words.",
      "Use concise learner-friendly explanations.",
      "Use highlight color keys only: red, orange, blue, purple, green, pink, cyan, yellow, lime, slate.",
      "Return exactly this JSON shape:",
      JSON.stringify(createCardJsonShape(), null, 2)
    ].join("\n");

    const userPrompt = [
      `Selected ${targetLanguage.nameEn} word(s)/phrase(s): ${selectedTerms.join(", ") || input.selectedText}`,
      `Source sentence: ${input.sourceSentence}`,
      input.beforeSentence ? `Before sentence: ${input.beforeSentence}` : "",
      input.afterSentence ? `After sentence: ${input.afterSentence}` : "",
      input.readerTextContext ? `Reader context: ${input.readerTextContext.slice(0, 2200)}` : "",
      input.translationContext ? `Additional context: ${input.translationContext}` : "",
      "Rules:",
      "- cardType must be \"reading\".",
      "- deckType must be \"input\" and direction must be \"target_to_native\".",
      "- frontText should be the full source sentence, with selected term(s) learnable from context.",
      "- highlightMappings must include each selected term if it appears in the sentence.",
      "- Keep the legacy field names literalTranslationKo, naturalTranslationKo, literalKo, naturalKo for app compatibility, but write their values in the learner's native language.",
      "- Each highlightMappings item must include literalKo and naturalKo as exact substrings that appear in literalTranslationKo and naturalTranslationKo, so the UI can color the chosen term in both native-language translations.",
      "- literalTranslationKo must be a structure-following literal translation in the learner's native language; it may sound slightly awkward if that reveals the source structure.",
      "- naturalTranslationKo must be a natural meaning translation in the learner's native language, suitable as a native-to-target writing-practice prompt.",
      "- vocabularyItems must include each selected term, with IPA, part of speech, basic meaning, context meaning, etymologyKo, usagePatterns, and exactly 3 short examples. Legacy *Ko fields must still be written in the learner's native language.",
      ...createVocabularyExampleLanguageRules(input.learningProfile),
      "- vocabularyItems[].ipa must be real IPA only, wrapped in slashes like /ˈwɝːd/. Do not use English respelling such as \"en gee el\", Hangul, or explanatory text. For acronyms, use letter-name IPA like /en dʒiː el/. Leave ipa empty only if genuinely unknown.",
      "- For internet slang or acronyms such as NGL, TBH, IMO, or IDK, keep the selected acronym as vocabularyItems[].term, put the expanded form in etymologyKo and usagePatterns as \"Expanded form: ...\", and prefer nuance comparisons such as \"NGL vs TBH\" over generic synonym comparisons.",
      "- Do not reuse the source sentence as a vocabulary example. Each examples[] item must be a new sentence.",
      "- Put only the selected term's origin, morphology, or memory-friendly word/phrase structure in vocabularyItems[].etymologyKo. Never put source URL, browser collection info, app metadata, or capture notes there.",
      "- Put common reusable forms and at least one collocation in vocabularyItems[].usagePatterns. Prefix collocation entries with \"Collocation:\".",
      "- confusingComparisons is required: include at least one comparison for each selected term.",
      "- Each confusingComparisons item must include kind, one of: \"similar\", \"contrast\", \"nuance\", \"collocation\".",
      "- Pick the most useful kind for the term: similar = near-synonym usage difference, contrast = useful opposite/opposed state, nuance = strength/register/tone difference, collocation = words that combine naturally with one term but not the other.",
      "- Each confusingComparisons title must use a concrete alternative, e.g. \"encounter vs meet\". Never use placeholders like \"similar expression\", \"similar word\", or \"selected term\".",
      "- Each confusingComparisons explanationKo must explain when the selected term fits, when the alternative fits, and include one short target-language example for each side.",
      "- structureNote should be an empty string for input reading cards.",
      "- pumpPrompts must be an empty array for input reading cards; writing practice is derived from naturalTranslationKo."
    ]
      .filter(Boolean)
      .join("\n");

    const generated = await this.generateCardJson(
      systemPrompt,
      userPrompt,
      () => sampleReadingCard(input.sourceSentence, selectedTerms, input.learningProfile),
      { learningProfile: input.learningProfile, selectedTerms }
    );
    return ensureBrowserSentenceSelectedTerms(generated, input.selectedText, cardColorKeys, {
      targetLanguageCode: targetLanguage.code
    });
  }

  async generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData> {
    return this.generateCardJson(
      createLifeExpressionSystemPrompt(input),
      createLifeExpressionUserPrompt(input),
      () => createLifeExpressionFallbackCard(input)
    );
  }

  async generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string> {
    const systemPrompt = buildCharacterChatSystemPrompt({
      character: input.character,
      ragHints: input.ragHints
    });
    const userPrompt = buildCharacterChatUserPrompt({
      character: input.character,
      messages: input.messages,
      userMessage: input.userMessage
    });
    const estimateTextLength = systemPrompt.length + userPrompt.length;
    const result = await requestGeminiContent({
      apiKey: this.options.apiKey,
      model: this.options.model,
      systemPrompt,
      userPrompt,
      fallbackUsage: {
        inputTokens: Math.ceil(estimateTextLength / 4),
        outputTokens: 360,
        totalTokens: Math.ceil(estimateTextLength / 4) + 360,
        billableCharacters: estimateTextLength,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });
    const reply = result.text.trim();
    if (!reply) {
      throw new Error("Gemini returned an empty character reply.");
    }
    return stripCharacterPrefix(reply, input.character.name);
  }

  private async generateCardJson(
    systemPrompt: string,
    userPrompt: string,
    fallback: () => GeneratedCardData,
    options: { learningProfile?: LearningProfile; selectedTerms?: string[] } = {}
  ): Promise<GeneratedCardData> {
    const estimateTextLength = systemPrompt.length + userPrompt.length;
    const result = await requestGeminiContent({
      apiKey: this.options.apiKey,
      model: this.options.model,
      responseMimeType: "application/json",
      systemPrompt,
      userPrompt,
      fallbackUsage: {
        inputTokens: Math.ceil(estimateTextLength / 4),
        outputTokens: 900,
        totalTokens: Math.ceil(estimateTextLength / 4) + 900,
        billableCharacters: estimateTextLength,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });

    const parsed = parseJsonFromText(result.text);
    return normalizeGeneratedCard({
      ...fallback(),
      ...parsed
    }, options.learningProfile, options.selectedTerms);
  }
}

function stripCharacterPrefix(reply: string, characterName: string) {
  return reply.replace(new RegExp(`^\\s*${escapeRegExp(characterName)}\\s*:\\s*`, "i"), "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseJsonFromText(text: string): Partial<LifeExpressionCardDraft> {
  try {
    return parseJsonWithLooseEscapes(text) as Partial<LifeExpressionCardDraft>;
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return parseJsonWithLooseEscapes(text.slice(first, last + 1)) as Partial<LifeExpressionCardDraft>;
    }
    throw new Error("Gemini did not return parseable card JSON.");
  }
}

function normalizeGeneratedCard(
  card: LifeExpressionCardDraft,
  learningProfile?: LearningProfile,
  selectedTerms?: string[]
): GeneratedCardData {
  const fallback =
    card.cardType === "life_expression"
      ? createLifeExpressionFallbackCard({
          koreanText: card.sourceSentence || card.targetText || card.frontText || "",
          learningProfile: learningProfile ?? defaultLearningProfile
        })
      : sampleReadingCard(card.sourceSentence || card.frontText || "", selectedTerms, learningProfile);
  const cardType = card.cardType ?? fallback.cardType;
  const deckType = card.deckType ?? fallback.deckType ?? (cardType === "life_expression" ? "output" : "input");
  const isInputReadingCard = cardType === "reading" && deckType === "input";
  const targetLanguageCode =
    learningProfile?.targetLanguage.code || card.languageMetadata?.profileTargetLanguageCode;
  const normalized: LifeExpressionCardDraft = {
    ...fallback,
    ...card,
    cardType,
    deckType,
    sourceSentence: card.sourceSentence?.trim() || fallback.sourceSentence,
    frontText: card.frontText?.trim() || card.sourceSentence?.trim() || fallback.frontText,
    literalTranslationKo: card.literalTranslationKo?.trim() || fallback.literalTranslationKo,
    naturalTranslationKo: card.naturalTranslationKo?.trim() || fallback.naturalTranslationKo,
    highlightMappings: Array.isArray(card.highlightMappings)
      ? card.highlightMappings.slice(0, cardColorKeys.length).map((mapping, index) => ({
          sourceText: String(mapping.sourceText ?? "").trim(),
          literalKo: mapping.literalKo ? String(mapping.literalKo) : undefined,
          naturalKo: mapping.naturalKo ? String(mapping.naturalKo) : undefined,
          colorKey: normalizeColorKey(mapping.colorKey, index)
        })).filter((mapping) => mapping.sourceText)
      : fallback.highlightMappings,
    vocabularyItems: Array.isArray(card.vocabularyItems)
      ? card.vocabularyItems.slice(0, cardColorKeys.length).map((item, index) => ({
          ...normalizeVocabularyItem(
            item,
            fallback.vocabularyItems[index],
            card,
            index,
            targetLanguageCode
          )
        })).filter((item) => item.term)
      : fallback.vocabularyItems,
    structureNote: isInputReadingCard ? "" : card.structureNote ?? fallback.structureNote,
    confusingComparisons: Array.isArray(card.confusingComparisons)
      ? card.confusingComparisons
      : fallback.confusingComparisons,
    pumpPrompts: isInputReadingCard
      ? []
      : Array.isArray(card.pumpPrompts)
        ? card.pumpPrompts
        : fallback.pumpPrompts,
    answerCandidates: card.answerCandidates
  };
  return repairLifeExpressionCardConsistency(normalized);
}

function normalizeVocabularyItem(
  item: GeneratedCardData["vocabularyItems"][number],
  fallbackItem: GeneratedCardData["vocabularyItems"][number] | undefined,
  card: GeneratedCardData,
  index: number,
  targetLanguageCode?: string
) {
  const term = String(item.term ?? "").trim();
  return {
    term,
    ipa: normalizeBrowserVocabularyIpa(
      String(item.term ?? fallbackItem?.term ?? ""),
      item.ipa,
      fallbackItem?.ipa
    ),
    partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech) : fallbackItem?.partOfSpeech,
    basicMeaningKo: String(item.basicMeaningKo ?? fallbackItem?.basicMeaningKo ?? "의미 확인 필요"),
    meaningInContextKo: item.meaningInContextKo
      ? String(item.meaningInContextKo)
      : fallbackItem?.meaningInContextKo,
    etymologyKo: normalizeLearningNote(item.etymologyKo, fallbackItem?.etymologyKo),
    usagePatterns: normalizeUsagePatterns(item.usagePatterns, fallbackItem?.usagePatterns, item.term),
    colorKey: normalizeColorKey(item.colorKey, index),
    examples: normalizeVocabularyExamples(
      item.examples,
      fallbackItem?.examples,
      card,
      term,
      targetLanguageCode
    )
  };
}

function normalizeUsagePatterns(value: unknown, fallbackValue: string[] | undefined, term: unknown) {
  const normalizedTerm = String(term ?? "").trim();
  const candidates = [
    ...(Array.isArray(value) ? value : []),
    normalizedTerm ? `Collocation: "${normalizedTerm}" + noun/verb` : "",
    ...(Array.isArray(fallbackValue) ? fallbackValue : [])
  ];
  const unique = uniqueNonEmptyStrings(candidates);
  const collocation = unique.find((pattern) => /collocation/i.test(pattern));
  const ordered = collocation
    ? [collocation, ...unique.filter((pattern) => pattern !== collocation)]
    : unique;
  return ordered.slice(0, 4);
}

function normalizeLearningNote(value: unknown, fallbackValue?: string) {
  const candidates = [value, fallbackValue];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized || isCollectionMetadataNote(normalized)) {
      continue;
    }
    return normalized;
  }
  return undefined;
}

function isCollectionMetadataNote(value: string) {
  return /수집|출처|브라우저|확장|URL|https?:\/\/|reddit|metadata|메타데이터|capture|captured|source page|selected text|문장카드입니다/i.test(
    value
  );
}

function normalizeVocabularyExamples(
  value: unknown,
  fallbackValue: string[] | undefined,
  card: GeneratedCardData,
  term: string,
  targetLanguageCode?: string
) {
  return normalizeTargetLanguageVocabularyExamples({
    values: value,
    fallbackValues: fallbackValue,
    term,
    sourceTexts: [card.sourceSentence, card.frontText],
    targetLanguageCode
  });
}

function uniqueNonEmptyStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
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

function normalizeColorKey(value: unknown, index: number): HighlightColorKey {
  return cardColorKeys.includes(value as HighlightColorKey)
    ? (value as HighlightColorKey)
    : cardColorKeys[index % cardColorKeys.length];
}

function parseSelectedTerms(selectedText: string) {
  const terms = selectedText
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.length ? terms.slice(0, cardColorKeys.length) : [selectedText.trim()].filter(Boolean);
}

function createCardJsonShape(overrides: Partial<GeneratedCardData> = {}) {
  return {
    cardType: overrides.cardType ?? "reading",
    deckType: overrides.deckType ?? "input",
    direction: overrides.direction ?? "target_to_native",
    sourceSentence: "source sentence",
    targetText: "",
    frontText: "source sentence",
    literalTranslationKo: "literal explanation in native language",
    naturalTranslationKo: "natural translation/explanation in native language",
    highlightMappings: [
      {
        sourceText: "selected term",
        literalKo: "literal meaning",
        naturalKo: "context meaning",
        colorKey: "red"
      }
    ],
    vocabularyItems: [
      {
        term: "selected term",
        ipa: "",
        partOfSpeech: "noun/verb/adjective/etc.",
        basicMeaningKo: "basic meaning in native language",
        meaningInContextKo: "meaning in this sentence",
        etymologyKo: "term origin, morphology, or memory-friendly structure only; no source/capture metadata",
        usagePatterns: ["Collocation: selected term + noun", "common pattern 1", "common pattern 2"],
        colorKey: "red",
        examples: [
          "new short target-language example 1",
          "new short target-language example 2",
          "new short target-language example 3"
        ]
      }
    ],
    structureNote: "",
    confusingComparisons: [
      {
        kind: "similar",
        title: "encounter vs meet",
        explanationKo: "short distinction in native language with one example sentence for each side"
      }
    ],
    pumpPrompts: []
  };
}
