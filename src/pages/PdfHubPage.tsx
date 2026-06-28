import {
  BookOpen,
  Clock,
  Film,
  Headphones,
  Languages,
  Lightbulb,
  ListChecks,
  PlayCircle,
  RotateCcw
} from "lucide-react";
import type { ReactNode } from "react";
import type { DailyRoutineRun, DailyRoutineStep } from "../shared/dailyRoutine";
import { DailyMissionPanel } from "../components/DailyMissionPanel";
import { getReviewDateKey } from "../shared/reviewStats";
import {
  buildStudyActivityHeatmap,
  buildTodayHubSummary,
  type StudyActivityHeatmap
} from "../shared/todayHub";
import type {
  DailyMissionBoard,
  DailyMissionId,
  DiamondWallet,
  LifeLog,
  ProfileId,
  StudyCard
} from "../shared/types";

type PdfHubRoute =
  | "pdfReader"
  | "bookMaker"
  | "documentLibrary"
  | "review"
  | "life"
  | "listeningLoop"
  | "videoReader"
  | "writingPractice";

type PdfHubPageProps = {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  missionBoard: DailyMissionBoard;
  profileId: ProfileId;
  routineCurrentStep: DailyRoutineStep | null;
  routineProgress: {
    completedCount: number;
    totalCount: number;
    percent: number;
  };
  routineRun: DailyRoutineRun | null;
  wallet: DiamondWallet;
  onClaimMission: (missionId: DailyMissionId) => Promise<void>;
  onClaimDailyBonus: () => Promise<void>;
  onNavigate: (route: PdfHubRoute) => void;
  onResumeRoutine: () => void;
  onStartRoutine: () => void;
};

