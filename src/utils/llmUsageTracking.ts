import type { LLMProvider } from "../services/llm/types";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage
} from "../shared/translationUsage";
import type {
  AppSettings,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  TranslationProviderName
} from "../shared/types";
import { recordTranslationUsageEvent } from "./translationUsageLedger";

export function createUsageTrackedProvider(
  provider: LLMProvider,
  settings: AppSettings
): LLMProvider {
  if (settings.providerName === "mock") {
    return provider;
  }

  return {
    name: provider.name,
    async testConnection() {
      const ok = await provider.testConnection();
      if (ok) {
        recordEstimatedLlmUsage({
          settings,
          sourceLang: settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code,
          text: "Card engine connection test."
        });
      }
      return ok;
    },
    async generateReadingCard(input: GenerateReadingCardInput) {
      const result = await provider.generateReadingCard(input);
      recordEstimatedLlmUsage({
        settings,
        sourceLang: input.learningProfile.targetLanguage.code,
        targetLang: input.learningProfile.nativeLanguage.code,
        text: buildReadingCardUsageText(input)
      });
      return result;
    },
    async generateLifeExpressionCard(input: GenerateLifeExpressionCardInput) {
      const result = await provider.generateLifeExpressionCard(input);
      recordEstimatedLlmUsage({
        settings,
        sourceLang: input.learningProfile.nativeLanguage.code,
        targetLang: input.learningProfile.targetLanguage.code,
        text: buildLifeExpressionUsageText(input)
      });
      return result;
    },
    async generateCharacterChatReply(input: GenerateCharacterChatReplyInput) {
      const result = await provider.generateCharacterChatReply(input);
      recordEstimatedLlmUsage({
        settings,
        sourceLang: settings.learningProfile.nativeLanguage.code,
        targetLang: settings.learningProfile.targetLanguage.code,
        text: buildCharacterChatUsageText(input)
      });
      return result;
    }
  };
}

function recordEstimatedLlmUsage(input: {
  settings: AppSettings;
  sourceLang: string;
  targetLang: string;
  text: string;
}) {
  const provider = getUsageProvider(input.settings);
  if (!provider) {
    return;
  }

  const estimate = estimateTranslationUsage({
    texts: [{ text: input.text, cacheStatus: "miss" }],
    providerName: provider.providerName,
    model: provider.model,
    plan: input.settings.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    dailyAppTokenLimit: input.settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: input.settings.monthlySpendLimitKrw
  });

  recordTranslationUsageEvent(
    createTranslationUsageEvent({
      profileId: input.settings.profileId,
      providerName: provider.providerName,
      model: estimate.model,
      plan: input.settings.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: estimate.billableCharacters,
        requestCount: estimate.requestCount,
        cacheHitCount: estimate.cacheHitCount,
        cacheMissCount: estimate.cacheMissCount
      }
    })
  );
}

function getUsageProvider(settings: AppSettings): {
  providerName: TranslationProviderName;
  model: string;
} | null {
  if (settings.providerName === "gemini") {
    return {
      providerName: "gemini",
      model: settings.geminiModel
    };
  }
  if (settings.providerName === "ollama") {
    return {
      providerName: "local",
      model: settings.ollamaModel
    };
  }
  return null;
}

function buildReadingCardUsageText(input: GenerateReadingCardInput) {
  return [
    `Selected: ${input.selectedText}`,
    `Source sentence: ${input.sourceSentence}`,
    input.beforeSentence ? `Before sentence: ${input.beforeSentence}` : "",
    input.afterSentence ? `After sentence: ${input.afterSentence}` : "",
    input.readerTextContext ? `Reader context: ${input.readerTextContext.slice(0, 2200)}` : "",
    input.translationContext ? `Additional context: ${input.translationContext}` : "",
    "Generate one structured reading card as JSON with translations, vocabulary, comparisons, and examples."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLifeExpressionUsageText(input: GenerateLifeExpressionCardInput) {
  return [
    input.beforeContext ? `Before context:\n${input.beforeContext}` : "",
    `User expression:\n${input.koreanText}`,
    input.afterContext ? `After context:\n${input.afterContext}` : "",
    "Generate one structured life-expression card as JSON with variants, pattern notes, and practice prompts."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCharacterChatUsageText(input: GenerateCharacterChatReplyInput) {
  return [
    `Character: ${input.character.name}`,
    `Description: ${input.character.description}`,
    `Personality: ${input.character.personality}`,
    `Scenario: ${input.character.scenario}`,
    input.messages.length
      ? `Recent messages:\n${input.messages
          .slice(-6)
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n")}`
      : "",
    input.ragHints.length
      ? `Card hints:\n${input.ragHints
          .map((hint) => `${hint.terms.join(", ")}: ${hint.sourceSentence}`)
          .join("\n")}`
      : "",
    `User message: ${input.userMessage}`,
    "Generate one in-character learner-friendly reply."
  ]
    .filter(Boolean)
    .join("\n\n");
}
