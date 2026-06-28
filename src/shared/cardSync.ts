import { normalizeCardDeck } from "./cardDeck";
import type { CardSyncSnapshot, StudyCard } from "./types";

export const CARD_SYNC_FILE_NAME = "local-english-miner-cards.json";
export const CARD_SYNC_SCHEMA_VERSION = 1;

export type CardMergeResult = {
  cards: StudyCard[];
  uploadedCardCount: number;
  downloadedCardCount: number;
  skippedCardCount: number;
  conflictCount: number;
};

type CardMergeOptions = {
  baseCards?: StudyCard[];
  nowIso?: string;
};

export function createCardSyncSnapshot(cards: StudyCard[], exportedAt = new Date().toISOString()): CardSyncSnapshot {
  return {
    schemaVersion: CARD_SYNC_SCHEMA_VERSION,
    appName: "Language Miner",
    exportedAt,
    cards: cards.map(normalizeCardForSync)
  };
}

export function parseCardSyncSnapshot(value: unknown): CardSyncSnapshot {
  const candidate = value as Partial<CardSyncSnapshot> | null;
  if (!candidate || !Array.isArray(candidate.cards)) {
    throw new Error("카드 동기화 파일 형식이 올바르지 않습니다.");
  }

  return createCardSyncSnapshot(candidate.cards.map(normalizeCardForSync), candidate.exportedAt);
}

export function mergeCardsForSync(
  localCards: StudyCard[],
  remoteCards: StudyCard[],
  options: CardMergeOptions = {}
): CardMergeResult {
  if (options.baseCards) {
    return mergeCardsWithBaseSnapshot(localCards, remoteCards, {
      ...options,
      baseCards: options.baseCards
    });
  }

  const cardsById = new Map<string, StudyCard>();
  let uploadedCardCount = 0;
  let downloadedCardCount = 0;
  let skippedCardCount = 0;

  localCards.map(normalizeCardForSync).forEach((card) => {
    cardsById.set(card.id, card);
  });

  remoteCards.map(normalizeCardForSync).forEach((remoteCard) => {
    const localCard = cardsById.get(remoteCard.id);
    if (!localCard) {
      cardsById.set(remoteCard.id, remoteCard);
      downloadedCardCount += 1;
      return;
    }

    const localUpdatedAt = getCardUpdatedTime(localCard);
    const remoteUpdatedAt = getCardUpdatedTime(remoteCard);
    if (remoteUpdatedAt > localUpdatedAt) {
      cardsById.set(remoteCard.id, remoteCard);
      downloadedCardCount += 1;
      return;
    }

    if (localUpdatedAt > remoteUpdatedAt) {
      uploadedCardCount += 1;
      return;
    }

    skippedCardCount += 1;
  });

  for (const localCard of localCards) {
    if (!remoteCards.some((remoteCard) => remoteCard.id === localCard.id)) {
      uploadedCardCount += 1;
    }
  }

  return {
    cards: [...cardsById.values()].sort(compareCardsForSync),
    uploadedCardCount,
    downloadedCardCount,
    skippedCardCount,
    conflictCount: 0
  };
}

