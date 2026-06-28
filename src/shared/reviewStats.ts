import type { CardDeckType, StudyCard } from "./types";

export const reviewDecks: CardDeckType[] = ["input", "input-listening", "output"];

export type ReviewDeckSettings = {
  newLimit: number;
  reviewLimit: number;
};

export type ReviewSettings = Record<CardDeckType, ReviewDeckSettings>;

export type ReviewDeckStats = {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  overdueCount: number;
  totalCount: number;
  doneTodayCount: number;
};

export type ReviewStats = Record<CardDeckType, ReviewDeckStats>;

export type ReviewDailyDeckProgress = {
  newDone: number;
  reviewDone: number;
};

export type ReviewDailyProgress = Record<CardDeckType, ReviewDailyDeckProgress>;

export type ReviewBucket = "new" | "learning" | "review" | "future";

export const defaultReviewSettings: ReviewSettings = {
  input: {
    newLimit: 20,
    reviewLimit: 100
  },
  "input-listening": {
    newLimit: 20,
    reviewLimit: 100
  },
  output: {
    newLimit: 20,
    reviewLimit: 100
  }
};

export function normalizeReviewSettings(value: unknown): ReviewSettings {
  const candidate = value as Partial<Record<CardDeckType, Partial<ReviewDeckSettings>>> | null;

  return {
    input: normalizeDeckSettings(candidate?.input, defaultReviewSettings.input),
    "input-listening": normalizeDeckSettings(
      candidate?.["input-listening"],
      defaultReviewSettings["input-listening"]
    ),
    output: normalizeDeckSettings(candidate?.output, defaultReviewSettings.output)
  };
}

export function createEmptyReviewDailyProgress(): ReviewDailyProgress {
  return {
    input: {
      newDone: 0,
      reviewDone: 0
    },
    "input-listening": {
      newDone: 0,
      reviewDone: 0
    },
    output: {
      newDone: 0,
      reviewDone: 0
    }
  };
}

export function normalizeReviewDailyProgress(value: unknown): ReviewDailyProgress {
  const candidate = value as Partial<Record<CardDeckType, Partial<ReviewDailyDeckProgress>>> | null;

  return {
    input: normalizeDailyDeckProgress(candidate?.input),
    "input-listening": normalizeDailyDeckProgress(candidate?.["input-listening"]),
    output: normalizeDailyDeckProgress(candidate?.output)
  };
}

export function getReviewDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function buildReviewDeckStats(cards: StudyCard[], now = new Date()): ReviewStats {
  const stats = createEmptyStats();
  const todayKey = getReviewDateKey(now);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartTime = todayStart.getTime();

  for (const card of cards) {
    const deck = card.deckType;
    if (!isReviewDeck(deck)) {
      continue;
    }

    const deckStats = stats[deck];
    deckStats.totalCount += 1;

    const bucket = getReviewBucket(card, now);
    if (bucket === "new") {
      deckStats.newCount += 1;
    } else if (bucket === "learning") {
      deckStats.learningCount += 1;
    } else if (bucket === "review") {
      deckStats.reviewCount += 1;
      if (getDueTime(card) < todayStartTime) {
        deckStats.overdueCount += 1;
      }
    }

    if (card.srs.lastReviewedAt && getReviewDateKey(new Date(card.srs.lastReviewedAt)) === todayKey) {
      deckStats.doneTodayCount += 1;
    }
  }

  return stats;
}

export function getReviewBucket(card: StudyCard, now = new Date()): ReviewBucket {
  const reviewCount = card.srs.reviewCount ?? 0;
  const intervalDays = card.srs.intervalDays ?? 0;

  if (reviewCount === 0) {
    return "new";
  }

  if (intervalDays === 0) {
    return "learning";
  }

  if (intervalDays >= 1 && getDueTime(card) <= now.getTime()) {
    return "review";
  }

  return "future";
}

export function getReviewLimitBucket(card: StudyCard): "new" | "review" {
  return card.srs.reviewCount === 0 ? "new" : "review";
}

export function filterReviewQueueByDeckAndLimits(
  dueCards: StudyCard[],
  deck: CardDeckType,
  settings: ReviewSettings,
  now = new Date(),
  progress: ReviewDailyProgress = createEmptyReviewDailyProgress()
) {
  const deckSettings = settings[deck];
  const deckProgress = progress[deck];
  let remainingNew = Math.max(0, deckSettings.newLimit - deckProgress.newDone);
  let remainingReview = Math.max(0, deckSettings.reviewLimit - deckProgress.reviewDone);
  const queue: StudyCard[] = [];

  for (const card of dueCards) {
    if (card.deckType !== deck || getDueTime(card) > now.getTime()) {
      continue;
    }

    const limitBucket = getReviewLimitBucket(card);
    if (limitBucket === "new") {
      if (remainingNew <= 0) {
        continue;
      }
      remainingNew -= 1;
      queue.push(card);
      continue;
    }

    if (remainingReview <= 0) {
      continue;
    }
    remainingReview -= 1;
    queue.push(card);
  }

  return queue;
}

function normalizeDeckSettings(
  value: Partial<ReviewDeckSettings> | undefined,
  fallback: ReviewDeckSettings
): ReviewDeckSettings {
  return {
    newLimit: normalizeLimit(value?.newLimit, fallback.newLimit),
    reviewLimit: normalizeLimit(value?.reviewLimit, fallback.reviewLimit)
  };
}

function normalizeDailyDeckProgress(value: Partial<ReviewDailyDeckProgress> | undefined) {
  return {
    newDone: normalizeLimit(value?.newDone, 0),
    reviewDone: normalizeLimit(value?.reviewDone, 0)
  };
}

function normalizeLimit(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function createEmptyStats(): ReviewStats {
  return {
    input: {
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      overdueCount: 0,
      totalCount: 0,
      doneTodayCount: 0
    },
    "input-listening": {
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      overdueCount: 0,
      totalCount: 0,
      doneTodayCount: 0
    },
    output: {
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      overdueCount: 0,
      totalCount: 0,
      doneTodayCount: 0
    }
  };
}

function getDueTime(card: StudyCard) {
  const time = Date.parse(card.srs.dueAt);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isReviewDeck(value: unknown): value is CardDeckType {
  return value === "input" || value === "input-listening" || value === "output";
}
