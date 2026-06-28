import { BookOpen, Lightbulb, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CardPreview } from "../components/CardPreview";
import type { LocalEnglishMinerApi } from "../data/api";
import { getCardDeckFilterLabel } from "../shared/cardDeck";
import { getReviewDeckCompletedEventType } from "../shared/dailyMissions";
import {
  buildReviewDeckStats,
  createEmptyReviewDailyProgress,
  filterReviewQueueByDeckAndLimits,
  getReviewDateKey,
  getReviewLimitBucket,
  normalizeReviewDailyProgress,
  normalizeReviewSettings,
  reviewDecks,
  type ReviewDailyProgress,
  type ReviewSettings
} from "../shared/reviewStats";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";
import type { AppSettings, CardDeckType, ProfileId, ReviewRating, StudyCard } from "../shared/types";

const REVIEW_SETTINGS_STORAGE_KEY = "lem:reviewSettings";
const REVIEW_PROGRESS_STORAGE_KEY = "lem:reviewDailyProgress";

type ReviewPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  onMissionProgressChanged?: () => Promise<void>;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
  onNavigate?: (route: "pdfReader" | "life") => void;
  profileId: ProfileId;
  settings: AppSettings;
};

type ReviewSettingField = keyof ReviewSettings[CardDeckType];