export function PdfHubPage({
  cards,
  lifeLogs,
  missionBoard,
  profileId,
  routineCurrentStep,
  routineProgress,
  routineRun,
  wallet,
  onClaimMission,
  onClaimDailyBonus,
  onNavigate,
  onResumeRoutine,
  onStartRoutine
}: PdfHubPageProps) {
  const todaySummary = buildTodayHubSummary({
    cards,
    lifeLogs,
    profileId
  });
  const reviewMissions = missionBoard.missions.filter((mission) => mission.category === "review");
  const cardMission = missionBoard.missions.find((mission) => mission.id === "card-2");
  const reviewGoal = reviewMissions.length || 3;
  const reviewProgress = reviewMissions.length
    ? reviewMissions.filter((mission) => mission.completed).length
    : Math.min(reviewGoal, todaySummary.review.doneTodayCount);
  const candidateGoal = Math.max(
    cardMission?.goal ?? 2,
    todaySummary.life.pendingCount + todaySummary.life.completedForProfileCount
  );
  const candidateProgress = Math.min(candidateGoal, todaySummary.life.pendingCount);
  const listeningGoal = Math.max(
    5,
    todaySummary.listening.savedTodayCount + todaySummary.listening.dueCount
  );
  const listeningProgress = Math.min(listeningGoal, todaySummary.listening.savedTodayCount);
  const weekSeries = buildTodayHubWeekSeries({
    cards,
    lifeLogs
  });
  const activityHeatmap = buildStudyActivityHeatmap({
    cards,
    lifeLogs,
    profileId
  });

  return (
    <div className="document-page pdf-hub-page">
      <section className="pdf-hub-shell">
        <section className="today-hub-panel" data-qa="today-hub">
          <div className="today-hub-command-row">
            <div className="today-hub-heading">
              <span className="today-hub-eyebrow">Today Hub</span>
              <h2>오늘의 작업대</h2>
              <p>오늘 바로 처리할 학습량만 조용하게 보여줍니다.</p>
            </div>
          </div>
          <div className="today-hub-grid">
            <TodayHubCard
              accent="review"
              actionLabel="복습 시작"
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.review}
              current={reviewProgress}
              dataQa="today-hub-open-review"
              icon={<RotateCcw size={22} />}
              status="덱 완료"
              target={reviewGoal}
              title="오늘 복습"
              onClick={() => onNavigate("review")}
            />
            <TodayHubCard
              accent="life"
              actionLabel="후보 확인"
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.life}
              current={candidateProgress}
              dataQa="today-hub-open-life"
              icon={<Lightbulb size={22} />}
              status="후보 대기"
              target={candidateGoal}
              title="새 카드 후보"
              onClick={() => onNavigate("life")}
            />
            <TodayHubCard
              accent="listening"
              actionLabel="듣기 시작"
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.listening}
              current={listeningProgress}
              dataQa="today-hub-open-listening"
              icon={<Headphones size={22} />}
              status="문장 저장"
              target={listeningGoal}
              title="듣기 루프"
              onClick={() => onNavigate("listeningLoop")}
            />
          </div>
          <StudyActivityGrass heatmap={activityHeatmap} />
        </section>

        <section className={getRoutinePanelClassName(routineRun)}>
          <div className="daily-routine-panel-main">
            <span className="daily-routine-panel-icon">
              <ListChecks size={22} />
            </span>
            <div>
              <span className="daily-routine-eyebrow">오늘 루틴</span>
              <h2>{getRoutineTitle(routineRun)}</h2>
              <p>{getRoutineDescription(routineRun, routineCurrentStep)}</p>
            </div>
          </div>
          <div className="daily-routine-side">
            <span className="daily-routine-count">
              {routineProgress.completedCount} / {routineProgress.totalCount}
            </span>
            <span className="daily-routine-track" aria-hidden="true">
              <span style={{ width: `${routineProgress.percent}%` }} />
            </span>
            <button
              className="button primary"
              type="button"
              onClick={routineRun?.status === "running" ? onResumeRoutine : routineRun?.status === "paused" ? onResumeRoutine : onStartRoutine}
            >
              <PlayCircle size={17} />
              {getRoutineButtonLabel(routineRun)}
            </button>
          </div>
        </section>

        <DailyMissionPanel
          missionBoard={missionBoard}
          wallet={wallet}
          onClaimDailyBonus={onClaimDailyBonus}
          onClaimMission={onClaimMission}
        />

        <div className="pdf-hub-title">
          <h2>무엇을 할까요?</h2>
          <p>문서 읽기, 복습, 듣기 훈련까지 오늘 필요한 학습으로 바로 이동하세요.</p>
        </div>

        <div className="mode-card-grid">
          <article className="mode-choice-card reader-choice">
            <div className="mode-card-icon">
              <BookOpen size={42} />
            </div>
            <h3>리더 모드</h3>
            <p>PDF를 읽고 번역을 보며 학습할 수 있습니다.</p>
            <button
              className="button primary reader-action"
              data-qa="pdf-hub-open-reader"
              type="button"
              onClick={() => onNavigate("pdfReader")}
            >
              리더기 열기
            </button>
            <ul>
              <li>좌우 번역 보기</li>
              <li>단어/문장 카드 학습</li>
              <li>북마크 및 메모</li>
            </ul>
          </article>

          <article className="mode-choice-card maker-choice">
            <div className="mode-card-icon">
              <Languages size={42} />
            </div>
            <h3>이중언어 책 만들기</h3>
            <p>PDF를 이중언어 책으로 내보낼 수 있습니다.</p>
            <button
              className="button primary maker-action"
              data-qa="pdf-hub-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              새 프로젝트 시작
            </button>
            <ul>
              <li>번역 품질 최적화</li>
              <li>레이아웃 보존</li>
              <li>완성본 내보내기</li>
            </ul>
          </article>

          <article className="mode-choice-card review-choice">
            <div className="mode-card-icon">
              <RotateCcw size={42} />
            </div>
            <h3>복습</h3>
            <p>리딩, 리스닝, 아웃풋 덱을 나눠 Anki식으로 복습합니다.</p>
            <button
              className="button primary review-action"
              data-qa="pdf-hub-open-review"
              type="button"
              onClick={() => onNavigate("review")}
            >
              복습 시작
            </button>
            <ul>
              <li>인풋-리딩 / 인풋-리스닝 / 아웃풋 분리</li>
              <li>답 보기 후 복습 평가</li>
              <li>간격 반복 스케줄</li>
            </ul>
          </article>

          <article className="mode-choice-card listening-choice">
            <div className="mode-card-icon">
              <Headphones size={42} />
            </div>
            <h3>듣기 루프</h3>
            <p>매일 추천 영상에서 짧은 문장을 반복해서 듣습니다.</p>
            <button
              className="button primary listening-action"
              data-qa="pdf-hub-open-listening"
              type="button"
              onClick={() => onNavigate("listeningLoop")}
            >
              듣기 시작
            </button>
            <ul>
              <li>문장 구간 반복</li>
              <li>자막 가리기 / 영상 가리기</li>
              <li>인풋-리스닝 저장</li>
            </ul>
          </article>

          <article className="mode-choice-card video-choice">
            <div className="mode-card-icon">
              <Film size={42} />
            </div>
            <h3>영상 리더</h3>
            <p>직접 고른 영상으로 자막, 번역, 셰도잉을 관리합니다.</p>
            <button
              className="button primary video-action"
              data-qa="pdf-hub-open-video"
              type="button"
              onClick={() => onNavigate("videoReader")}
            >
              영상 열기
            </button>
            <ul>
              <li>로컬 영상 / YouTube</li>
              <li>Whisper 전사와 이중자막</li>
              <li>자막 문장 카드화</li>
            </ul>
          </article>
        </div>

        <button
          className="button secondary recent-document-button"
          data-qa="pdf-hub-open-recent-documents"
          type="button"
          onClick={() => onNavigate("documentLibrary")}
        >
          <Clock size={17} />
          최근 문서 열기
        </button>
      </section>
    </div>
  );
}

