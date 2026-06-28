import { parsePdfSegmentTranslationsLenient } from "./pdfSegmentTranslations";
import {
  buildPdfSegmentTranslationRepairUserPrompt,
  buildPdfSegmentTranslationSystemPrompt,
  buildPdfSegmentTranslationUserPrompt,
  buildPdfTranslationSystemPrompt
} from "./translationPrompts";
import {
  createTranslationUsageEvent,
  DEFAULT_GEMINI_MODEL,
  estimateTranslationUsage
} from "./translationUsage";
import type {
  PdfSegmentTranslation,
  TranslatePdfSegmentsInput,
  TranslateTextInput,
  TranslationUsageEvent,
  TranslationUsageTotals
} from "./types";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

type GeminiRequestError = {
  message: string;
  status: number;
  model: string;
};

type GeminiRequestResult = {
  text: string;
  model: string;
  usage: TranslationUsageTotals;
};

const GEMINI_OVERLOAD_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const GEMINI_RETRY_DELAYS_MS = [600, 1600];

export async function translateTextWithGemini(input: TranslateTextInput): Promise<{
  translatedText: string;
  usage: TranslationUsageEvent;
}> {
  const model = normalizeGeminiModel(input.geminiModel ?? input.model);
  const sourceLanguage = input.sourceLanguage ?? {
    code: input.sourceLang?.trim() || "auto",
    nameKo: input.sourceLang?.trim() || "Source",
    nameEn: input.sourceLang?.trim() || "Source"
  };
  const outputLanguage = input.outputLanguage ?? {
    code: input.targetLang.trim() || "ko",
    nameKo: input.targetLang.trim() || "Target",
    nameEn: input.targetLang.trim() || "Target"
  };
  const estimate = estimateTranslationUsage({
    texts: [{ text: input.text, cacheStatus: "miss" }],
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  const result = await requestGeminiContent({
    apiKey: input.geminiApiKey,
    model,
    systemPrompt: buildPdfTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage
    }),
    userPrompt: input.text,
    fallbackUsage: {
      inputTokens: estimate.inputTokens.max,
      outputTokens: estimate.outputTokens.max,
      totalTokens: estimate.totalTokens.max,
      billableCharacters: input.text.length,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    }
  });

  if (!result.text.trim()) {
    throw new Error("Gemini 응답에 번역문이 없습니다.");
  }

  return {
    translatedText: result.text.trim(),
    usage: createTranslationUsageEvent({
      providerName: "gemini",
      model: result.model,
      plan: input.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: result.usage
    })
  };
}

