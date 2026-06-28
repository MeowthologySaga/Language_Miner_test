import { normalizeText } from "./textNormalization";

export type SentenceExtractionInput = {
  fullText: string;
  selectedText: string;
  selectionOffset?: number;
};

export type SentenceExtractionResult = {
  selectedText: string;
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  normalizedFullText: string;
  extractionConfidence: "high" | "medium" | "fallback";
};

type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

const ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "e.g.",
  "i.e.",
  "U.S.",
  "U.K.",
  "etc."
];

const PROTECTED_DOT = "\uE000";

export function extractSentenceContext(
  input: SentenceExtractionInput
): SentenceExtractionResult {
  const normalizedFullText = normalizeText(input.fullText);
  const selectedText = normalizeText(input.selectedText);
  const spans = splitIntoSentenceSpans(input.fullText);
  const selectedIndex = findClosestSelectionIndex(
    normalizedFullText,
    selectedText,
    input.selectionOffset
  );

  if (selectedIndex >= 0) {
    const spanIndex = spans.findIndex(
      (span) => selectedIndex >= span.start && selectedIndex < span.end
    );

    if (spanIndex >= 0) {
      return {
        selectedText,
        sourceSentence: spans[spanIndex].text,
        beforeSentence: spans[spanIndex - 1]?.text,
        afterSentence: spans[spanIndex + 1]?.text,
        normalizedFullText,
        extractionConfidence: "high"
      };
    }
  }

  const fallbackCenter = selectedIndex >= 0 ? selectedIndex : 0;
  const fallbackStart = Math.max(0, fallbackCenter - 300);
  const fallbackEnd = Math.min(
    normalizedFullText.length,
    fallbackCenter + selectedText.length + 300
  );

  return {
    selectedText,
    sourceSentence:
      normalizedFullText.slice(fallbackStart, fallbackEnd) ||
      selectedText ||
      "No source sentence could be extracted.",
    normalizedFullText,
    extractionConfidence: "fallback"
  };
}

export function splitIntoSentenceSpans(text: string): SentenceSpan[] {
  const scanText = normalizeTextForSentenceScan(text);
  const normalized = scanText.replace(/\n/g, " ");
  const protectedText = protectAbbreviations(scanText);
  const spans: SentenceSpan[] = [];
  let start = 0;

  for (let i = 0; i < protectedText.length; i += 1) {
    const char = protectedText[i];
    const isBoundary = char === "." || char === "?" || char === "!" || char === "\n";
    if (!isBoundary) {
      continue;
    }

    const end = char === "\n" ? i : i + 1;
    const sentence = normalized.slice(start, end).trim();
    if (sentence) {
      const leadingSpaceCount = normalized.slice(start, end).search(/\S/);
      spans.push({
        text: sentence,
        start: start + Math.max(0, leadingSpaceCount),
        end
      });
    }
    start = consumeSpaces(protectedText, char === "\n" ? i + 1 : end);
    i = start - 1;
  }

  const remainder = normalized.slice(start).trim();
  if (remainder) {
    const leadingSpaceCount = normalized.slice(start).search(/\S/);
    spans.push({
      text: remainder,
      start: start + Math.max(0, leadingSpaceCount),
      end: normalized.length
    });
  }

  return spans;
}

function findClosestSelectionIndex(
  normalizedFullText: string,
  selectedText: string,
  selectionOffset?: number
) {
  if (!selectedText) {
    return -1;
  }

  const haystack = normalizedFullText.toLowerCase();
  const needle = selectedText.toLowerCase();
  const indexes: number[] = [];
  let index = haystack.indexOf(needle);

  while (index >= 0) {
    indexes.push(index);
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }

  if (indexes.length === 0) {
    return -1;
  }

  if (typeof selectionOffset !== "number") {
    return indexes[0];
  }

  return indexes.reduce((closest, candidate) =>
    Math.abs(candidate - selectionOffset) < Math.abs(closest - selectionOffset)
      ? candidate
      : closest
  );
}

function protectAbbreviations(text: string) {
  return ABBREVIATIONS.reduce((result, abbreviation) => {
    const escaped = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(
      new RegExp(escaped, "g"),
      abbreviation.replace(/\./g, PROTECTED_DOT)
    );
  }, text);
}

function normalizeTextForSentenceScan(text: string): string {
  return text
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2")
    .replace(/\r?\n+/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function consumeSpaces(text: string, index: number) {
  let next = index;
  while (next < text.length && /\s/.test(text[next])) {
    next += 1;
  }
  return next;
}
