import type {
  PdfSegmentTranslation,
  TranslatePdfSegmentsInput,
  TranslateTextInput
} from "./types";
import { DEFAULT_LOCAL_MT_MODEL } from "./translationUsage";

type TranslationOutputItem = {
  translation_text?: string;
  generated_text?: string;
};

type LocalMtPipeline = {
  (
    text: string | string[],
    options?: Record<string, unknown>
  ): Promise<TranslationOutputItem[]>;
  dispose?: () => Promise<void> | void;
};

type TransformersModule = typeof import("@huggingface/transformers");

type LocalMtRuntimeOptions = {
  cacheDir?: string;
};

const localMtPipelinePromises = new Map<string, Promise<LocalMtPipeline>>();
const localMtMaxUnitLength = 360;
const localMtBatchSize = 8;

export async function testLocalMtSetup(
  model: string | undefined,
  options: LocalMtRuntimeOptions = {}
) {
  await getTransformersModule(options);
  return normalizeLocalMtModel(model);
}

export async function translateTextWithLocalMtPipeline(
  input: TranslateTextInput,
  options: LocalMtRuntimeOptions = {}
) {
  const model = normalizeLocalMtModel(input.model);
  const pipeline = await getLocalMtPipeline(model, options);
  const translatedText = await translateLocalMtText(input.text, input, model, pipeline);
  if (!translatedText) {
    throw new Error("Local MT returned an empty translation.");
  }

  return translatedText;
}

export async function translatePdfSegmentsWithLocalMtPipeline(
  input: TranslatePdfSegmentsInput,
  options: LocalMtRuntimeOptions = {}
): Promise<PdfSegmentTranslation[]> {
  const model = normalizeLocalMtModel(input.model);
  const pipeline = await getLocalMtPipeline(model, options);
  const translations: PdfSegmentTranslation[] = [];
  for (const segment of input.segments) {
    const translationKo = await translateLocalMtText(segment.text, input, model, pipeline);
    if (translationKo) {
      translations.push({ id: segment.id, translationKo });
    }
  }

  return translations;
}