export async function translatePdfSegmentsWithGemini(
  input: TranslatePdfSegmentsInput
): Promise<{
  translations: PdfSegmentTranslation[];
  usage: TranslationUsageEvent;
}> {
  const model = normalizeGeminiModel(input.geminiModel ?? input.model);
  const sourceLanguage = input.sourceLanguage ?? {
    code: input.sourceLang?.trim() || "auto",
    nameKo: input.sourceLang?.trim() || "Source",
    nameEn: input.sourceLang?.trim() || "Source"
  };
  const outputLanguage = input.outputLanguage ?? {
    code: input.targetLang.trim() || "ko",
    nameKo: input.targetLang.trim() || "Target",
    nameEn: input.targetLang.trim() || "Target"
  };
  const estimate = estimateTranslationUsage({
    texts: input.segments.map((segment) => ({ text: segment.text, cacheStatus: "miss" })),
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  const usageTotals: TranslationUsageTotals[] = [];
  let usageModel = model;
  const result = await requestGeminiContent({
    apiKey: input.geminiApiKey,
    model,
    responseMimeType: "application/json",
    systemPrompt: buildPdfSegmentTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage,
      segmentCount: input.segments.length,
      translationContext: input.translationContext
    }),
    userPrompt: buildPdfSegmentTranslationUserPrompt(input.segments, input.translationContext),
    fallbackUsage: {
      inputTokens: estimate.inputTokens.max,
      outputTokens: estimate.outputTokens.max,
      totalTokens: estimate.totalTokens.max,
      billableCharacters: input.segments.reduce((sum, segment) => sum + segment.text.length, 0),
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: input.segments.length
    }
  });
  usageTotals.push(result.usage);
  usageModel = result.model;

  const translationsById = new Map<string, string>();
  addParsedGeminiSegmentTranslations(translationsById, result.text, input.segments);

  let unresolvedSegments = getUnresolvedGeminiSegments(input.segments, translationsById);
  if (unresolvedSegments.length > 0) {
    const repairResult = await requestGeminiContent({
      apiKey: input.geminiApiKey,
      model,
      responseMimeType: "application/json",
      systemPrompt: buildPdfSegmentTranslationSystemPrompt({
        sourceLanguage,
        outputLanguage,
        segmentCount: unresolvedSegments.length,
        translationContext: input.translationContext
      }),
      userPrompt: buildPdfSegmentTranslationRepairUserPrompt({
        segments: unresolvedSegments,
        previousTranslations: unresolvedSegments.map((segment) => ({
          id: segment.id,
          translationKo: translationsById.get(segment.id) ?? "",
          issues: ["Gemini omitted this segment id or returned an empty translation."]
        })),
        translationContext: input.translationContext
      }),
      fallbackUsage: buildGeminiSegmentFallbackUsage(input, unresolvedSegments, model)
    });
    usageTotals.push(repairResult.usage);
    usageModel = repairResult.model;
    addParsedGeminiSegmentTranslations(translationsById, repairResult.text, unresolvedSegments);
  }

  unresolvedSegments = getUnresolvedGeminiSegments(input.segments, translationsById);
  for (const segment of unresolvedSegments) {
    const fallbackResult = await translateSinglePdfSegmentWithGeminiFallback({
      input,
      segment,
      model,
      sourceLanguage,
      outputLanguage
    });
    usageTotals.push(...fallbackResult.usageTotals);
    usageModel = fallbackResult.model;
    if (fallbackResult.translationKo) {
      translationsById.set(segment.id, fallbackResult.translationKo);
    }
  }

  const translations = input.segments.flatMap((segment) => {
    const translationKo = translationsById.get(segment.id)?.trim();
    return translationKo ? [{ id: segment.id, translationKo }] : [];
  });

  return {
    translations,
    usage: createTranslationUsageEvent({
      providerName: "gemini",
      model: usageModel,
      plan: input.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: mergeGeminiUsageTotals(usageTotals, {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: input.segments.reduce((sum, segment) => sum + segment.text.length, 0),
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: input.segments.length
      })
    })
  };
}

export async function testGeminiConnection(input: {
  apiKey?: string;
  model?: string;
}): Promise<boolean> {
  const model = normalizeGeminiModel(input.model);
  const result = await requestGeminiContent({
    apiKey: input.apiKey,
    model,
    systemPrompt: "Return only OK.",
    userPrompt: "OK",
    fallbackUsage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      billableCharacters: 2,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    }
  });
  return result.text.trim().length > 0;
}

export async function requestGeminiContent(input: {
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackUsage: TranslationUsageTotals;
  responseMimeType?: "application/json" | "text/plain";
}): Promise<GeminiRequestResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new Error("Gemini API key가 필요합니다.");
  }

  const models = getGeminiRequestModels(input.model);
  const errors: GeminiRequestError[] = [];
  for (const [modelIndex, model] of models.entries()) {
    const retryCount = modelIndex === 0 ? GEMINI_RETRY_DELAYS_MS.length + 1 : 1;
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      const result = await tryGeminiContent({
        ...input,
        apiKey,
        model
      });
      if ("payload" in result) {
        const text =
          result.payload.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("")
            .trim() ?? "";

        return {
          text,
          model,
          usage: usageTotalsFromGemini(result.payload.usageMetadata, input.fallbackUsage)
        };
      }

      errors.push(result.error);
      if (!shouldRetryGeminiError(result.error) || attempt >= retryCount - 1) {
        break;
      }
      await sleep(GEMINI_RETRY_DELAYS_MS[attempt] ?? 0);
    }

    const lastError = errors[errors.length - 1];
    if (!lastError || !shouldFallbackGeminiModel(lastError, model, models[modelIndex + 1])) {
      break;
    }
  }

  throw new Error(formatGeminiRequestError(input.model, errors));
}

