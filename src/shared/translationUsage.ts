import type {
  AppSettings,
  GeminiPlan,
  ProfileId,
  TranslationProviderName,
  TranslationUsageEvent,
  TranslationUsageTotals
} from "./types";
import { DEFAULT_PROFILE_ID } from "./profiles";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_LOCAL_MT_MODEL = "Xenova/nllb-200-distilled-600M";
export const DEFAULT_DAILY_APP_TOKEN_LIMIT = 500_000;
export const DEFAULT_MONTHLY_SPEND_LIMIT_KRW = 5_000;
export const DEFAULT_USD_TO_KRW = 1400;

const googleTranslateUsdPerMillionCharacters = 20;

type TokenPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type EstimateText = {
  text: string;
  cacheStatus?: "hit" | "miss";
};

export type TranslationUsageEstimateInput = {
  texts: EstimateText[];
  providerName: TranslationProviderName;
  model?: string;
  plan?: GeminiPlan;
  sourceLang?: string;
  targetLang: string;
  dailyAppTokenLimit?: number;
  monthlySpendLimitKrw?: number;
  usdToKrw?: number;
};

export type TranslationUsageEstimate = {
  providerName: TranslationProviderName;
  model: string;
  plan?: GeminiPlan;
  sourceLang: string;
  targetLang: string;
  textCount: number;
  totalCharacters: number;
  billableCharacters: number;
  cacheHitCount: number;
  cacheMissCount: number;
  cacheSavingsPercent: number;
  requestCount: number;
  inputTokens: {
    min: number;
    max: number;
  };
  outputTokens: {
    min: number;
    max: number;
  };
  totalTokens: {
    min: number;
    max: number;
  };
  estimatedCostKrw: {
    min: number;
    max: number;
  };
  dailyLimitUsagePercent: {
    min: number;
    max: number;
  };
  monthlyLimitUsagePercent: {
    min: number;
    max: number;
  };
  freeTier: boolean;
  localOnly: boolean;
};

export function getTranslationModelName(settings: AppSettings) {
  if (settings.translationProviderName === "local") {
    return settings.ollamaModel;
  }
  if (settings.translationProviderName === "browser") {
    return "browser-translator";
  }
  if (settings.translationProviderName === "localMt") {
    return settings.localMtModel || DEFAULT_LOCAL_MT_MODEL;
  }
  if (settings.translationProviderName === "gemini") {
    return settings.geminiModel || DEFAULT_GEMINI_MODEL;
  }
  return "google-translate-v2";
}

export function getTranslationProviderLabel(settings: AppSettings) {
  if (settings.translationProviderName === "browser") {
    return "브라우저 내장";
  }
  if (settings.translationProviderName === "localMt") {
    return "로컬 번역기";
  }
  if (settings.translationProviderName === "local") {
    return "Ollama LLM";
  }
  if (settings.translationProviderName === "gemini") {
    return settings.geminiPlan === "free" ? "Gemini 무료" : "Gemini 유료";
  }
  return "Google 번역";
}

