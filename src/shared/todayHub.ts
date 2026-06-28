import { buildReviewDeckStats, getReviewDateKey } from "./reviewStats";
import { isLifeLogProcessedForProfile } from "./lifeLogProgress";
import type { LifeLog, ProfileId, StudyCard } from "./types";

export type TodayHubSummary = {
  review: {
    totalDueCount: number;
    overdueCount: number;
    doneTodayCount: number;
    newCount: number;
  };
  life: {
    pendingCount: number;
    autoPendingCount: number;
    manualPendingCount: number;
    completedForProfileCount: number;
  };
  listening: {
    totalCardCount: number;
    dueCount: number;
    savedTodayCount: number;
  };
};

export type StudyActivityHeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type StudyActivityHeatmapDay = {
  dateKey: string;
  count: number;
  level: StudyActivityHeatmapLevel;
  isToday: boolean;
};

export type StudyActivityHeatmapWeek = {
  monthLabel: string;
  days: StudyActivityHeatmapDay[];
};

export type StudyActivityHeatmap = {
  weeks: StudyActivityHeatmapWeek[];
  totalCount: number;
  activeDayCount: number;
  maxCount: number;
  todayCount: number;
};

export function buildTodayHubSummary(input: {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  profileId?: ProfileId;
  now?: Date;
}): TodayHubSummary {
  const now = input.now ?? new Date();
  const reviewStats = buildReviewDeckStats(input.cards, now);
  const pendingLifeLogs = input.lifeLogs.filter(
    (log) => !isLifeLogProcessedForProfile(log, input.profileId)
  );
  const listeningCards = input.cards.filter((card) => card.deckType === "input-listening");
  const todayKey = getReviewDateKey(now);
  const listeningStats = reviewStats["input-listening"];

  return {
    review: {
      totalDueCount: sumReviewCounts([
        reviewStats.input,
        reviewStats["input-listening"],
        reviewStats.output
      ]),
      overdueCount:
        reviewStats.input.overdueCount +
        reviewStats["input-listening"].overdueCount +
        reviewStats.output.overdueCount,
      doneTodayCount:
        reviewStats.input.doneTodayCount +
        reviewStats["input-listening"].doneTodayCount +
        reviewStats.output.doneTodayCount,
      newCount:
        reviewStats.input.newCount +
        reviewStats["input-listening"].newCount +
        reviewStats.output.newCount
    },
    life: {
      pendingCount: pendingLifeLogs.length,
      autoPendingCount: pendingLifeLogs.filter((log) => log.sourceType === "browser_extension")
        .length,
      manualPendingCount: pendingLifeLogs.filter((log) => log.sourceType === "manual").length,
      completedForProfileCount: input.lifeLogs.length - pendingLifeLogs.length
    },
    listening: {
      totalCardCount: listeningCards.length,
      dueCount:
        listeningStats.newCount + listeningStats.learningCount + listeningStats.reviewCount,
      savedTodayCount: listeningCards.filter((card) =>
        card.createdAt ? getReviewDateKey(new Date(card.createdAt)) === todayKey : false
      ).length
    }
  };
}

export function buildStudyActivityHeatmap(input: {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  profileId?: ProfileId;
  now?: Date;
  weekCount?: number;
}): StudyActivityHeatmap {
  const now = input.now ?? new Date();
  const todayKey = getReviewDateKey(now);
  const weekCount = normalizeHeatmapWeekCount(input.weekCount);
  const days = getStudyActivityHeatmapDays(now, weekCount);
  const countByDateKey = new Map(days.map((day) => [day.dateKey, 0]));
  const activeProfileCards = input.cards.filter(
    (card) => !input.profileId || !card.profileId || card.profileId === input.profileId
  );

  for (const card of activeProfileCards) {
    incrementStudyActivity(countByDateKey, card.createdAt);
    incrementStudyActivity(countByDateKey, card.srs.lastReviewedAt);
  }

  for (const log of input.lifeLogs) {
    incrementStudyActivity(countByDateKey, log.createdAt);
  }

  const heatmapDays = days.map((day) => {
    const count = countByDateKey.get(day.dateKey) ?? 0;
    return {
      dateKey: day.dateKey,
      count,
      level: getStudyActivityHeatmapLevel(count),
      isToday: day.dateKey === todayKey
    };
  });

  const weeks = Array.from({ length: weekCount }, (_, weekIndex): StudyActivityHeatmapWeek => {
    const weekDays = heatmapDays.slice(weekIndex * 7, weekIndex * 7 + 7);
    const sourceDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    return {
      monthLabel: getStudyActivityMonthLabel(sourceDays, weekIndex === 0),
      days: weekDays
    };
  });
  const counts = heatmapDays.map((day) => day.count);

  return {
    weeks,
    totalCount: counts.reduce((total, count) => total + count, 0),
    activeDayCount: counts.filter((count) => count > 0).length,
    maxCount: Math.max(0, ...counts),
    todayCount: countByDateKey.get(todayKey) ?? 0
  };
}

function sumReviewCounts(
  stats: Array<{
    newCount: number;
    learningCount: number;
    reviewCount: number;
  }>
) {
  return stats.reduce(
    (total, stat) => total + stat.newCount + stat.learningCount + stat.reviewCount,
    0
  );
}

function normalizeHeatmapWeekCount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 26;
  }
  return Math.min(52, Math.max(1, Math.floor(value)));
}

function getStudyActivityHeatmapDays(now: Date, weekCount: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - mondayOffset - (weekCount - 1) * 7);

  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      dateKey: getReviewDateKey(date)
    };
  });
}

function incrementStudyActivity(countByDateKey: Map<string, number>, value: string | undefined) {
  if (!value) {
    return;
  }

  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return;
  }

  const dateKey = getReviewDateKey(new Date(time));
  if (!countByDateKey.has(dateKey)) {
    return;
  }

  countByDateKey.set(dateKey, (countByDateKey.get(dateKey) ?? 0) + 1);
}

function getStudyActivityHeatmapLevel(count: number): StudyActivityHeatmapLevel {
  if (count <= 0) {
    return 0;
  }
  if (count <= 2) {
    return 1;
  }
  if (count <= 5) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return 4;
}

function getStudyActivityMonthLabel(
  weekDays: Array<{
    date: Date;
  }>,
  isFirstWeek: boolean
) {
  const monthStart = weekDays.find((day) => day.date.getDate() === 1);
  if (!isFirstWeek && !monthStart) {
    return "";
  }

  const labelDate = monthStart?.date ?? weekDays[0]?.date;
  if (!labelDate) {
    return "";
  }

  return `${labelDate.getMonth() + 1}월`;
}
