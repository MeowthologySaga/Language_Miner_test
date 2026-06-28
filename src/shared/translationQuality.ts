import type { PdfTranslationContext, ProfileLanguage } from "./types";

export type TranslationQualityIssue = {
  code:
    | "glossary-term-mismatch"
    | "japanese-script"
    | "missing-context-title"
    | "missing-source-initial"
    | "missing-source-number"
    | "mixed-cjk-korean"
    | "source-absent-latin-token"
    | "untranslated-source-fragment"
    | "unexpected-script";
  message: string;
};

type TranslationQualityInput = {
  sourceText: string;
  translatedText: string;
  outputLanguage: ProfileLanguage;
  translationContext?: PdfTranslationContext;
};

const japaneseScriptPattern = /[\u3040-\u30ff\u31f0-\u31ff]/;
const unexpectedScriptPattern = /[\u0370-\u03ff\u0400-\u052f]/;
const mixedCjkKoreanTokenPattern =
  /[\uac00-\ud7af][\u3400-\u4dbf\u4e00-\u9fff]|[\u3400-\u4dbf\u4e00-\u9fff][\uac00-\ud7af]/;
const cjkIdeographPattern = /[\u3400-\u4dbf\u4e00-\u9fff]+/g;
const latinWordPattern = /\b[A-Za-z][A-Za-z'’-]{2,}\b/g;
const longLatinFragmentPattern =
  /[A-Za-z0-9][A-Za-z0-9\s.,;:'"()[\]{}\/%\u00bc\u00bd\u00be+\-\u2013\u2014]{90,}/g;
const sourceNumberPattern = /\b\d{2,4}(?:[.,]\d+)?\b/g;
const sourceInitialPattern = /\b(?:[A-Z]\.\s*){1,4}(?=[A-Z][A-Za-z'’-]*|\b)/g;

const likelyTitlePattern =
  /\b(?:The|A|An)\s+[A-Z][A-Za-z'’-]+(?:\s+(?:of|and|in|on|for|to|the|[A-Z][A-Za-z'’-]+)){1,8}\b/g;
const likelyInitialNamePattern = /\b[A-Z]\.\s*(?:[A-Z]\.\s*)?[A-Z][A-Za-z'’-]+\b/g;

export function assessPdfTranslationQuality(input: TranslationQualityInput) {
  const issues: TranslationQualityIssue[] = [];

  if (input.outputLanguage.code === "ko") {
    if (japaneseScriptPattern.test(input.translatedText)) {
      issues.push({
        code: "japanese-script",
        message: "Korean output contains Japanese kana or Japanese grammatical fragments."
      });
    }

    if (
      mixedCjkKoreanTokenPattern.test(input.translatedText) ||
      findSourceAbsentCjkFragments(input.sourceText, input.translatedText).length > 0
    ) {
      issues.push({
        code: "mixed-cjk-korean",
        message: "Korean output contains source-absent CJK or mixed Hangul/CJK fragments that look like machine translation noise."
      });
    }

    if (unexpectedScriptPattern.test(input.translatedText)) {
      issues.push({
        code: "unexpected-script",
        message: "Korean output contains unexpected non-source scripts such as Cyrillic or Greek letters."
      });
    }

    const sourceAbsentLatinTokens = findSourceAbsentLatinTokens(
      input.sourceText,
      input.translatedText
    );
    if (sourceAbsentLatinTokens.length > 0) {
      issues.push({
        code: "source-absent-latin-token",
        message: `Korean output contains Latin words that are not present in the source text: ${sourceAbsentLatinTokens.join(", ")}.`
      });
    }

    const untranslatedFragments = findUntranslatedSourceFragments(
      input.sourceText,
      input.translatedText
    );
    if (untranslatedFragments.length > 0) {
      issues.push({
        code: "untranslated-source-fragment",
        message: `Korean output appears to copy long source-language fragments without translation: ${untranslatedFragments.join(" / ")}.`
      });
    }
  }

  const missingNumbers = findMissingSourceNumbers(input.sourceText, input.translatedText);
  if (missingNumbers.length > 0) {
    issues.push({
      code: "missing-source-number",
      message: `Translation appears to omit source numbers or years: ${missingNumbers.join(", ")}.`
    });
  }

  const missingInitials = findMissingSourceInitials(input.sourceText, input.translatedText);
  if (missingInitials.length > 0) {
    issues.push({
      code: "missing-source-initial",
      message: `Translation appears to omit source initials: ${missingInitials.join(", ")}.`
    });
  }

  const missingTerms = findMissingRequiredContextTerms(input);
  if (missingTerms.length > 0) {
    issues.push({
      code: "glossary-term-mismatch",
      message: `Translation does not follow required context terms: ${missingTerms.join(", ")}.`
    });
  }

  const missingTitles = findMissingContextTitles(input);
  if (missingTitles.length > 0) {
    issues.push({
      code: "missing-context-title",
      message: `Translation appears to omit or replace source title/name candidates: ${missingTitles.join(", ")}.`
    });
  }

  return issues;
}

export function shouldReviewPdfProperNouns(input: {
  sourceText: string;
  outputLanguage: ProfileLanguage;
}) {
  if (input.outputLanguage.code !== "ko") {
    return false;
  }

  likelyTitlePattern.lastIndex = 0;
  likelyInitialNamePattern.lastIndex = 0;
  return (
    likelyTitlePattern.test(input.sourceText) ||
    likelyInitialNamePattern.test(input.sourceText)
  );
}

export function hasCriticalPdfTranslationQualityIssues(issues: TranslationQualityIssue[]) {
  return issues.some((issue) =>
    [
      "glossary-term-mismatch",
      "japanese-script",
      "mixed-cjk-korean",
      "source-absent-latin-token",
      "untranslated-source-fragment",
      "unexpected-script"
    ].includes(issue.code)
  );
}

function findSourceAbsentLatinTokens(sourceText: string, translatedText: string) {
  const sourceTokens = new Set(normalizeLatinTokens(sourceText));
  const translatedTokens = normalizeLatinTokens(translatedText);
  const unknownTokens: string[] = [];

  translatedTokens.forEach((token) => {
    if (sourceTokens.has(token) || unknownTokens.includes(token)) {
      return;
    }

    unknownTokens.push(token);
  });

  return unknownTokens.slice(0, 8);
}

function findSourceAbsentCjkFragments(sourceText: string, translatedText: string) {
  const normalizedSource = normalizeForLookup(sourceText);
  cjkIdeographPattern.lastIndex = 0;
  const fragments: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = cjkIdeographPattern.exec(translatedText)) !== null) {
    const fragment = normalizeForLookup(match[0]);
    if (fragment.length > 0 && !normalizedSource.includes(fragment)) {
      fragments.push(match[0]);
    }
  }

  return [...new Set(fragments)].slice(0, 8);
}

function findUntranslatedSourceFragments(sourceText: string, translatedText: string) {
  const normalizedSource = normalizeForCopyCheck(sourceText);
  longLatinFragmentPattern.lastIndex = 0;
  const fragments: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = longLatinFragmentPattern.exec(translatedText)) !== null) {
    const fragment = match[0].replace(/\s+/g, " ").trim();
    if (countLatinWords(fragment) < 12) {
      continue;
    }

    const copiedFragment = findCopiedLatinWordWindow(normalizedSource, fragment);
    if (copiedFragment) {
      fragments.push(copiedFragment.slice(0, 80));
    }
  }

  return [...new Set(fragments)].slice(0, 3);
}