export function estimateTranslationUsage(
  input: TranslationUsageEstimateInput
): TranslationUsageEstimate {
  const model = normalizeModel(input.providerName, input.model);
  const plan = input.plan ?? "free";
  const sourceLang = input.sourceLang?.trim() || "auto";
  const targetLang = input.targetLang.trim() || "ko";
  const dailyLimit = Math.max(1, input.dailyAppTokenLimit ?? DEFAULT_DAILY_APP_TOKEN_LIMIT);
  const monthlyLimit = Math.max(0, input.monthlySpendLimitKrw ?? DEFAULT_MONTHLY_SPEND_LIMIT_KRW);
  const usdToKrw = input.usdToKrw ?? DEFAULT_USD_TO_KRW;

  const texts = input.texts.map((item) => ({
    ...item,
    cacheStatus: item.cacheStatus ?? "miss"
  }));
  const totalCharacters = texts.reduce((sum, item) => sum + item.text.length, 0);
  const missTexts = texts.filter((item) => item.cacheStatus !== "hit");
  const hitTexts = texts.filter((item) => item.cacheStatus === "hit");
  const billableCharacters = missTexts.reduce((sum, item) => sum + item.text.length, 0);
  const uncachedTokens = estimateTokenRangeForTexts(missTexts.map((item) => item.text));
  const allTokens = estimateTokenRangeForTexts(texts.map((item) => item.text));
  const requestCount = estimateRequestCount(input.providerName, missTexts.length);
  const overhead = estimatePromptOverhead(input.providerName, requestCount);
  const inputTokens = {
    min: uncachedTokens.min + overhead.min,
    max: uncachedTokens.max + overhead.max
  };
  const outputRatio = getOutputTokenRatio(sourceLang, targetLang);
  const outputTokens = {
    min: Math.ceil(inputTokens.min * outputRatio.min),
    max: Math.ceil(inputTokens.max * outputRatio.max)
  };
  const totalTokens = {
    min: inputTokens.min + outputTokens.min,
    max: inputTokens.max + outputTokens.max
  };
  const estimatedCostKrw = estimateCostKrw({
    providerName: input.providerName,
    model,
    plan,
    usage: {
      inputTokens: inputTokens.min,
      outputTokens: outputTokens.min,
      totalTokens: totalTokens.min,
      billableCharacters,
      requestCount,
      cacheHitCount: hitTexts.length,
      cacheMissCount: missTexts.length
    },
    maxUsage: {
      inputTokens: inputTokens.max,
      outputTokens: outputTokens.max,
      totalTokens: totalTokens.max,
      billableCharacters,
      requestCount,
      cacheHitCount: hitTexts.length,
      cacheMissCount: missTexts.length
    },
    usdToKrw
  });

  return {
    providerName: input.providerName,
    model,
    plan: input.providerName === "gemini" ? plan : undefined,
    sourceLang,
    targetLang,
    textCount: texts.length,
    totalCharacters,
    billableCharacters,
    cacheHitCount: hitTexts.length,
    cacheMissCount: missTexts.length,
    cacheSavingsPercent: allTokens.max
      ? Math.round(((allTokens.max - uncachedTokens.max) / allTokens.max) * 100)
      : 0,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostKrw,
    dailyLimitUsagePercent: {
      min: Math.min(100, Math.round((totalTokens.min / dailyLimit) * 100)),
      max: Math.min(100, Math.round((totalTokens.max / dailyLimit) * 100))
    },
    monthlyLimitUsagePercent: {
      min: monthlyLimit > 0 ? Math.min(100, Math.round((estimatedCostKrw.min / monthlyLimit) * 100)) : 0,
      max: monthlyLimit > 0 ? Math.min(100, Math.round((estimatedCostKrw.max / monthlyLimit) * 100)) : 0
    },
    freeTier: input.providerName === "gemini" && plan === "free",
    localOnly:
      input.providerName === "local" ||
      input.providerName === "localMt" ||
      input.providerName === "browser"
  };
}