async function tryGeminiContent(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackUsage: TranslationUsageTotals;
  responseMimeType?: "application/json" | "text/plain";
}): Promise<
  | { payload: GeminiGenerateContentResponse }
  | { error: GeminiRequestError }
> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      input.model
    )}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.9,
          responseMimeType: input.responseMimeType
        }
      })
    }
  );
  const payload = (await response.json()) as GeminiGenerateContentResponse;
  if (response.ok) {
    return { payload };
  }

  return {
    error: {
      message: payload.error?.message ?? `Gemini request failed: ${response.status}`,
      status: response.status,
      model: input.model
    }
  };
}

function usageTotalsFromGemini(
  usage: GeminiGenerateContentResponse["usageMetadata"],
  fallback: TranslationUsageTotals
): TranslationUsageTotals {
  if (!usage) {
    return fallback;
  }

  const inputTokens = usage.promptTokenCount ?? fallback.inputTokens;
  const knownOutputTokens =
    (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const outputTokens =
    knownOutputTokens > 0
      ? knownOutputTokens
      : Math.max(0, (usage.totalTokenCount ?? fallback.totalTokens) - inputTokens);
  const totalTokens = usage.totalTokenCount ?? inputTokens + outputTokens;

  return {
    ...fallback,
    inputTokens,
    outputTokens,
    totalTokens
  };
}

function addParsedGeminiSegmentTranslations(
  translationsById: Map<string, string>,
  responseText: string,
  expectedSegments: TranslatePdfSegmentsInput["segments"]
) {
  const parsed = parsePdfSegmentTranslationsLenient(responseText, expectedSegments).translations;
  for (const translation of parsed) {
    const translationKo = translation.translationKo.trim();
    if (translationKo) {
      translationsById.set(translation.id, translationKo);
    }
  }
}

function getUnresolvedGeminiSegments(
  segments: TranslatePdfSegmentsInput["segments"],
  translationsById: Map<string, string>
) {
  return segments.filter((segment) => !translationsById.get(segment.id)?.trim());
}

async function translateSinglePdfSegmentWithGeminiFallback(input: {
  input: TranslatePdfSegmentsInput;
  segment: TranslatePdfSegmentsInput["segments"][number];
  model: string;
  sourceLanguage: NonNullable<TranslatePdfSegmentsInput["sourceLanguage"]>;
  outputLanguage: NonNullable<TranslatePdfSegmentsInput["outputLanguage"]>;
}): Promise<{
  translationKo?: string;
  model: string;
  usageTotals: TranslationUsageTotals[];
}> {
  const usageTotals: TranslationUsageTotals[] = [];
  let model = input.model;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await requestGeminiContent({
      apiKey: input.input.geminiApiKey,
      model: input.model,
      responseMimeType: "application/json",
      systemPrompt: buildPdfSegmentTranslationSystemPrompt({
        sourceLanguage: input.sourceLanguage,
        outputLanguage: input.outputLanguage,
        segmentCount: 1,
        translationContext: input.input.translationContext
      }),
      userPrompt: buildPdfSegmentTranslationUserPrompt(
        [input.segment],
        input.input.translationContext
      ),
      fallbackUsage: buildGeminiSegmentFallbackUsage(input.input, [input.segment], input.model)
    });
    usageTotals.push(result.usage);
    model = result.model;
    const parsed = parsePdfSegmentTranslationsLenient(result.text, [input.segment]).translations;
    const translationKo = parsed
      .find((translation) => translation.id === input.segment.id)
      ?.translationKo.trim();
    if (translationKo) {
      return { translationKo, model, usageTotals };
    }
  }

  const plainResult = await requestGeminiContent({
    apiKey: input.input.geminiApiKey,
    model: input.model,
    systemPrompt: buildPdfTranslationSystemPrompt({
      sourceLanguage: input.sourceLanguage,
      outputLanguage: input.outputLanguage
    }),
    userPrompt: input.segment.text,
    fallbackUsage: buildGeminiSegmentFallbackUsage(input.input, [input.segment], input.model)
  });
  usageTotals.push(plainResult.usage);
  model = plainResult.model;
  const translationKo = plainResult.text.trim();

  return {
    translationKo: translationKo || undefined,
    model,
    usageTotals
  };
}

