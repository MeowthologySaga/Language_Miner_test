import type { CardDeckType, CardDirection, CardType, StudyCard } from "./types";

export type CardDeckFilter = "all" | CardDeckType;

export function inferCardDeckType(cardType: CardType): CardDeckType {
  return cardType === "life_expression" ? "output" : "input";
}

export function inferCardDirection(cardType: CardType): CardDirection {
  return cardType === "life_expression" ? "native_to_target" : "target_to_native";
}

export function normalizeCardDeck<T extends { cardType: CardType }>(
  card: T & Partial<Pick<StudyCard, "deckType" | "direction">>
): T & Pick<StudyCard, "deckType" | "direction"> {
  const deckType = isCardDeckType(card.deckType)
    ? card.deckType
    : inferCardDeckType(card.cardType);
  const direction = isCardDirection(card.direction)
    ? card.direction
    : inferCardDirection(card.cardType);

  return {
    ...card,
    deckType,
    direction
  };
}

export function getCardDeckLabel(card: Pick<StudyCard, "deckType" | "direction">) {
  if (card.deckType === "output") {
    return "아웃풋 카드";
  }
  if (card.deckType === "input-listening") {
    return "인풋-리스닝 카드";
  }
  return "인풋-리딩 카드";
}

export function getCardDeckShortLabel(card: Pick<StudyCard, "deckType" | "direction">) {
  if (card.deckType === "output") {
    return "아웃풋";
  }
  if (card.deckType === "input-listening") {
    return "인풋-리스닝";
  }
  return "인풋-리딩";
}

export function getCardDeckFilterLabel(filter: CardDeckFilter) {
  if (filter === "output") {
    return "아웃풋";
  }
  if (filter === "input-listening") {
    return "인풋-리스닝";
  }
  if (filter === "input") {
    return "인풋-리딩";
  }
  return "전체";
}

export function isInputReadingCard(card: Pick<StudyCard, "cardType" | "deckType">) {
  return card.cardType === "reading" && card.deckType === "input";
}

export function isLifeMiningOutputCard(card: Pick<StudyCard, "cardType" | "deckType">) {
  return card.cardType === "life_expression" && card.deckType === "output";
}

function isCardDeckType(value: unknown): value is CardDeckType {
  return value === "input" || value === "input-listening" || value === "output";
}

function isCardDirection(value: unknown): value is CardDirection {
  return (
    value === "en_to_ko" ||
    value === "ko_to_en" ||
    value === "target_to_native" ||
    value === "native_to_target"
  );
}

export function isInputToNativeDirection(value: CardDirection) {
  return value === "target_to_native" || value === "en_to_ko";
}

export function isNativeToTargetDirection(value: CardDirection) {
  return value === "native_to_target" || value === "ko_to_en";
}
