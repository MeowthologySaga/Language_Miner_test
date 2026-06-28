import type { StudyCard } from "./types";

export type GlossaryEntry = {
  term: string;
  meaningKo: string;
  partOfSpeech: string;
  sourcePreview: string;
  policyLabel: string;
  sourceCardCount: number;
  exampleCount: number;
};

type MutableGlossaryEntry = Omit<
  GlossaryEntry,
  "partOfSpeech" | "sourceCardCount" | "exampleCount"
> & {
  cardIds: Set<string>;
  examples: Set<string>;
  partsOfSpeech: Set<string>;
};

export function buildGlossaryEntries(cards: StudyCard[], query = ""): GlossaryEntry[] {
  const entriesByTerm = new Map<string, MutableGlossaryEntry>();

  for (const card of cards) {
    const vocabularyItems = Array.isArray(card.vocabularyItems) ? card.vocabularyItems : [];
    for (const item of vocabularyItems) {
      const term = normalizeGlossaryText(item.term);
      if (!term) {
        continue;
      }

      const key = term.toLocaleLowerCase();
      const existing = entriesByTerm.get(key);
      const examples = normalizeGlossaryExamples(item.examples);
      const meaningKo = normalizeGlossaryText(
        item.meaningInContextKo || item.basicMeaningKo || card.naturalTranslationKo
      );
      const sourcePreview = normalizeGlossaryText(card.sourceSentence || card.frontText);
      const partOfSpeech = normalizeGlossaryText(item.partOfSpeech);

      if (!existing) {
        entriesByTerm.set(key, {
          term,
          meaningKo,
          sourcePreview,
          policyLabel: "카드 기반",
          cardIds: new Set([card.id || key]),
          examples: new Set(examples),
          partsOfSpeech: new Set(partOfSpeech ? [partOfSpeech] : [])
        });
        continue;
      }

      existing.cardIds.add(card.id || key);
      if (!existing.meaningKo && meaningKo) {
        existing.meaningKo = meaningKo;
      }
      if (!existing.sourcePreview && sourcePreview) {
        existing.sourcePreview = sourcePreview;
      }
      if (partOfSpeech) {
        existing.partsOfSpeech.add(partOfSpeech);
      }
      for (const example of examples) {
        existing.examples.add(example);
      }
    }
  }

  const normalizedQuery = normalizeGlossaryText(query).toLocaleLowerCase();
  return [...entriesByTerm.values()]
    .map((entry) => ({
      term: entry.term,
      meaningKo: entry.meaningKo || "뜻 확인 필요",
      partOfSpeech: [...entry.partsOfSpeech].slice(0, 2).join(", ") || "-",
      sourcePreview: entry.sourcePreview,
      policyLabel: entry.policyLabel,
      sourceCardCount: entry.cardIds.size,
      exampleCount: entry.examples.size
    }))
    .filter((entry) => matchesGlossaryQuery(entry, normalizedQuery))
    .sort((left, right) => left.term.localeCompare(right.term, "en"));
}

function matchesGlossaryQuery(entry: GlossaryEntry, query: string) {
  if (!query) {
    return true;
  }

  return [
    entry.term,
    entry.meaningKo,
    entry.partOfSpeech,
    entry.sourcePreview,
    entry.policyLabel
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function normalizeGlossaryText(value: string | undefined) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGlossaryExamples(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeGlossaryText).filter(Boolean);
}