function findMissingSourceNumbers(sourceText: string, translatedText: string) {
  const translatedNumbers = new Set(extractNumbers(translatedText));
  return extractNumbers(sourceText).filter((number) => !translatedNumbers.has(number));
}

function extractNumbers(text: string) {
  sourceNumberPattern.lastIndex = 0;
  const numbers: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = sourceNumberPattern.exec(text)) !== null) {
    const normalized = match[0].replace(/[,.]/g, "");
    if (!numbers.includes(normalized)) {
      numbers.push(normalized);
    }
  }
  return numbers;
}

function findMissingSourceInitials(sourceText: string, translatedText: string) {
  const normalizedTranslation = normalizeInitials(translatedText);
  sourceInitialPattern.lastIndex = 0;
  const missing: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = sourceInitialPattern.exec(sourceText)) !== null) {
    const normalized = normalizeInitials(match[0]);
    if (normalized.length > 0 && !normalizedTranslation.includes(normalized)) {
      missing.push(match[0].replace(/\s+/g, " ").trim());
    }
  }
  return [...new Set(missing)].slice(0, 8);
}

function findMissingRequiredContextTerms(input: TranslationQualityInput) {
  const context = input.translationContext;
  if (!context) {
    return [];
  }

  const normalizedSource = normalizeForLookup(input.sourceText);
  const normalizedTranslation = normalizeForLookup(input.translatedText);
  return context.terms
    .filter((term) => term.policy === "preserve" && normalizeForLookup(term.source).length > 0)
    .filter((term) => containsNormalizedTerm(normalizedSource, normalizeForLookup(term.source)))
    .filter((term) => {
      const expected = term.target || term.source;
      return !containsNormalizedTerm(normalizedTranslation, normalizeForLookup(expected));
    })
    .map((term) => term.source)
    .slice(0, 8);
}

function findMissingContextTitles(input: TranslationQualityInput) {
  const context = input.translationContext;
  if (!context) {
    return [];
  }

  const normalizedSource = normalizeForLookup(input.sourceText);
  const normalizedTranslation = normalizeForLookup(input.translatedText);
  return context.terms
    .filter((term) =>
      ["person", "publisher", "title"].includes(term.category)
    )
    .filter((term) => term.policy === "preserve_if_uncertain")
    .filter((term) => normalizeForLookup(term.source).length >= 4)
    .filter((term) => containsNormalizedTerm(normalizedSource, normalizeForLookup(term.source)))
    .filter((term) => !containsNormalizedTerm(normalizedTranslation, normalizeForLookup(term.target || term.source)))
    .map((term) => term.source)
    .slice(0, 8);
}

function normalizeLatinTokens(text: string) {
  latinWordPattern.lastIndex = 0;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = latinWordPattern.exec(text)) !== null) {
    const token = match[0]
      .replace(/[’']s$/i, "")
      .replace(/[’']/g, "")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    if (token.length >= 3) {
      tokens.push(token);
    }
  }
  return tokens;
}

function normalizeInitials(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function normalizeForLookup(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsNormalizedTerm(normalizedText: string, normalizedTerm: string) {
  const term = normalizedTerm.replace(/\s+/g, " ").trim();
  if (!term) {
    return false;
  }

  return ` ${normalizedText} `.includes(` ${term} `);
}

function normalizeForCopyCheck(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countLatinWords(text: string) {
  return (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []).length;
}

function findCopiedLatinWordWindow(normalizedSource: string, fragment: string) {
  const words = fragment.match(/[A-Za-z0-9][A-Za-z0-9'%-]*/g) ?? [];
  for (let windowSize = Math.min(28, words.length); windowSize >= 12; windowSize -= 1) {
    for (let index = 0; index <= words.length - windowSize; index += 1) {
      const candidate = words.slice(index, index + windowSize).join(" ");
      const normalizedCandidate = normalizeForCopyCheck(candidate);
      if (normalizedCandidate.length >= 70 && normalizedSource.includes(normalizedCandidate)) {
        return candidate;
      }
    }
  }
  return "";
}
