export type DailyRoutineStatus = "running" | "paused" | "completed";

export type DailyRoutineStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped";

export type DailyRoutineStepId =
  | "review"
  | "listening-loop"
  | "writing-practice"
  | "claim-rewards";

export type DailyRoutineRoute =
  | "review"
  | "listeningLoop"
  | "writingPractice"
  | "pdfHub";

export type DailyRoutineStepDefinition = {
  id: DailyRoutineStepId;
  title: string;
  description: string;
  actionLabel: string;
  route: DailyRoutineRoute;
  estimatedMinutes: number;
};

export type DailyRoutineStep = DailyRoutineStepDefinition & {
  status: DailyRoutineStepStatus;
  startedAt?: string;
  completedAt?: string;
};

export type DailyRoutineRun = {
  schemaVersion: 1;
  id: string;
  dateKey: string;
  profileId: string;
  status: DailyRoutineStatus;
  currentStepId: DailyRoutineStepId;
  steps: DailyRoutineStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export const dailyRoutineDefinitions: DailyRoutineStepDefinition[] = [
  {
    id: "review",
    title: "복습",
    description: "오늘 due 카드부터 먼저 처리합니다.",
    actionLabel: "복습 화면 열기",
    route: "review",
    estimatedMinutes: 10
  },
  {
    id: "listening-loop",
    title: "듣기 루프",
    description: "짧은 영상 구간을 반복해서 듣고 필요한 문장을 저장합니다.",
    actionLabel: "듣기 루프 열기",
    route: "listeningLoop",
    estimatedMinutes: 8
  },
  {
    id: "writing-practice",
    title: "영작 훈련",
    description: "한국어 문장을 영어로 바꾸는 훈련을 진행합니다.",
    actionLabel: "영작 훈련 열기",
    route: "writingPractice",
    estimatedMinutes: 6
  },
  {
    id: "claim-rewards",
    title: "보상 정리",
    description: "완료된 오늘 미션 보상과 보너스를 수령합니다.",
    actionLabel: "보상 받기",
    route: "pdfHub",
    estimatedMinutes: 1
  }
];

export function createDailyRoutineRun(dateKey: string, profileId: string): DailyRoutineRun {
  const now = new Date().toISOString();
  const steps = dailyRoutineDefinitions.map((step, index): DailyRoutineStep => ({
    ...step,
    status: index === 0 ? "running" : "pending",
    startedAt: index === 0 ? now : undefined
  }));

  return {
    schemaVersion: 1,
    id: `daily-routine:${profileId}:${dateKey}:${Date.now()}`,
    dateKey,
    profileId,
    status: "running",
    currentStepId: steps[0].id,
    steps,
    createdAt: now,
    updatedAt: now
  };
}

export function getCurrentRoutineStep(run: DailyRoutineRun | null) {
  if (!run) {
    return null;
  }
  return run.steps.find((step) => step.id === run.currentStepId) ?? run.steps[0] ?? null;
}

export function getDailyRoutineProgress(run: DailyRoutineRun | null) {
  if (!run) {
    return {
      completedCount: 0,
      skippedCount: 0,
      totalCount: dailyRoutineDefinitions.length,
      percent: 0
    };
  }

  const completedCount = run.steps.filter((step) => step.status === "completed").length;
  const skippedCount = run.steps.filter((step) => step.status === "skipped").length;
  const totalCount = run.steps.length;
  return {
    completedCount,
    skippedCount,
    totalCount,
    percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  };
}

export function normalizeDailyRoutineRun(
  value: unknown,
  dateKey: string,
  profileId: string
): DailyRoutineRun | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<DailyRoutineRun>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.dateKey !== dateKey ||
    candidate.profileId !== profileId ||
    !Array.isArray(candidate.steps) ||
    candidate.steps.length === 0
  ) {
    return null;
  }

  const storedStepsById = new Map(
    candidate.steps
      .filter((step): step is DailyRoutineStep => Boolean(step))
      .map((step) => [step.id, step])
  );
  const normalizedSteps = dailyRoutineDefinitions.map((definition) => {
    const stored = storedStepsById.get(definition.id);
    return {
      ...definition,
      status: normalizeStepStatus(stored?.status),
      startedAt: stored?.startedAt,
      completedAt: stored?.completedAt
    };
  });

  if (normalizedSteps.length === 0) {
    return null;
  }

  const storedStatus = normalizeRunStatus(candidate.status);
  const hasOpenSteps = normalizedSteps.some(
    (step) => step.status === "pending" || step.status === "running"
  );
  const storedCurrentStep = normalizedSteps.find((step) => step.id === candidate.currentStepId);
  const storedCurrentStepIsOpen =
    storedCurrentStep?.status === "pending" || storedCurrentStep?.status === "running";
  const currentStep =
    (storedCurrentStepIsOpen ? storedCurrentStep : null) ??
    normalizedSteps.find((step) => step.status === "running") ??
    normalizedSteps.find((step) => step.status === "pending") ??
    storedCurrentStep ??
    normalizedSteps[normalizedSteps.length - 1];

  return {
    schemaVersion: 1,
    id: typeof candidate.id === "string" ? candidate.id : `daily-routine:${profileId}:${dateKey}`,
    dateKey,
    profileId,
    status: storedStatus === "completed" && hasOpenSteps ? "running" : storedStatus,
    currentStepId: currentStep.id,
    steps: normalizedSteps,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : undefined
  };
}

export function getDailyRoutineStorageKey(profileId: string) {
  return `lem:dailyRoutine:${profileId}`;
}

function normalizeRunStatus(status: unknown): DailyRoutineStatus {
  if (status === "completed") {
    return status;
  }
  return "running";
}

function normalizeStepStatus(status: unknown): DailyRoutineStepStatus {
  if (status === "running" || status === "completed" || status === "skipped") {
    return status;
  }
  return "pending";
}
