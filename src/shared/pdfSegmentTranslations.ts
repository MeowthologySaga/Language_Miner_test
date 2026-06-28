import { parseJsonWithLooseEscapes } from "./jsonParsing";
import type { PdfSegmentTranslation } from "./types";

type ExpectedSegment = {
  id: string;
};

export type PdfSegmentTranslationParseReport = {
  translations: PdfSegmentTranslation[];
  missingIds: string[];
  duplicateIds: string[];
  extraIds: string[];
  error?: string;
};

export function parsePdfSegmentTranslations(
  text: string,
  expectedSegments?: ExpectedSegment[]
): PdfSegmentTranslation[] {
  const parsed = parseJsonFromText(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Ollama PDF segment translation response is not a JSON array.");
  }

  const translations = parsed.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.translationKo !== "string") {
      throw new Error("Ollama PDF segment translation response is missing id/translationKo.");
    }

    return {
      id: item.id,
      translationKo: item.translationKo
    };
  });

  if (expectedSegments) {
    validatePdfSegmentTranslationIds(translations, expectedSegments);
  }

  return translations;
}

export function parsePdfSegmentTranslationsLenient(
  text: string,
  expectedSegments: ExpectedSegment[]
): PdfSegmentTranslationParseReport {
  const expectedIds = new Set(expectedSegments.map((segment) => segment.id));
  const missingAll = expectedSegments.map((segment) => segment.id);

  let parsed: unknown;
  try {
    parsed = parseJsonFromText(text);
  } catch (caught) {
    return {
      translations: [],
      missingIds: missingAll,
      duplicateIds: [],
      extraIds: [],
      error: caught instanceof Error ? caught.message : "Ollama did not return parseable JSON."
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      translations: [],
      missingIds: missingAll,
      duplicateIds: [],
      extraIds: [],
      error: "Ollama PDF segment translation response is not a JSON array."
    };
  }

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const extraIds = new Set<string>();
  const translations: PdfSegmentTranslation[] = [];

  parsed.forEach((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.translationKo !== "string") {
      return;
    }

    if (!expectedIds.has(item.id)) {
      extraIds.add(item.id);
      return;
    }

    if (seenIds.has(item.id)) {
      duplicateIds.add(item.id);
      return;
    }

    seenIds.add(item.id);
    translations.push({
      id: item.id,
      translationKo: item.translationKo
    });
  });

  return {
    translations,
    missingIds: expectedSegments
      .map((segment) => segment.id)
      .filter((segmentId) => !seenIds.has(segmentId)),
    duplicateIds: [...duplicateIds],
    extraIds: [...extraIds]
  };
}

function validatePdfSegmentTranslationIds(
  translations: PdfSegmentTranslation[],
  expectedSegments: ExpectedSegment[]
) {
  const expectedIds = new Set(expectedSegments.map((segment) => segment.id));
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const extraIds = new Set<string>();

  translations.forEach((translation) => {
    if (seenIds.has(translation.id)) {
      duplicateIds.add(translation.id);
    }
    seenIds.add(translation.id);
    if (!expectedIds.has(translation.id)) {
      extraIds.add(translation.id);
    }
  });

  const missingIds = [...expectedIds].filter((id) => !seenIds.has(id));
  const failures = [
    missingIds.length ? `missing ids: ${missingIds.join(", ")}` : "",
    duplicateIds.size ? `duplicate ids: ${[...duplicateIds].join(", ")}` : "",
    extraIds.size ? `extra ids: ${[...extraIds].join(", ")}` : ""
  ].filter(Boolean);

  if (failures.length > 0) {
    throw new Error(`Ollama PDF segment translation id mismatch (${failures.join("; ")}).`);
  }
}

function parseJsonFromText(text: string): unknown {
  try {
    return parseJsonWithLooseEscapes(text);
  } catch {
    const firstArray = text.indexOf("[");
    const lastArray = text.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      return parseJsonWithLooseEscapes(text.slice(firstArray, lastArray + 1));
    }
    throw new Error("Ollama did not return parseable JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
