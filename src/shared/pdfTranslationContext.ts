import type {
  PdfTextSegment,
  PdfTranslationContext,
  PdfTranslationContextTerm,
  PdfTranslationTermCategory,
  PdfTranslationTermPolicy
} from "./types";

export const PDF_TRANSLATION_CONTEXT_VERSION = "pdf-translation-context-v1";

type BuildPdfTranslationContextInput = {
  segments: Array<Pick<PdfTextSegment, "text">>;
  sourceLang?: string;
  targetLang: string;
  maxTerms?: number;
};

type CandidateTerm = {
  source: string;
  category: PdfTranslationTermCategory;
  policy: PdfTranslationTermPolicy;
  confidence: number;
  occurrences: number;
};

const stopWords = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "among",
  "another",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "first",
  "found",
  "from",
  "have",
  "into",
  "like",
  "little",
  "many",
  "more",
  "most",
  "much",
  "only",
  "other",
  "over",
  "page",
  "part",
  "said",
  "same",
  "should",
  "since",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "were",
  "well",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your"
]);

const sentenceFragmentBoundaryWords = new Set([
  "add",
  "after",
  "also",
  "and",
  "before",
  "but",
  "for",
  "here",
  "however",
  "if",
  "note",
  "once",
  "put",
  "remove",
  "return",
  "so",
  "suddenly",
  "then",
  "there",
  "these",
  "this",
  "those",
  "when",
  "while",
  "with",
  "you"
]);

const initialNamePattern = /\b[A-Z]\.\s*(?:[A-Z]\.\s*){0,3}[A-Z][A-Za-z'’-]+\b/g;
const publisherPattern =
  /\b[A-Z][A-Za-z&.'’-]+(?:\s+[A-Z][A-Za-z&.'’-]+){0,4}\s+(?:Books|Press|Publishing|Publishers|House|Collins|University)\b/g;
const editionPattern =
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|\d+(?:st|nd|rd|th))\s+(?:edition|impression|printing|hardcover|paperback|volume|appendix)\b/gi;
const titleCasePhrasePattern =
  /\b(?:[A-Z][A-Za-z'’-]+|[A-Z]{2,})(?:\s+(?:of|and|or|in|on|for|to|the|a|an|by|with|from|[A-Z][A-Za-z'’-]+|[A-Z]{2,})){1,8}\b/g;
const acronymPattern = /\b[A-Z]{2,}(?:\.[A-Z]+)*\b/g;
const quotedTextPattern = /“([^”]{2,90})”|‘([^’]{2,90})’|"([^"]{2,90})"/g;
const wordPattern = /\b[A-Za-z][A-Za-z'’-]{3,}\b/g;

export function buildPdfTranslationContext(
  input: BuildPdfTranslationContextInput
): PdfTranslationContext {
  const sourceLang = normalizeLang(input.sourceLang, "auto");
  const targetLang = normalizeLang(input.targetLang, "ko");
  const text = input.segments.map((segment) => segment.text).join("\n");
  const terms = extractPdfTranslationTerms(text, input.maxTerms ?? 40);
  const styleGuide = [
    "Preserve every source number, year, edition marker, citation detail, and parenthetical detail.",
    "Use consistent wording for repeated source terms inside this document context.",
    "For names and titles, use an established translation only when confident; otherwise preserve the source spelling."
  ];
  const contextWithoutHash = {
    promptVersion: PDF_TRANSLATION_CONTEXT_VERSION,
    sourceLang,
    targetLang,
    terms,
    styleGuide
  };

  return {
    ...contextWithoutHash,
    contextHash: stableHash(JSON.stringify(contextWithoutHash))
  };
}

export function compactPdfTranslationContextForSegments(
  context: PdfTranslationContext,
  segments: Array<Pick<PdfTextSegment, "text">>,
  maxTerms = 24
): PdfTranslationContext {
  if (context.terms.length <= maxTerms) {
    return context;
  }

  const batchText = normalizeForLookup(segments.map((segment) => segment.text).join(" "));
  const relevantTerms = context.terms
    .filter((term) => batchText.includes(normalizeForLookup(term.source)))
    .slice(0, maxTerms);
  const fallbackTerms = context.terms
    .filter((term) => !relevantTerms.some((relevant) => relevant.source === term.source))
    .slice(0, Math.max(0, maxTerms - relevantTerms.length));

  return {
    ...context,
    terms: [...relevantTerms, ...fallbackTerms]
  };
}

function extractPdfTranslationTerms(text: string, maxTerms: number) {
  const candidates = new Map<string, CandidateTerm>();

  collectPatternCandidates(candidates, text, publisherPattern, "publisher", "preserve_if_uncertain", 0.78);
  collectPatternCandidates(candidates, text, editionPattern, "edition", "translate_consistently", 0.72);
  collectPatternCandidates(candidates, text, initialNamePattern, "person", "preserve_if_uncertain", 0.86);
  collectQuotedTitleCandidates(candidates, text);
  collectAllCapsLineCandidates(candidates, text);
  collectPatternCandidates(candidates, text, titleCasePhrasePattern, "proper_noun", "preserve_if_uncertain", 0.68);
  collectAcronymCandidates(candidates, text);
  collectRepeatedTerms(candidates, text);

  return [...candidates.values()]
    .filter((term) => isUsefulTerm(term.source))
    .sort(compareTerms)
    .slice(0, maxTerms)
    .map(toContextTerm);
}

function collectPatternCandidates(
  candidates: Map<string, CandidateTerm>,
  text: string,
  pattern: RegExp,
  category: PdfTranslationTermCategory,
  policy: PdfTranslationTermPolicy,
  confidence: number
) {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    addCandidate(candidates, {
      source: cleanCandidate(match[0]),
      category,
      policy,
      confidence,
      occurrences: 1
    });
  }
}

