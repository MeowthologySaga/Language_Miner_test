import type {
  CardDeckType,
  DailyMissionBoard,
  DailyMissionBonusStatus,
  DailyMissionCategory,
  DailyMissionId,
  DailyMissionProgress,
  DailyMissionStatus,
  DiamondTransaction,
  LearningMissionEventType
} from "./types";

export type DailyMissionDefinition = {
  id: DailyMissionId;
  category: DailyMissionCategory;
  title: string;
  description: string;
  eventType: LearningMissionEventType;
  goal: number;
  rewardDiamonds: number;
};

export const dailyMissionDefinitions: DailyMissionDefinition[] = [
  {
    id: "card-2",
    category: "input",
    title: "인풋-리딩 카드 5장 만들기",
    description: "문서/웹/OCR에서 인풋-리딩 카드를 5장 저장",
    eventType: "card_created",
    goal: 5,
    rewardDiamonds: 15
  },
  {
    id: "listening-30",
    category: "input",
    title: "오늘 들은 문장 30개",
    description: "듣기 루프에서 다음 문장으로 넘긴 문장 30개",
    eventType: "listening_sentence_completed",
    goal: 30,
    rewardDiamonds: 20
  },
  {
    id: "writing-3",
    category: "output",
    title: "영작 훈련 3문제",
    description: "영작 훈련 확인을 3번 완료",
    eventType: "writing_practice_completed",
    goal: 3,
    rewardDiamonds: 15
  },
  {
    id: "life-mining-card-5",
    category: "output",
    title: "라이프 마이닝 카드 5개 만들기",
    description: "라이프 마이닝에서 아웃풋 카드를 5개 저장",
    eventType: "life_mining_card_created",
    goal: 5,
    rewardDiamonds: 25
  },
  {
    id: "review-input-reading-deck",
    category: "review",
    title: "인풋-리딩덱 복습 끝내기",
    description: "오늘 예정된 인풋-리딩덱 복습을 모두 처리",
    eventType: "review_input_reading_deck_completed",
    goal: 1,
    rewardDiamonds: 15
  },
  {
    id: "review-input-listening-deck",
    category: "review",
    title: "인풋-리스닝덱 복습 끝내기",
    description: "오늘 예정된 인풋-리스닝덱 복습을 모두 처리",
    eventType: "review_input_listening_deck_completed",
    goal: 1,
    rewardDiamonds: 15
  },
  {
    id: "review-output-deck",
    category: "review",
    title: "아웃풋덱 복습 끝내기",
    description: "오늘 예정된 아웃풋덱 복습을 모두 처리",
    eventType: "review_output_deck_completed",
    goal: 1,
    rewardDiamonds: 15
  }
];

export const dailyBonusDefinition = {
  id: "daily-bonus" as const,
  title: "오늘 보너스",
  description: "기본 미션 보상 모두 받기",
  rewardDiamonds: 30
};

export function getMissionDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function findMissionByEventType(type: LearningMissionEventType) {
  return dailyMissionDefinitions.find((mission) => mission.eventType === type) ?? null;
}

export function findMissionDefinitionsByEventType(type: LearningMissionEventType) {
  return dailyMissionDefinitions.filter((mission) => mission.eventType === type);
}

export function findMissionDefinition(missionId: string) {
  return dailyMissionDefinitions.find((mission) => mission.id === missionId) ?? null;
}

export function getReviewDeckCompletedEventType(
  deck: CardDeckType
): LearningMissionEventType {
  if (deck === "input-listening") {
    return "review_input_listening_deck_completed";
  }
  if (deck === "output") {
    return "review_output_deck_completed";
  }
  return "review_input_reading_deck_completed";
}

export function buildDailyMissionBoard(
  dateKey: string,
  progressRows: DailyMissionProgress[],
  transactions: Pick<DiamondTransaction, "dateKey" | "type" | "amount">[] = []
): DailyMissionBoard {
  const progressById = new Map(progressRows.map((row) => [row.missionId, row]));
  const missions: DailyMissionStatus[] = dailyMissionDefinitions.map((definition) => {
    const progress = progressById.get(definition.id);
    const value = Math.min(definition.goal, Math.max(0, progress?.progress ?? 0));
    const claimed = progress?.claimed === true;
    const completed = value >= definition.goal;
    return {
      ...definition,
      progress: value,
      completed,
      claimed,
      claimable: completed && !claimed
    };
  });
  const allBaseRewardsClaimed = missions.every((mission) => mission.claimed);
  const bonusProgress = progressById.get(dailyBonusDefinition.id);
  const bonusClaimed = bonusProgress?.claimed === true;
  const bonus: DailyMissionBonusStatus = {
    ...dailyBonusDefinition,
    completed: allBaseRewardsClaimed,
    claimable: allBaseRewardsClaimed && !bonusClaimed,
    claimed: bonusClaimed
  };
  const earnedToday = transactions
    .filter((transaction) => transaction.dateKey === dateKey && transaction.type === "earn")
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0);

  return {
    dateKey,
    missions,
    bonus,
    earnedToday,
    allBaseRewardsClaimed
  };
}

export function normalizeDailyMissionBoard(
  board: DailyMissionBoard | null | undefined,
  fallbackDateKey = getMissionDateKey()
): DailyMissionBoard {
  const dateKey = typeof board?.dateKey === "string" && board.dateKey ? board.dateKey : fallbackDateKey;
  const updatedAt = new Date().toISOString();
  const progressRows: DailyMissionProgress[] = [];

  for (const mission of Array.isArray(board?.missions) ? board.missions : []) {
    const definition = findMissionDefinition(mission.id);
    if (!definition) {
      continue;
    }
    progressRows.push({
      dateKey,
      missionId: definition.id,
      progress: normalizeProgressValue(
        typeof mission.progress === "number" ? mission.progress : mission.completed ? definition.goal : 0,
        definition.goal
      ),
      claimed: mission.claimed === true,
      updatedAt
    });
  }

  if (board?.bonus?.claimed) {
    progressRows.push({
      dateKey,
      missionId: dailyBonusDefinition.id,
      progress: 1,
      claimed: true,
      updatedAt
    });
  }

  const normalized = buildDailyMissionBoard(dateKey, progressRows);
  return {
    ...normalized,
    earnedToday: normalizeNonNegativeInteger(board?.earnedToday, normalized.earnedToday)
  };
}

export function createEmptyMissionProgress(
  dateKey: string,
  missionId: DailyMissionProgress["missionId"],
  nowIso = new Date().toISOString()
): DailyMissionProgress {
  return {
    dateKey,
    missionId,
    progress: 0,
    claimed: false,
    updatedAt: nowIso
  };
}

function normalizeProgressValue(value: number, goal: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(goal, Math.max(0, Math.floor(value)));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}
