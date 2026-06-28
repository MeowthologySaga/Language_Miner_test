import type { PdfSegmentTranslation, PdfTextSegment } from "../shared/types";

type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

type BrowserTranslatorSession = {
  translate(text: string): Promise<string>;
  destroy?: () => void;
};

type BrowserTranslatorStatic = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<BrowserTranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BrowserTranslatorSession>;
};

export async function translatePdfSegmentsWithBrowserTranslator(input: {
  segments: PdfTextSegment[];
  sourceLanguage: string;
  targetLanguage: string;
  onStatus: (status: string) => void;
}): Promise<PdfSegmentTranslation[]> {
  const Translator = getBrowserTranslatorApi();
  if (!Translator) {
    throw new Error(
      "Built-in translator is not available in this Electron/Chrome version. Use Gemini/Google/Ollama, or run in a newer supported Chromium."
    );
  }

  const availability = await Translator.availability({
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage
  });
  if (availability === "unavailable") {
    throw new Error(
      `Built-in translator does not support ${input.sourceLanguage} -> ${input.targetLanguage}.`
    );
  }

  input.onStatus(
    availability === "available"
      ? "Built-in translator ready."
      : "Built-in translator model download may start..."
  );

  const translator = await Translator.create({
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progressEvent = event as Event & {
          loaded?: number;
          total?: number;
        };
        if (
          typeof progressEvent.loaded === "number" &&
          typeof progressEvent.total === "number" &&
          progressEvent.total > 0
        ) {
          input.onStatus(
            `Built-in translator model downloading ${Math.round(
              (progressEvent.loaded / progressEvent.total) * 100
            )}%...`
          );
        }
      });
    }
  });

  try {
    const translations: PdfSegmentTranslation[] = [];
    for (const [index, segment] of input.segments.entries()) {
      input.onStatus(
        `Built-in translating ${index + 1}/${input.segments.length} segments...`
      );
      const translatedText = (await translator.translate(segment.text)).trim();
      if (translatedText) {
        translations.push({
          id: segment.id,
          translationKo: translatedText,
          cacheStatus: "miss"
        });
      }
    }
    return translations;
  } finally {
    translator.destroy?.();
  }
}

export function normalizeBrowserTranslatorLanguage(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/_/g, "-");
}

function getBrowserTranslatorApi() {
  const candidate = (globalThis as { Translator?: unknown }).Translator;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const translator = candidate as Partial<BrowserTranslatorStatic>;
  return typeof translator.availability === "function" &&
    typeof translator.create === "function"
    ? (translator as BrowserTranslatorStatic)
    : undefined;
}
