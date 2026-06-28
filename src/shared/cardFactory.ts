import { randomId } from "./ids";
import { normalizeCardDeck } from "./cardDeck";
import { ensureBrowserSentenceSelectedTerms } from "./browserSentenceFallbackCard";
import { createInitialSrs } from "./srs";
import type { GeneratedCardData, HighlightColorKey, StudyCard } from "./types";

const inputCardColorKeys: HighlightColorKey[] = [
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

export function createStudyCardFromGenerated(data: GeneratedCardData): StudyCard {
  const now = new Date().toISOString();
  const card = normalizeCardDeck({
    ...data,
    id: data.id ?? randomId(),
    srs: data.srs ?? createInitialSrs(new Date(now))
  });
  return normalizeInputReadingCardFormat(card);
}

function normalizeInputReadingCardFormat(card: StudyCard): StudyCard {
  if (card.cardType !== "reading" || card.deckType !== "input") {
    return card;
  }

  const selectedText = getInputCardSelectedText(card);
  if (!selectedText) {
    return card;
  }

  return ensureBrowserSentenceSelectedTerms(card, selectedText, inputCardColorKeys, {
    targetLanguageCode: card.languageMetadata?.profileTargetLanguageCode
  });
}

function getInputCardSelectedText(card: StudyCard) {
  const highlightedTerms = card.highlightMappings.map((mapping) => mapping.sourceText);
  const terms = highlightedTerms.some((term) => normalizeInputCardTerm(term))
    ? highlightedTerms
    : card.vocabularyItems.map((item) => item.term);
  const uniqueTerms: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const normalized = normalizeInputCardTerm(term);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueTerms.push(normalized);
  }
  return uniqueTerms.slice(0, inputCardColorKeys.length).join(", ");
}

function normalizeInputCardTerm(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