export function getCardUpdatedTime(card: Pick<StudyCard, "createdAt" | "updatedAt">) {
  const time = Date.parse(card.updatedAt || card.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

function normalizeCardForSync(card: StudyCard): StudyCard {
  const now = new Date().toISOString();
  return normalizeCardDeck({
    ...card,
    createdAt: card.createdAt || card.updatedAt || now,
    updatedAt: card.updatedAt || card.createdAt || now
  });
}

function compareCardsForSync(a: StudyCard, b: StudyCard) {
  return getCardUpdatedTime(b) - getCardUpdatedTime(a) || a.id.localeCompare(b.id);
}

function mergeCardsWithBaseSnapshot(
  localCards: StudyCard[],
  remoteCards: StudyCard[],
  options: Required<Pick<CardMergeOptions, "baseCards">> & CardMergeOptions
): CardMergeResult {
  const localById = toCardMap(localCards);
  const remoteById = toCardMap(remoteCards);
  const baseById = toCardMap(options.baseCards);
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  const cardsById = new Map<string, StudyCard>();
  const nowIso = options.nowIso ?? new Date().toISOString();
  let uploadedCardCount = 0;
  let downloadedCardCount = 0;
  let skippedCardCount = 0;
  let conflictCount = 0;

  ids.forEach((id) => {
    const localCard = localById.get(id);
    const remoteCard = remoteById.get(id);
    const baseCard = baseById.get(id);

    if (localCard && !remoteCard) {
      cardsById.set(id, localCard);
      uploadedCardCount += 1;
      return;
    }

    if (!localCard && remoteCard) {
      cardsById.set(id, remoteCard);
      downloadedCardCount += 1;
      return;
    }

    if (!localCard || !remoteCard) {
      return;
    }

    if (!baseCard) {
      const localUpdatedAt = getCardUpdatedTime(localCard);
      const remoteUpdatedAt = getCardUpdatedTime(remoteCard);
      if (remoteUpdatedAt > localUpdatedAt) {
        cardsById.set(id, remoteCard);
        downloadedCardCount += 1;
      } else if (localUpdatedAt > remoteUpdatedAt) {
        cardsById.set(id, localCard);
        uploadedCardCount += 1;
      } else {
        cardsById.set(id, localCard);
        skippedCardCount += 1;
      }
      return;
    }

    const localChanged = !areCardsEquivalentForSync(localCard, baseCard);
    const remoteChanged = !areCardsEquivalentForSync(remoteCard, baseCard);
    const sidesMatch = areCardsEquivalentForSync(localCard, remoteCard);

    if (sidesMatch) {
      cardsById.set(id, localCard);
      skippedCardCount += 1;
      return;
    }

    if (localChanged && remoteChanged) {
      const conflictCopy = createConflictCopy(remoteCard, localCard, nowIso, conflictCount + 1);
      cardsById.set(id, localCard);
      cardsById.set(conflictCopy.id, conflictCopy);
      uploadedCardCount += 1;
      downloadedCardCount += 1;
      conflictCount += 1;
      return;
    }

    if (remoteChanged) {
      cardsById.set(id, remoteCard);
      downloadedCardCount += 1;
      return;
    }

    if (localChanged) {
      cardsById.set(id, localCard);
      uploadedCardCount += 1;
      return;
    }

    cardsById.set(id, localCard);
    skippedCardCount += 1;
  });

  return {
    cards: [...cardsById.values()].sort(compareCardsForSync),
    uploadedCardCount,
    downloadedCardCount,
    skippedCardCount,
    conflictCount
  };
}

function toCardMap(cards: StudyCard[]) {
  return new Map(cards.map(normalizeCardForSync).map((card) => [card.id, card]));
}

function areCardsEquivalentForSync(a: StudyCard, b: StudyCard) {
  return JSON.stringify(getComparableCardForSync(a)) === JSON.stringify(getComparableCardForSync(b));
}

function getComparableCardForSync(card: StudyCard) {
  const normalized = normalizeCardForSync(card);
  return {
    ...normalized,
    createdAt: undefined,
    updatedAt: undefined
  };
}

function createConflictCopy(
  remoteCard: StudyCard,
  localCard: StudyCard,
  nowIso: string,
  conflictIndex: number
): StudyCard {
  const suffix = nowIso.replace(/\D/g, "") || String(Date.now());
  return normalizeCardForSync({
    ...remoteCard,
    id: `${remoteCard.id}__sync_conflict_${suffix}_${conflictIndex}`,
    syncMetadata: {
      ...remoteCard.syncMetadata,
      conflict: true,
      originalCardId: remoteCard.id,
      conflictSource: "sync-folder",
      conflictAt: nowIso,
      localUpdatedAt: localCard.updatedAt,
      remoteUpdatedAt: remoteCard.updatedAt
    },
    createdAt: nowIso,
    updatedAt: nowIso
  });
}
