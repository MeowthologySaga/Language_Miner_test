import {
  getDailyRoutineStorageKey,
  normalizeDailyRoutineRun,
  type DailyRoutineStepId,
  type DailyRoutineRun
} from "./shared/dailyRoutine";
import { getMissionDateKey } from "./shared/dailyMissions";
import type { ProfileId } from "./shared/types";

export function readDailyRoutineRun(profileId: ProfileId) {
  try {
    const raw = localStorage.getItem(getDailyRoutineStorageKey(profileId));
    return normalizeDailyRoutineRun(raw ? JSON.parse(raw) : null, getMissionDateKey(), profileId);
  } catch {
    return null;
  }
}

export function finishDailyRoutineStep(
  run: DailyRoutineRun,
  status: "completed" | "skipped"
): DailyRoutineRun {
  const now = new Date().toISOString();
  const currentIndex = Math.max(
    0,
    run.steps.findIndex((step) => step.id === run.currentStepId)
  );
  const currentStep = run.steps[currentIndex];
  if (!currentStep || currentStep.status === "skipped") {
    return run;
  }
  const nextPendingIndex = run.steps.findIndex(
    (step, index) => index > currentIndex && step.status === "pending"
  );
  const updatedSteps = run.steps.map((step, index) => {
    if (index === currentIndex) {
      return {
        ...step,
        status,
        completedAt: now
      };
    }
    if (index === nextPendingIndex) {
      return {
        ...step,
        status: "running" as const,
        startedAt: step.startedAt ?? now
      };
    }
    return step;
  });
  const nextSkippedIndex =
    nextPendingIndex < 0
      ? updatedSteps.findIndex((step) => step.status === "skipped")
      : -1;
  const nextIndex = nextPendingIndex >= 0 ? nextPendingIndex : nextSkippedIndex;
  const completed = nextIndex < 0;

  return {
    ...run,
    status: completed ? "completed" : "running",
    currentStepId: completed ? run.currentStepId : updatedSteps[nextIndex].id,
    steps: updatedSteps,
    updatedAt: now,
    completedAt: completed ? now : undefined
  };
}

export function goToPreviousDailyRoutineStep(run: DailyRoutineRun): DailyRoutineRun {
  const currentIndex = run.steps.findIndex((step) => step.id === run.currentStepId);
  if (currentIndex <= 0) {
    return run;
  }

  const now = new Date().toISOString();
  const previousStep = run.steps[currentIndex - 1];
  const shouldStartPreviousStep = previousStep.status === "pending";
  return {
    ...run,
    status: "running",
    currentStepId: previousStep.id,
    steps: run.steps.map((step, index) => {
      if (shouldStartPreviousStep && index === currentIndex && step.status === "running") {
        return {
          ...step,
          status: "pending" as const
        };
      }
      if (index === currentIndex - 1 && step.status === "pending") {
        return {
          ...step,
          status: "running" as const,
          startedAt: step.startedAt ?? now
        };
      }
      return step;
    }),
    updatedAt: now
  };
}

export function goToNextDailyRoutineStep(run: DailyRoutineRun): DailyRoutineRun {
  const currentIndex = run.steps.findIndex((step) => step.id === run.currentStepId);
  if (currentIndex < 0 || currentIndex >= run.steps.length - 1) {
    return run;
  }

  const now = new Date().toISOString();
  const nextIndex = currentIndex + 1;
  const nextStep = run.steps[nextIndex];
  const shouldStartNextStep = nextStep.status === "pending";
  return {
    ...run,
    status: "running",
    currentStepId: nextStep.id,
    steps: run.steps.map((step, index) => {
      if (shouldStartNextStep && index === currentIndex && step.status === "running") {
        return {
          ...step,
          status: "pending" as const
        };
      }
      if (index === nextIndex && step.status === "pending") {
        return {
          ...step,
          status: "running" as const,
          startedAt: step.startedAt ?? now
        };
      }
      return step;
    }),
    updatedAt: now
  };
}

export function reopenSkippedDailyRoutineStep(
  run: DailyRoutineRun,
  stepId: DailyRoutineStepId
): DailyRoutineRun {
  const targetStep = run.steps.find((step) => step.id === stepId);
  if (!targetStep || targetStep.status !== "skipped") {
    return run;
  }

  const now = new Date().toISOString();
  return {
    ...run,
    status: "running",
    currentStepId: stepId,
    steps: run.steps.map((step) => {
      if (step.id === stepId) {
        return {
          ...step,
          status: "running" as const,
          startedAt: step.startedAt ?? now,
          completedAt: undefined
        };
      }
      if (step.status === "running") {
        return {
          ...step,
          status: "pending" as const
        };
      }
      return step;
    }),
    updatedAt: now,
    completedAt: undefined
  };
}