function buildGeminiSegmentFallbackUsage(
  input: TranslatePdfSegmentsInput,
  segments: TranslatePdfSegmentsInput["segments"],
  model: string
): TranslationUsageTotals {
  const estimate = estimateTranslationUsage({
    texts: segments.map((segment) => ({ text: segment.text, cacheStatus: "miss" })),
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });

  return {
    inputTokens: estimate.inputTokens.max,
    outputTokens: estimate.outputTokens.max,
    totalTokens: estimate.totalTokens.max,
    billableCharacters: segments.reduce((sum, segment) => sum + segment.text.length, 0),
    requestCount: 1,
    cacheHitCount: 0,
    cacheMissCount: segments.length
  };
}

function mergeGeminiUsageTotals(
  usageTotals: TranslationUsageTotals[],
  fallback: TranslationUsageTotals
): TranslationUsageTotals {
  if (usageTotals.length === 0) {
    return fallback;
  }

  return usageTotals.reduce(
    (sum, usage) => ({
      inputTokens: sum.inputTokens + usage.inputTokens,
      outputTokens: sum.outputTokens + usage.outputTokens,
      totalTokens: sum.totalTokens + usage.totalTokens,
      billableCharacters: sum.billableCharacters + usage.billableCharacters,
      requestCount: sum.requestCount + usage.requestCount,
      cacheHitCount: sum.cacheHitCount + usage.cacheHitCount,
      cacheMissCount: sum.cacheMissCount + usage.cacheMissCount
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      billableCharacters: 0,
      requestCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 0
    }
  );
}

function normalizeGeminiModel(model?: string) {
  const trimmed = model?.trim() || DEFAULT_GEMINI_MODEL;
  return trimmed.replace(/^models\//, "");
}

function getGeminiRequestModels(primaryModel: string) {
  const normalizedPrimary = normalizeGeminiModel(primaryModel);
  const fallback = normalizeGeminiModel(GEMINI_OVERLOAD_FALLBACK_MODEL);
  return normalizedPrimary === fallback
    ? [normalizedPrimary]
    : [normalizedPrimary, fallback];
}

function shouldRetryGeminiError(error: GeminiRequestError) {
  return (
    [429, 500, 502, 503, 504].includes(error.status) ||
    /high demand|overload|unavailable|rate limit|temporarily/i.test(error.message)
  );
}

function shouldFallbackGeminiModel(
  error: GeminiRequestError,
  currentModel: string,
  nextModel?: string
) {
  return Boolean(
    nextModel &&
      normalizeGeminiModel(currentModel) !== normalizeGeminiModel(nextModel) &&
      (error.status === 503 || /high demand|overload|unavailable/i.test(error.message))
  );
}

function formatGeminiRequestError(primaryModel: string, errors: GeminiRequestError[]) {
  const lastError = errors[errors.length - 1];
  if (!lastError) {
    return "Gemini request failed.";
  }

  const triedModels = Array.from(new Set(errors.map((error) => error.model))).join(", ");
  if (errors.some((error) => shouldFallbackGeminiModel(error, error.model, GEMINI_OVERLOAD_FALLBACK_MODEL))) {
    return `Gemini model is overloaded. Tried ${triedModels}. Change Settings > Gemini model to ${GEMINI_OVERLOAD_FALLBACK_MODEL} or retry later. Last error: ${lastError.message}`;
  }

  return primaryModel === lastError.model
    ? lastError.message
    : `Gemini request failed after fallback from ${primaryModel} to ${lastError.model}. Last error: ${lastError.message}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