function StudyActivityGrass({ heatmap }: { heatmap: StudyActivityHeatmap }) {
  return (
    <section
      aria-label={`최근 ${heatmap.weeks.length}주 공부 활동 ${formatInteger(heatmap.totalCount)}개`}
      className="study-activity-panel"
      data-qa="today-hub-activity-grass"
    >
      <div className="study-activity-header">
        <div>
          <span className="study-activity-eyebrow">최근 {heatmap.weeks.length}주</span>
          <h3>공부 잔디</h3>
        </div>
        <div className="study-activity-stats">
          <span>
            <strong>{formatInteger(heatmap.totalCount)}</strong>
            전체
          </span>
          <span>
            <strong>{formatInteger(heatmap.activeDayCount)}</strong>
            활동일
          </span>
          <span>
            <strong>{formatInteger(heatmap.todayCount)}</strong>
            오늘
          </span>
        </div>
      </div>
      <div className="study-activity-board">
        <div className="study-activity-weekday-labels" aria-hidden="true">
          <span>월</span>
          <span>수</span>
          <span>금</span>
        </div>
        <div className="study-activity-scroll">
          <div className="study-activity-months" aria-hidden="true">
            {heatmap.weeks.map((week, index) => (
              <span key={`${week.monthLabel}-${index}`}>{week.monthLabel}</span>
            ))}
          </div>
          <div className="study-activity-weeks">
            {heatmap.weeks.map((week, weekIndex) => (
              <div className="study-activity-week" key={weekIndex}>
                {week.days.map((day) => (
                  <span
                    aria-label={`${day.dateKey}: ${formatInteger(day.count)}개 활동`}
                    className={
                      day.isToday
                        ? `study-activity-cell level-${day.level} today`
                        : `study-activity-cell level-${day.level}`
                    }
                    key={day.dateKey}
                    title={`${day.dateKey} · ${formatInteger(day.count)}개`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="study-activity-footer">
        <span>복습 · 카드 · 라이프 로그</span>
        <div className="study-activity-legend" aria-hidden="true">
          <span>적음</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i className={`study-activity-cell level-${level}`} key={level} />
          ))}
          <span>많음</span>
        </div>
      </div>
    </section>
  );
}

type TodayHubCardProps = {
  accent: "review" | "life" | "listening";
  actionLabel: string;
  barHighlightIndex: number;
  barLabels: string[];
  barValues: number[];
  current: number;
  dataQa: string;
  icon: ReactNode;
  status: string;
  target: number;
  title: string;
  onClick: () => void;
};

function TodayHubCard({
  accent,
  actionLabel,
  barHighlightIndex,
  barLabels,
  barValues,
  current,
  dataQa,
  icon,
  status,
  target,
  title,
  onClick
}: TodayHubCardProps) {
  const color = getTodayHubAccentColor(accent);
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const maxBarValue = Math.max(1, ...barValues);

  return (
    <button
      aria-label={`${title}: ${actionLabel}`}
      className={`today-hub-card ${accent}`}
      data-qa={dataQa}
      type="button"
      onClick={onClick}
    >
      <div className="today-hub-card-title">
        <span className="today-hub-card-icon">{icon}</span>
        <strong>{title}</strong>
      </div>
      <div className="today-hub-card-body">
        <span
          aria-label={`${title} ${formatInteger(current)} / ${formatInteger(target)}`}
          className="today-hub-ring"
          style={{
            background: `conic-gradient(${color} ${percent}%, #edf2f7 0)`
          }}
        >
          <span />
        </span>
        <div className="today-hub-card-metric">
          <strong>
            {formatInteger(current)}
            <span>/ {formatInteger(target)}</span>
          </strong>
          <small>{status}</small>
        </div>
        <div className="today-hub-mini-chart" aria-hidden="true">
          {barValues.map((value, index) => (
            <span
              className={
                index === barHighlightIndex ? "today-hub-mini-bar today" : "today-hub-mini-bar"
              }
              key={`${barLabels[index] ?? index}-${index}`}
            >
              <i style={{ height: `${getTodayHubBarHeight(value, maxBarValue)}px` }} />
              <small>{barLabels[index] ?? ""}</small>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

type TodayHubWeekSeries = {
  labels: string[];
  todayIndex: number;
  review: number[];
  life: number[];
  listening: number[];
};

function buildTodayHubWeekSeries(input: {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  now?: Date;
}): TodayHubWeekSeries {
  const days = getCurrentWeekDays(input.now ?? new Date());
  const labels = days.map((day) => getWeekdayLabel(day.date));
  const reviewCounts = countByDateKey(
    input.cards,
    (card) => card.srs.lastReviewedAt,
    days
  );
  const lifeCounts = countByDateKey(input.lifeLogs, (log) => log.createdAt, days);
  const listeningCounts = countByDateKey(
    input.cards.filter((card) => card.deckType === "input-listening"),
    (card) => card.createdAt,
    days
  );

  return {
    labels,
    todayIndex: days.findIndex((day) => day.isToday),
    review: reviewCounts,
    life: lifeCounts,
    listening: listeningCounts
  };
}

function getCurrentWeekDays(now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    return {
      date,
      isToday: getReviewDateKey(date) === getReviewDateKey(today),
      key: getReviewDateKey(date)
    };
  });
}

function countByDateKey<T>(
  items: T[],
  getDateValue: (item: T) => string | undefined,
  days: Array<{ key: string }>
) {
  const counts = new Map(days.map((day) => [day.key, 0]));

  for (const item of items) {
    const dateValue = getDateValue(item);
    if (!dateValue) {
      continue;
    }

    const time = Date.parse(dateValue);
    if (!Number.isFinite(time)) {
      continue;
    }

    const key = getReviewDateKey(new Date(time));
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return days.map((day) => counts.get(day.key) ?? 0);
}

function getWeekdayLabel(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

function getTodayHubBarHeight(value: number, maxBarValue: number) {
  if (value <= 0) {
    return 7;
  }
  return Math.max(12, Math.round((value / maxBarValue) * 44));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

function getTodayHubAccentColor(accent: TodayHubCardProps["accent"]) {
  if (accent === "review") {
    return "#43b566";
  }
  if (accent === "life") {
    return "#2563eb";
  }
  return "#0891b2";
}

function getRoutinePanelClassName(run: DailyRoutineRun | null) {
  if (!run) {
    return "daily-routine-panel";
  }
  return `daily-routine-panel ${run.status}`;
}

function getRoutineTitle(run: DailyRoutineRun | null) {
  if (!run) {
    return "뭐 할지 모르겠으면 여기서 시작";
  }
  if (run.status === "completed") {
    return "오늘 루틴 완료";
  }
  if (run.status === "paused") {
    return "중간에 멈춘 루틴이 있습니다";
  }
  return "오늘 루틴 진행 중";
}

function getRoutineDescription(run: DailyRoutineRun | null, step: DailyRoutineStep | null) {
  if (!run) {
    return "복습, 듣기 루프, 영작 훈련, 보상 정리를 순서대로 진행합니다.";
  }
  if (run.status === "completed") {
    return "오늘 기본 루틴을 끝냈습니다. 필요하면 다시 시작할 수 있습니다.";
  }
  if (!step) {
    return "이어하기를 누르면 다음 단계로 돌아갑니다.";
  }
  return `현재 단계: ${step.title} · ${step.description}`;
}

function getRoutineButtonLabel(run: DailyRoutineRun | null) {
  if (!run) {
    return "오늘 루틴 시작";
  }
  if (run.status === "completed") {
    return "다시 시작";
  }
  if (run.status === "paused") {
    return "오늘 루틴 이어하기";
  }
  return "현재 단계 열기";
}