export function splitLocalMtTextUnits(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const sentenceUnits = normalized
    .split(/(?<=[.!?。！？])\s+(?=["“‘'(\[]?[A-Z0-9가-힣])/)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const units = sentenceUnits.length > 1 ? sentenceUnits : [normalized];
  return units.flatMap((unit) => splitLongLocalMtUnit(unit));
}

export function assessLocalMtOutput(input: {
  sourceText: string;
  translatedText: string;
  targetLang?: string;
}) {
  const translatedText = input.translatedText.replace(/\s+/g, " ").trim();
  if (!translatedText) {
    return { ok: false, reason: "empty" };
  }

  if (hasRepeatedPhraseLoop(translatedText)) {
    return { ok: false, reason: "repetition" };
  }

  if (isOutputTooLong(input.sourceText, translatedText)) {
    return { ok: false, reason: "too-long" };
  }

  if (isKoreanTarget(input.targetLang) && looksLikeWrongLanguage(translatedText)) {
    return { ok: false, reason: "wrong-language" };
  }

  return { ok: true };
}

async function translateLocalMtText(
  text: string,
  input: Pick<TranslatePdfSegmentsInput, "sourceLang" | "targetLang">,
  model: string,
  pipeline: LocalMtPipeline
) {
  const units = splitLocalMtTextUnits(text);
  if (units.length === 0) {
    return "";
  }

  const translatedUnits: string[] = [];
  for (const unitBatch of chunk(units, localMtBatchSize)) {
    const outputs = await pipeline(unitBatch, getLocalMtGenerationOptions(input, model));
    unitBatch.forEach((unit, index) => {
      const translatedText = sanitizeLocalMtOutput(
        getLocalMtOutputText(outputs[index]),
        input.targetLang
      );
      const assessment = assessLocalMtOutput({
        sourceText: unit,
        translatedText,
        targetLang: input.targetLang
      });
      translatedUnits.push(assessment.ok ? translatedText : getLocalMtFallbackText(unit));
    });
  }

  return translatedUnits.join(" ").replace(/\s+/g, " ").trim();
}

function splitLongLocalMtUnit(unit: string) {
  if (unit.length <= localMtMaxUnitLength) {
    return [unit];
  }

  const parts = unit
    .split(/(?<=[,;:])\s+|\s+(?=(?:and|but|or|which|who|when|where|while|because|that)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  parts.forEach((part) => {
    if (!current) {
      current = part;
      return;
    }

    if (`${current} ${part}`.length <= localMtMaxUnitLength) {
      current = `${current} ${part}`;
      return;
    }

    chunks.push(current);
    current = part;
  });

  if (current) {
    chunks.push(current);
  }

  return chunks.flatMap((chunkText) => {
    if (chunkText.length <= localMtMaxUnitLength) {
      return [chunkText];
    }

    const fallbackChunks: string[] = [];
    for (let start = 0; start < chunkText.length; start += localMtMaxUnitLength) {
      fallbackChunks.push(chunkText.slice(start, start + localMtMaxUnitLength).trim());
    }
    return fallbackChunks.filter(Boolean);
  });
}

function hasRepeatedPhraseLoop(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (/(.{2,40})\1{3,}/u.test(compact)) {
    return true;
  }

  const tokens = compact.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) {
    return false;
  }

  for (let size = 1; size <= 4; size += 1) {
    let runLength = 1;
    let previous = "";
    for (let index = 0; index <= tokens.length - size; index += size) {
      const current = tokens.slice(index, index + size).join(" ");
      if (current === previous) {
        runLength += 1;
        if (runLength >= 4) {
          return true;
        }
      } else {
        previous = current;
        runLength = 1;
      }
    }
  }

  return false;
}

export function sanitizeLocalMtOutput(text: string, targetLang?: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || !isKoreanTarget(targetLang) || !/[가-힣]/.test(normalized)) {
    return normalized;
  }

  return trimSuspiciousForeignTail(normalized)
    .replace(/\b[A-Za-zÀ-ÖØ-öø-ÿ]*[À-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ]*[.。…-]*\s+(?=[가-힣])/gu, "")
    .replace(/(?:^|\s)\/\.{2,}\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSuspiciousForeignTail(text: string) {
  const foreignScriptIndex = text.search(/[Α-ωЀ-ӿ\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]/u);
  if (foreignScriptIndex >= 0 && /[가-힣]/.test(text.slice(0, foreignScriptIndex))) {
    return trimToReadablePrefix(text, foreignScriptIndex);
  }

  const tokens = [...text.matchAll(/\S+/g)];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const tokenStart = token.index ?? 0;
    if (!/[가-힣]/.test(text.slice(0, tokenStart))) {
      continue;
    }

    const windowTokens = tokens.slice(index, index + 8).map((match) => match[0]);
    if (windowTokens.length < 6) {
      continue;
    }

    const suspiciousCount = windowTokens.filter(isSuspiciousForeignToken).length;
    const hangulCount = windowTokens.filter((value) => /[가-힣]/.test(value)).length;
    if (suspiciousCount >= 6 && hangulCount === 0) {
      return trimToReadablePrefix(text, tokenStart);
    }
  }

  return text;
}

function trimToReadablePrefix(text: string, index: number) {
  const prefix = text.slice(0, index).trim();
  if (!prefix) {
    return "";
  }

  const boundaryMatches = [...prefix.matchAll(/[.!?。！？]/g)];
  const lastBoundary = boundaryMatches[boundaryMatches.length - 1]?.index;
  if (lastBoundary !== undefined && prefix.length - lastBoundary <= 80) {
    return prefix.slice(0, lastBoundary + 1).trim();
  }

  return prefix;
}

function isSuspiciousForeignToken(token: string) {
  return (
    /[Α-ωЀ-ӿ\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]/u.test(token) ||
    /^[("'“”‘’\[\]-]*[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’()-]*[.,;:!?"'“”‘’\])]*$/.test(
      token
    )
  );
}

function isOutputTooLong(sourceText: string, translatedText: string) {
  if (sourceText.length < 60) {
    return translatedText.length > Math.max(220, sourceText.length * 4);
  }
  return translatedText.length > Math.max(420, sourceText.length * 2.4);
}

function looksLikeWrongLanguage(text: string) {
  const hangulCount = countMatches(text, /[가-힣]/g);
  const latinCount = countMatches(text, /[A-Za-zÀ-ÖØ-öø-ÿ]/g);
  const foreignScriptCount = countMatches(text, /[Α-ωЀ-ӿ\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]/gu);
  const spanishFunctionWordCount = countMatches(
    text.toLowerCase(),
    /\b(?:el|la|los|las|de|del|que|una|uno|para|con|por|pero|como|este|esta|fue|son)\b/g
  );

  if (foreignScriptCount > 0) {
    return true;
  }
  if (hangulCount === 0 && latinCount >= 16) {
    return true;
  }
  if (spanishFunctionWordCount >= 4 && latinCount > hangulCount) {
    return true;
  }
  return latinCount >= 40 && latinCount > hangulCount * 0.6;
}

function isKoreanTarget(targetLang: string | undefined) {
  const normalized = targetLang?.trim().toLowerCase();
  return !normalized || normalized === "ko" || normalized === "kr" || normalized === "kor_hang";
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function getLocalMtFallbackText(sourceText: string) {
  return `[로컬 번역 품질 경고] ${sourceText}`;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeLocalMtModel(model: string | undefined) {
  return model?.trim() || DEFAULT_LOCAL_MT_MODEL;
}

async function getLocalMtPipeline(model: string, options: LocalMtRuntimeOptions) {
  const cacheKey = `${model}::${options.cacheDir ?? "browser-cache"}`;
  const cached = localMtPipelinePromises.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pipelinePromise = createLocalMtPipeline(model, options);
  localMtPipelinePromises.set(cacheKey, pipelinePromise);
  return pipelinePromise;
}

async function createLocalMtPipeline(
  model: string,
  options: LocalMtRuntimeOptions
): Promise<LocalMtPipeline> {
  const transformers = await getTransformersModule(options);
  const pipelineOptions: Record<string, unknown> = {
    dtype: "q8"
  };
  if (options.cacheDir) {
    pipelineOptions.cache_dir = options.cacheDir;
  }

  const translator = await transformers.pipeline("translation", model, pipelineOptions);
  return translator as LocalMtPipeline;
}

async function getTransformersModule(
  options: LocalMtRuntimeOptions
): Promise<TransformersModule> {
  const transformers = await import("@huggingface/transformers");
  transformers.env.allowLocalModels = true;
  transformers.env.allowRemoteModels = true;

  if (options.cacheDir) {
    transformers.env.cacheDir = options.cacheDir;
    transformers.env.useFSCache = true;
  } else {
    transformers.env.useBrowserCache = true;
    transformers.env.useFSCache = false;
  }

  return transformers;
}

function getLocalMtGenerationOptions(
  input: Pick<TranslatePdfSegmentsInput, "sourceLang" | "targetLang">,
  model: string
) {
  const options: Record<string, unknown> = {
    max_new_tokens: 128,
    num_beams: 2,
    early_stopping: true,
    no_repeat_ngram_size: 3,
    repetition_penalty: 1.15
  };

  if (!model.toLowerCase().includes("nllb")) {
    return options;
  }

  const sourceLang = input.sourceLang?.trim();
  const targetLang = input.targetLang?.trim();
  if (sourceLang && targetLang) {
    options.src_lang = toNllbLanguageCode(sourceLang);
    options.tgt_lang = toNllbLanguageCode(targetLang);
  }

  return options;
}

function toNllbLanguageCode(languageCode: string) {
  const normalized = languageCode.toLowerCase();
  if (normalized === "en") {
    return "eng_Latn";
  }
  if (normalized === "ko" || normalized === "kr") {
    return "kor_Hang";
  }
  return languageCode;
}

function getLocalMtOutputText(output: TranslationOutputItem | undefined) {
  return (output?.translation_text ?? output?.generated_text ?? "").trim();
}