export function ReviewPage({
  api,
  cards,
  onCardsChanged,
  onMissionProgressChanged,
  onStartWritingPractice,
  onNavigate,
  profileId,
  settings
}: ReviewPageProps) {
  const [dueCards, setDueCards] = useState<StudyCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeDeck, setActiveDeck] = useState<CardDeckType>("input");
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isLoadingDueCards, setIsLoadingDueCards] = useState(true);
  const [reviewLoadError, setReviewLoadError] = useState("");
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [reviewSettings, setReviewSettings] = useState(() => loadReviewSettings(profileId));
  const [dailyProgress, setDailyProgress] = useState(() =>
    loadReviewDailyProgress(new Date(), profileId)
  );
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const deckStats = useMemo(() => buildReviewDeckStats(cards, now), [cards, now]);
  const reviewQueue = useMemo(
    () =>
      filterReviewQueueByDeckAndLimits(
        dueCards,
        activeDeck,
        reviewSettings,
        now,
        dailyProgress
      ),
    [activeDeck, dailyProgress, dueCards, now, reviewSettings]
  );
  const selectedDeckDueCount = useMemo(
    () => dueCards.filter((card) => card.deckType === activeDeck).length,
    [activeDeck, dueCards]
  );

  async function loadDueCards() {
    const loadNow = new Date();
    setIsLoadingDueCards(true);
    setReviewLoadError("");
    try {
      const due = await api.cards.listDue(loadNow.toISOString());
      setNowIso(loadNow.toISOString());
      setDailyProgress(loadReviewDailyProgress(loadNow, profileId));
      setDueCards(due);
      setCurrentIndex(0);
    } catch (error) {
      setDueCards([]);
      setCurrentIndex(0);
      setReviewLoadError(getErrorMessage(error));
    } finally {
      setIsLoadingDueCards(false);
    }
  }

  useEffect(() => {
    void loadDueCards();
  }, [profileId]);

  useEffect(() => {
    setReviewSettings(loadReviewSettings(profileId));
    setDailyProgress(loadReviewDailyProgress(new Date(), profileId));
    setCurrentIndex(0);
  }, [profileId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [activeDeck, reviewSettings]);

  useEffect(() => {
    if (!isSessionOpen || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSessionOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSessionOpen]);

  function getDeckReviewQueue(deck: CardDeckType) {
    return filterReviewQueueByDeckAndLimits(
      dueCards,
      deck,
      reviewSettings,
      now,
      dailyProgress
    );
  }

  function startReviewSession(deck: CardDeckType) {
    setActiveDeck(deck);
    setCurrentIndex(0);
    setIsSessionOpen(true);
  }

  async function handleReview(rating: ReviewRating) {
    if (isReviewing) {
      return;
    }
    const current = reviewQueue[currentIndex];
    if (!current) {
      return;
    }
    const limitBucket = getReviewLimitBucket(current);
    setIsReviewing(true);
    try {
      await api.cards.review(current.id, rating);
      setDailyProgress((progress) => {
        const nextProgress = incrementDailyProgress(progress, activeDeck, limitBucket);
        saveReviewDailyProgress(nextProgress, new Date(), profileId);
        return nextProgress;
      });
      await onCardsChanged();
      const nextCards = dueCards.filter((card) => card.id !== current.id);
      const isDeckCompleted = nextCards.every((card) => card.deckType !== activeDeck);
      if (isDeckCompleted) {
        try {
          await api.missions.recordEvent({
            type: getReviewDeckCompletedEventType(activeDeck),
            amount: 1,
            metadata: {
              deckType: activeDeck
            }
          });
          await onMissionProgressChanged?.();
        } catch {
          // Mission rewards should not block the review flow.
        }
      }
      setDueCards(nextCards);
      const nextFilteredLength = nextCards.filter(
        (card) => card.deckType === activeDeck
      ).length;
      setCurrentIndex((index) => Math.min(index, Math.max(0, nextFilteredLength - 1)));
    } finally {
      setIsReviewing(false);
    }
  }

  function updateReviewSetting(deck: CardDeckType, field: ReviewSettingField, rawValue: string) {
    const value = Math.max(0, Math.floor(Number(rawValue) || 0));
    setReviewSettings((settings) => {
      const nextSettings = normalizeReviewSettings({
        ...settings,
        [deck]: {
          ...settings[deck],
          [field]: value
        }
      });
      saveReviewSettings(nextSettings, profileId);
      return nextSettings;
    });
  }

  const current = reviewQueue[currentIndex] ?? null;
  const isLimitedOut = selectedDeckDueCount > 0 && reviewQueue.length === 0;

  return (
    <section className="panel review-panel">
      <div className="panel-heading">
        <RotateCcw size={19} />
        <h2>복습</h2>
        <span className="pill">
          {isLoadingDueCards ? "확인 중" : `대기 ${reviewQueue.length}장`}
        </span>
        <button
          className="button ghost small"
          data-qa="review-refresh-button"
          disabled={isLoadingDueCards}
          type="button"
          onClick={() => void loadDueCards()}
        >
          {isLoadingDueCards ? "확인 중" : "새로고침"}
        </button>
      </div>
      {reviewLoadError ? (
        <div className="review-status-banner danger">
          <strong>복습 카드를 불러오지 못했습니다</strong>
          <span>{reviewLoadError}</span>
        </div>
      ) : null}
      {!reviewLoadError && isLoadingDueCards ? (
        <div className="review-status-banner">
          <strong>복습 대상을 확인하는 중</strong>
          <span>저장된 카드와 오늘 진행 한도를 불러오고 있습니다.</span>
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && cards.length === 0 ? (
        <div className="review-status-banner">
          <strong>복습할 카드 없음</strong>
          <span>읽기, 듣기, 라이프 마이닝에서 저장한 카드가 복습 덱에 표시됩니다.</span>
          {onNavigate ? (
            <div className="empty-state-actions left">
              <button
                className="button primary small"
                data-qa="review-empty-open-reader"
                type="button"
                onClick={() => onNavigate("pdfReader")}
              >
                <BookOpen size={15} />
                리더기 열기
              </button>
              <button
                className="button secondary small"
                data-qa="review-empty-open-life"
                type="button"
                onClick={() => onNavigate("life")}
              >
                <Lightbulb size={15} />
                라이프 마이닝
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && cards.length > 0 && dueCards.length === 0 ? (
        <div className="review-status-banner success">
          <strong>오늘 예정된 복습 없음</strong>
          <span>새 카드나 다음 예정 시간이 오면 이곳에 대기 카드가 표시됩니다.</span>
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && isLimitedOut ? (
        <div className="review-status-banner success">
          <strong>오늘 {getDeckName(activeDeck)} 한도 완료</strong>
          <span>복습 설정에서 덱별 일일 한도를 조정할 수 있습니다.</span>
        </div>
      ) : null}
      <div className="review-deck-dashboard">
        {reviewDecks.map((deck) => {
          const stats = deckStats[deck];
          const deckQueueLength = getDeckReviewQueue(deck).length;
          return (
          <article
            key={deck}
            className={`review-deck-card ${activeDeck === deck ? "active" : ""}`}
          >
            <button
              className="review-deck-select"
              type="button"
              aria-pressed={activeDeck === deck}
              onClick={() => setActiveDeck(deck)}
            >
            <span className="review-deck-card-head">
              <span>
                <strong>{getDeckName(deck)}</strong>
                <small>{getCardDeckFilterLabel(deck)}</small>
              </span>
              <span className="review-total-count">{stats.totalCount}장</span>
            </span>
            <span className="review-count-row">
              <span className="review-count-badge new">
                <strong>{stats.newCount}</strong>
                <small>새카드</small>
              </span>
              <span className="review-count-badge learning">
                <strong>{stats.learningCount}</strong>
                <small>학습중</small>
              </span>
              <span className="review-count-badge review">
                <strong>{stats.reviewCount}</strong>
                <small>복습</small>
              </span>
            </span>
            <span className="review-deck-meta">
              기한 초과 {stats.overdueCount} · 오늘 완료 {stats.doneTodayCount}
            </span>
            </button>
            <button
              className="button primary review-start-button"
              data-qa={`review-start-${deck}`}
              type="button"
              disabled={isLoadingDueCards || deckQueueLength === 0}
              onClick={() => startReviewSession(deck)}
            >
              복습하기
              <span>{isLoadingDueCards ? "확인 중" : `${deckQueueLength}장`}</span>
            </button>
          </article>
          );
        })}
      </div>
      <details className="review-settings-panel">
        <summary>
          <span>
            <SlidersHorizontal size={16} />
            복습 설정
          </span>
          <small>덱별 일일 한도</small>
        </summary>
        <div className="review-settings-grid">
          {reviewDecks.map((deck) => (
            <div className="review-settings-card" key={deck}>
              <strong>{getDeckName(deck)}</strong>
              <label className="review-setting-field">
                <span>오늘 새카드 한도</span>
                <input
                  min={0}
                  type="number"
                  value={reviewSettings[deck].newLimit}
                  onChange={(event) => updateReviewSetting(deck, "newLimit", event.target.value)}
                />
              </label>
              <label className="review-setting-field">
                <span>오늘 복습 한도</span>
                <input
                  min={0}
                  type="number"
                  value={reviewSettings[deck].reviewLimit}
                  onChange={(event) =>
                    updateReviewSetting(deck, "reviewLimit", event.target.value)
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </details>
      {isSessionOpen ? (
        <div
          className="review-session-backdrop"
          role="presentation"
          onMouseDown={() => setIsSessionOpen(false)}
        >
          <section
            aria-label={`${getDeckName(activeDeck)} 복습`}
            className="review-session-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="review-session-modal-header">
              <div>
                <span>복습 세션</span>
                <h2>{getDeckName(activeDeck)}</h2>
              </div>
              <div className="review-session-modal-actions">
                <span className="review-session-count">
                  {current ? `${currentIndex + 1} / ${reviewQueue.length}` : "완료"}
                </span>
                <button className="icon-button" type="button" onClick={() => setIsSessionOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {current ? (
              <CardPreview
                key={current.id}
                card={current}
                settings={settings}
                reviewActions
                onReview={(rating) => void handleReview(rating)}
                onStartWritingPractice={onStartWritingPractice}
              />
            ) : (
              <div className="empty-state review-session-empty">
                {isLimitedOut
                  ? `오늘 ${getDeckName(activeDeck)} 복습 완료`
                  : `${getDeckName(activeDeck)} 복습 카드가 없습니다`}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function getDeckName(deck: CardDeckType) {
  if (deck === "input-listening") {
    return "인풋-리스닝덱";
  }
  return deck === "input" ? "인풋-리딩덱" : "아웃풋덱";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

function loadReviewSettings(profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return normalizeReviewSettings(null);
  }

  try {
    return normalizeReviewSettings(
      JSON.parse(localStorage.getItem(getReviewSettingsKey(profileId)) ?? "null")
    );
  } catch {
    return normalizeReviewSettings(null);
  }
}

function saveReviewSettings(settings: ReviewSettings, profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(getReviewSettingsKey(profileId), JSON.stringify(settings));
}

function loadReviewDailyProgress(now: Date, profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return createEmptyReviewDailyProgress();
  }

  try {
    const stored = JSON.parse(localStorage.getItem(getReviewProgressKey(profileId)) ?? "null") as {
      dateKey?: string;
      progress?: unknown;
    } | null;
    if (stored?.dateKey !== getReviewDateKey(now)) {
      return createEmptyReviewDailyProgress();
    }
    return normalizeReviewDailyProgress(stored.progress);
  } catch {
    return createEmptyReviewDailyProgress();
  }
}

function saveReviewDailyProgress(
  progress: ReviewDailyProgress,
  now: Date,
  profileId: ProfileId = DEFAULT_PROFILE_ID
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getReviewProgressKey(profileId),
    JSON.stringify({
      dateKey: getReviewDateKey(now),
      progress
    })
  );
}

function getReviewSettingsKey(profileId: ProfileId) {
  return `${REVIEW_SETTINGS_STORAGE_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

function getReviewProgressKey(profileId: ProfileId) {
  return `${REVIEW_PROGRESS_STORAGE_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

function incrementDailyProgress(
  progress: ReviewDailyProgress,
  deck: CardDeckType,
  bucket: "new" | "review"
): ReviewDailyProgress {
  return {
    ...progress,
    [deck]: {
      ...progress[deck],
      [bucket === "new" ? "newDone" : "reviewDone"]:
        progress[deck][bucket === "new" ? "newDone" : "reviewDone"] + 1
    }
  };
}