export function createTranslationUsageEvent(input: {
  profileId?: ProfileId;
  providerName: TranslationProviderName;
  model?: string;
  plan?: GeminiPlan;
  sourceLang?: string;
  targetLang: string;
  usage: TranslationUsageTotals;
  createdAt?: string;
  usdToKrw?: number;
}): TranslationUsageEvent {
  const providerName = input.providerName;
  const model = normalizeModel(providerName, input.model);
  const plan = input.plan ?? "free";
  const estimatedCostKrw = estimateCostKrw({
    providerName,
    model,
    plan,
    usage: input.usage,
    maxUsage: input.usage,
    usdToKrw: input.usdToKrw ?? DEFAULT_USD_TO_KRW
  });

  return {
    profileId: normalizeProfileId(input.profileId),
    providerName,
    model,
    plan: providerName === "gemini" ? plan : undefined,
    sourceLang: input.sourceLang?.trim() || "auto",
    targetLang: input.targetLang.trim() || "ko",
    usage: input.usage,
    estimatedCostKrw,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function normalizeProfileId(profileId: string | undefined) {
  return profileId?.trim() || DEFAULT_PROFILE_ID;
}

export function estimateTokenRangeForTexts(texts: string[]) {
  return texts.reduce(
    (sum, text) => {
      const range = estimateTokenRange(text);
      return {
        min: sum.min + range.min,
        max: sum.max + range.max
      };
    },
    { min: 0, max: 0 }
  );
}

export function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${trimTrailingZero(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${trimTrailingZero(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

export function formatKrwRange(range: { min: number; max: number }) {
  if (range.min === 0 && range.max === 0) {
    return "₩0";
  }
  if (Math.abs(range.max - range.min) <= 1) {
    return `약 ₩${Math.round(range.max).toLocaleString("ko-KR")}`;
  }
  return `약 ₩${Math.round(range.min).toLocaleString("ko-KR")} ~ ₩${Math.round(
    range.max
  ).toLocaleString("ko-KR")}`;
}

function estimateTokenRange(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return { min: 0, max: 0 };
  }

  let ascii = 0;
  let cjk = 0;
  let other = 0;
  for (const char of compact) {
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char)) {
      cjk += 1;
    } else if (/[\x00-\x7f]/u.test(char)) {
      ascii += 1;
    } else {
      other += 1;
    }
  }

  return {
    min: Math.max(1, Math.ceil(ascii / 4.8 + cjk / 1.8 + other / 3.4)),
    max: Math.max(1, Math.ceil(ascii / 3.2 + cjk / 1.05 + other / 2.2))
  };
}

function getOutputTokenRatio(sourceLang: string, targetLang: string) {
  if (sourceLang === "en" && targetLang === "ko") {
    return { min: 0.65, max: 1.35 };
  }
  if (targetLang === "en") {
    return { min: 0.85, max: 1.65 };
  }
  return { min: 0.75, max: 1.5 };
}

function estimateRequestCount(providerName: TranslationProviderName, missTextCount: number) {
  if (missTextCount === 0) {
    return 0;
  }

  const batchSize = providerName === "local" ? 4 : providerName === "localMt" ? 16 : 8;
  return providerName === "google"
    ? missTextCount
    : Math.max(1, Math.ceil(missTextCount / batchSize));
}

function estimatePromptOverhead(providerName: TranslationProviderName, requestCount: number) {
  if (
    providerName === "google" ||
    providerName === "browser" ||
    providerName === "localMt" ||
    requestCount === 0
  ) {
    return { min: 0, max: 0 };
  }
  return {
    min: requestCount * 450,
    max: requestCount * 1100
  };
}

function estimateCostKrw(input: {
  providerName: TranslationProviderName;
  model: string;
  plan: GeminiPlan;
  usage: TranslationUsageTotals;
  maxUsage: TranslationUsageTotals;
  usdToKrw: number;
}) {
  if (
    input.providerName === "local" ||
    input.providerName === "localMt" ||
    input.providerName === "browser" ||
    (input.providerName === "gemini" && input.plan === "free")
  ) {
    return { min: 0, max: 0 };
  }

  if (input.providerName === "google") {
    const cost = (input.usage.billableCharacters / 1_000_000) *
      googleTranslateUsdPerMillionCharacters *
      input.usdToKrw;
    return {
      min: Math.round(cost),
      max: Math.round(cost)
    };
  }

  const price = getGeminiPaidTokenPrice(input.model);
  const minUsd =
    (input.usage.inputTokens / 1_000_000) * price.inputUsdPerMillion +
    (input.usage.outputTokens / 1_000_000) * price.outputUsdPerMillion;
  const maxUsd =
    (input.maxUsage.inputTokens / 1_000_000) * price.inputUsdPerMillion +
    (input.maxUsage.outputTokens / 1_000_000) * price.outputUsdPerMillion;
  return {
    min: Math.round(minUsd * input.usdToKrw),
    max: Math.round(maxUsd * input.usdToKrw)
  };
}

function getGeminiPaidTokenPrice(model: string): TokenPrice {
  const normalized = model.toLowerCase();
  if (normalized.includes("flash-lite")) {
    return { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 };
  }
  if (normalized.includes("2.5-pro")) {
    return { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 };
  }
  if (normalized.includes("3.1-flash-lite")) {
    return { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5 };
  }
  if (normalized.includes("3.5-flash")) {
    return { inputUsdPerMillion: 1.5, outputUsdPerMillion: 9 };
  }
  return { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 };
}

function normalizeModel(providerName: TranslationProviderName, model?: string) {
  const trimmed = model?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (providerName === "gemini") {
    return DEFAULT_GEMINI_MODEL;
  }
  if (providerName === "google") {
    return "google-translate-v2";
  }
  if (providerName === "browser") {
    return "browser-translator";
  }
  if (providerName === "localMt") {
    return DEFAULT_LOCAL_MT_MODEL;
  }
  return "local";
}

function trimTrailingZero(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}