function collectQuotedTitleCandidates(candidates: Map<string, CandidateTerm>, text: string) {
  quotedTextPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = quotedTextPattern.exec(text)) !== null) {
    const source = cleanCandidate(match[1] ?? match[2] ?? match[3] ?? "");
    if (!/[A-Za-z]/.test(source) || source.length < 3 || !looksLikeTitlePhrase(source)) {
      continue;
    }
    addCandidate(candidates, {
      source,
      category: "title",
      policy: "preserve_if_uncertain",
      confidence: 0.8,
      occurrences: 1
    });
  }
}

function collectAllCapsLineCandidates(candidates: Map<string, CandidateTerm>, text: string) {
  text.split(/\r?\n/).forEach((line) => {
    const source = cleanCandidate(line);
    if (
      source.length < 4 ||
      source.length > 90 ||
      !/[A-Z]/.test(source) ||
      source !== source.toUpperCase() ||
      source.split(/\s+/).length > 8
    ) {
      return;
    }
    addCandidate(candidates, {
      source,
      category: "title",
      policy: "preserve_if_uncertain",
      confidence: 0.72,
      occurrences: 1
    });
  });
}

function collectAcronymCandidates(candidates: Map<string, CandidateTerm>, text: string) {
  acronymPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = acronymPattern.exec(text)) !== null) {
    const source = cleanCandidate(match[0]);
    if (isAllCapsTitleWord(text, match.index, source)) {
      continue;
    }
    addCandidate(candidates, {
      source,
      category: "acronym",
      policy: "preserve",
      confidence: 0.94,
      occurrences: 1
    });
  }
}

function isAllCapsTitleWord(text: string, matchIndex: number, source: string) {
  if (source.includes(".") || /\d/.test(source)) {
    return false;
  }

  const lineStart = Math.max(text.lastIndexOf("\n", matchIndex) + 1, 0);
  const nextLineBreak = text.indexOf("\n", matchIndex);
  const lineEnd = nextLineBreak >= 0 ? nextLineBreak : text.length;
  const line = cleanCandidate(text.slice(lineStart, lineEnd));
  return (
    line.split(/\s+/).length >= 2 &&
    line === line.toUpperCase() &&
    line.includes(source)
  );
}

function collectRepeatedTerms(candidates: Map<string, CandidateTerm>, text: string) {
  const words = new Map<string, { source: string; count: number }>();
  wordPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(text)) !== null) {
    const source = cleanCandidate(match[0]);
    const normalized = source.toLowerCase();
    if (stopWords.has(normalized) || normalized.length < 4) {
      continue;
    }

    const existing = words.get(normalized);
    words.set(normalized, {
      source: existing?.source ?? source,
      count: (existing?.count ?? 0) + 1
    });
  }

  [...words.values()]
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 24)
    .forEach((entry) => {
      addCandidate(candidates, {
        source: entry.source,
        category: "repeated_term",
        policy: "translate_consistently",
        confidence: Math.min(0.7, 0.42 + entry.count * 0.04),
        occurrences: entry.count
      });
    });
}

