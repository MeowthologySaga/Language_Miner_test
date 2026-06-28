import type { ReviewRating, StudyCard } from "./types";

export type StudyCardSrs = StudyCard["srs"];

const minEaseFactor = 1.3;
const defaultEaseFactor = 2.5;

export function createInitialSrs(now = new Date()): StudyCardSrs {
  return {
    dueAt: now.toISOString(),
    intervalDays: 0,
    easeFactor: defaultEaseFactor,
    reviewCount: 0,
    lapseCount: 0
  };
}

export function scheduleCardReview(
  srs: StudyCardSrs,
  rating: ReviewRating,
  now = new Date()
): StudyCardSrs {
  const easeFactor = normalizeEaseFactor(srs.easeFactor);
  const reviewCount = srs.reviewCount + 1;
  const base = {
    ...srs,
    reviewCount,
    lastReviewedAt: now.toISOString()
  };
  const isGraduated = srs.intervalDays >= 1;

  if (!isGraduated) {
    return scheduleLearningReview(base, rating, now, easeFactor);
  }

  return scheduleGraduatedReview(base, rating, now, easeFactor);
}

export function getNextReviewIntervalLabel(
  card: Pick<StudyCard, "srs">,
  rating: ReviewRating,
  now = new Date()
) {
  const next = scheduleCardReview(card.srs, rating, now);
  return formatReviewInterval(next.dueAt, now);
}

export function getReviewRatingLabel(rating: ReviewRating) {
  if (rating === "again") {
    return "다시";
  }
  if (rating === "hard") {
    return "어려움";
  }
  if (rating === "good") {
    return "좋음";
  }
  return "쉬움";
}

function scheduleLearningReview(
  srs: StudyCardSrs,
  rating: ReviewRating,
  now: Date,
  easeFactor: number
): StudyCardSrs {
  if (rating === "again") {
    return {
      ...srs,
      dueAt: addMinutes(now, 1).toISOString(),
      intervalDays: 0,
      easeFactor: clampEase(easeFactor - 0.2),
      lapseCount: srs.lapseCount + 1
    };
  }

  if (rating === "hard") {
    return {
      ...srs,
      dueAt: addMinutes(now, 6).toISOString(),
      intervalDays: 0,
      easeFactor: clampEase(easeFactor - 0.15)
    };
  }

  if (rating === "good") {
    return {
      ...srs,
      dueAt: addDays(now, 1).toISOString(),
      intervalDays: 1,
      easeFactor
    };
  }

  return {
    ...srs,
    dueAt: addDays(now, 4).toISOString(),
    intervalDays: 4,
    easeFactor: clampEase(easeFactor + 0.15)
  };
}

function scheduleGraduatedReview(
  srs: StudyCardSrs,
  rating: ReviewRating,
  now: Date,
  easeFactor: number
): StudyCardSrs {
  const currentInterval = Math.max(1, srs.intervalDays);

  if (rating === "again") {
    return {
      ...srs,
      dueAt: addMinutes(now, 10).toISOString(),
      intervalDays: 0,
      easeFactor: clampEase(easeFactor - 0.2),
      lapseCount: srs.lapseCount + 1
    };
  }

  if (rating === "hard") {
    const intervalDays = Math.max(1, Math.round(currentInterval * 1.2));
    return {
      ...srs,
      dueAt: addDays(now, intervalDays).toISOString(),
      intervalDays,
      easeFactor: clampEase(easeFactor - 0.15)
    };
  }

  if (rating === "good") {
    const intervalDays = Math.max(currentInterval + 1, Math.round(currentInterval * easeFactor));
    return {
      ...srs,
      dueAt: addDays(now, intervalDays).toISOString(),
      intervalDays,
      easeFactor
    };
  }

  const intervalDays = Math.max(
    currentInterval + 2,
    Math.round(currentInterval * easeFactor * 1.3)
  );
  return {
    ...srs,
    dueAt: addDays(now, intervalDays).toISOString(),
    intervalDays,
    easeFactor: clampEase(easeFactor + 0.15)
  };
}

function formatReviewInterval(dueAt: string, now: Date) {
  const dueTime = new Date(dueAt).getTime();
  const diffMs = Math.max(0, dueTime - now.getTime());
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) {
    return `${minutes}분`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}시간`;
  }

  const days = Math.round(hours / 24);
  if (days < 31) {
    return `${days}일`;
  }

  const months = Math.round(days / 30);
  return `${months}개월`;
}

function normalizeEaseFactor(value: number) {
  return Number.isFinite(value) && value > 0 ? value : defaultEaseFactor;
}

function clampEase(value: number) {
  return Math.max(minEaseFactor, Number(value.toFixed(2)));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}