function addCandidate(candidates: Map<string, CandidateTerm>, candidate: CandidateTerm) {
  const source = cleanCandidate(candidate.source);
  if (!isUsefulTerm(source)) {
    return;
  }
  if (
    (candidate.category === "proper_noun" || candidate.category === "title") &&
    !looksLikeTitlePhrase(source)
  ) {
    return;
  }

  const key = normalizeForLookup(source);
  const existing = candidates.get(key);
  if (!existing) {
    candidates.set(key, { ...candidate, source });
    return;
  }

  candidates.set(key, {
    source: existing.source.length >= source.length ? existing.source : source,
    category: higherPriorityCategory(existing.category, candidate.category),
    policy: higherPriorityPolicy(existing.policy, candidate.policy),
    confidence: Math.max(existing.confidence, candidate.confidence),
    occurrences: existing.occurrences + candidate.occurrences
  });
}

function toContextTerm(term: CandidateTerm): PdfTranslationContextTerm {
  return {
    source: term.source,
    target: term.policy === "preserve" ? term.source : "",
    category: term.category,
    policy: term.policy,
    confidence: Number(term.confidence.toFixed(2)),
    occurrences: term.occurrences
  };
}

function compareTerms(left: CandidateTerm, right: CandidateTerm) {
  return (
    categoryRank(right.category) - categoryRank(left.category) ||
    right.confidence - left.confidence ||
    right.occurrences - left.occurrences ||
    left.source.localeCompare(right.source)
  );
}

function categoryRank(category: PdfTranslationTermCategory) {
  switch (category) {
    case "person":
      return 7;
    case "publisher":
      return 6;
    case "title":
      return 5;
    case "proper_noun":
      return 4;
    case "acronym":
      return 3;
    case "edition":
      return 2;
    case "repeated_term":
      return 1;
    default:
      return 0;
  }
}

function higherPriorityCategory(
  left: PdfTranslationTermCategory,
  right: PdfTranslationTermCategory
) {
  return categoryRank(right) > categoryRank(left) ? right : left;
}

function higherPriorityPolicy(
  left: PdfTranslationTermPolicy,
  right: PdfTranslationTermPolicy
) {
  if (left === "preserve" || right === "preserve") {
    return "preserve";
  }
  if (left === "preserve_if_uncertain" || right === "preserve_if_uncertain") {
    return "preserve_if_uncertain";
  }
  return "translate_consistently";
}

function isUsefulTerm(source: string) {
  if (!source || source.length < 2 || source.length > 100) {
    return false;
  }
  if (!/[A-Za-z]/.test(source)) {
    return false;
  }
  const normalized = source.toLowerCase();
  if (stopWords.has(normalized)) {
    return false;
  }
  if (looksLikeSentenceFragment(source)) {
    return false;
  }
  return true;
}

function looksLikeSentenceFragment(source: string) {
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return false;
  }

  const first = words[0].toLowerCase();
  const last = words[words.length - 1].toLowerCase();
  if (sentenceFragmentBoundaryWords.has(first) || sentenceFragmentBoundaryWords.has(last)) {
    return true;
  }

  return words.some((word) => word.length === 1 && /^[A-Za-z]$/.test(word));
}

function looksLikeTitlePhrase(source: string) {
  if (/[!?]|\b(?:said|asked|cried|replied|answered|thought|laughed)\b/i.test(source)) {
    return false;
  }

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 10) {
    return false;
  }

  const connectorWords = new Set([
    "a",
    "an",
    "and",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with"
  ]);
  const contentWords = words.filter((word) => !connectorWords.has(word.toLowerCase()));
  if (contentWords.length < 2) {
    return false;
  }

  return contentWords.every((word) => /^[A-Z][A-Za-z'’-]*$|^[A-Z]{2,}$/.test(word));
}

function cleanCandidate(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s,.;:!?()[\]{}]+|[\s,.;:!?()[\]{}]+$/g, "").trim();
}

function normalizeForLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLang(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
