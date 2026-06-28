import {
  CheckCircle,
  Eye,
  Lightbulb,
  ListChecks,
  BookOpen,
  RefreshCw,
  Shuffle,
  Target,
  CreditCard
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  buildWritingPracticePrompts,
  evaluateWritingPracticeAnswer,
  type WritingPracticeEvaluation
} from "../shared/writingPractice";
import type { StudyCard } from "../shared/types";

type WritingPracticePageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  focusCardId?: string | null;
  focusPromptIndex?: number;
  focusRequestId?: number;
  onFocusConsumed?: () => void;
  onMissionProgressChanged?: () => Promise<void>;
  onNavigate?: (route: "cards" | "pdfReader" | "life") => void;
};

export function WritingPracticePage({
  api,
  cards,
  focusCardId,
  focusPromptIndex = 0,
  focusRequestId = 0,
  onFocusConsumed,
  onMissionProgressChanged,
  onNavigate
}: WritingPracticePageProps) {
  const prompts = useMemo(() => buildWritingPracticePrompts(cards), [cards]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<WritingPracticeEvaluation | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<string | null>(null);

  const activePrompt = prompts[Math.min(activeIndex, prompts.length - 1)];
  const normalizedCurrentAnswer = answer.trim();
  const isCurrentAnswerAlreadyChecked =
    Boolean(evaluation) && normalizedCurrentAnswer === lastSubmittedAnswer;

  useEffect(() => {
    if (!focusCardId || prompts.length === 0) {
      return;
    }
    const cardPromptIndexes = prompts
      .map((prompt, index) => ({ prompt, index }))
      .filter(({ prompt }) => prompt.cardId === focusCardId);
    const target = cardPromptIndexes[Math.min(focusPromptIndex, cardPromptIndexes.length - 1)];
    if (!target) {
      return;
    }
    setActiveIndex(target.index);
    resetAttempt();
    onFocusConsumed?.();
  }, [focusCardId, focusPromptIndex, focusRequestId, onFocusConsumed, prompts]);

  async function checkAnswer() {
    if (!activePrompt || !normalizedCurrentAnswer || isCurrentAnswerAlreadyChecked) {
      return;
    }
    const result = evaluateWritingPracticeAnswer(activePrompt, normalizedCurrentAnswer);
    setEvaluation(result);
    setShowAnswer(true);
    setLastSubmittedAnswer(normalizedCurrentAnswer);
    setAttemptCount((value) => value + 1);
    if (result.level === "great" || result.level === "good") {
      setPassCount((value) => value + 1);
    }
    try {
      await api.missions.recordEvent({
        type: "writing_practice_completed",
        amount: 1,
        metadata: {
          promptSource: activePrompt.source,
          level: result.level
        }
      });
      await onMissionProgressChanged?.();
    } catch {
      // Mission rewards should not block the writing practice flow.
    }
  }

  function goNext() {
    setActiveIndex((index) => (index + 1) % prompts.length);
    resetAttempt();
  }

  function pickRandom() {
    if (prompts.length <= 1) {
      resetAttempt();
      return;
    }
    let nextIndex = activeIndex;
    while (nextIndex === activeIndex) {
      nextIndex = Math.floor(Math.random() * prompts.length);
    }
    setActiveIndex(nextIndex);
    resetAttempt();
  }

  function resetAttempt() {
    setAnswer("");
    setEvaluation(null);
    setShowHint(false);
    setShowAnswer(false);
    setLastSubmittedAnswer(null);
  }

  if (!activePrompt) {
    return (
      <div className="writing-practice-page">
        <section className="writing-practice-empty">
          <Target size={36} />
          <strong>영작 훈련 문장을 만들 수 없습니다</strong>
          <p>카드를 만들면 카드의 한국어 프롬프트와 기본 문장을 섞어 연습할 수 있습니다.</p>
          {onNavigate ? (
            <div className="writing-empty-actions">
              <button
                className="button secondary"
                data-qa="writing-empty-open-cards"
                type="button"
                onClick={() => onNavigate("cards")}
              >
                <CreditCard size={16} />
                카드 보기
              </button>
              <button
                className="button primary"
                data-qa="writing-empty-open-reader"
                type="button"
                onClick={() => onNavigate("pdfReader")}
              >
                <BookOpen size={16} />
                리더기 열기
              </button>
              <button
                className="button secondary"
                data-qa="writing-empty-open-life"
                type="button"
                onClick={() => onNavigate("life")}
              >
                <Lightbulb size={16} />
                라이프 마이닝
              </button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="writing-practice-page">
      <section className="writing-practice-main">
        <header className="writing-practice-header">
          <div>
            <h2>영작 훈련</h2>
            <p>한국어 문장을 보고 자연스러운 영어로 직접 써보는 연습입니다.</p>
          </div>
          <div className="writing-practice-stats">
            <span>{prompts.length}문장</span>
            <span>{attemptCount ? `${passCount}/${attemptCount} 통과` : "준비됨"}</span>
          </div>
        </header>

        <div className="writing-prompt-card">
          <div className="writing-prompt-meta">
            <span>{activePrompt.sourceLabel}</span>
            <span>{activePrompt.source === "card" ? "내 카드 기반" : "기본 문장"}</span>
            <span>{getPromptTypeLabel(activePrompt.promptType)}</span>
          </div>
          <p>{activePrompt.promptKo}</p>
        </div>

        <div className="writing-practice-controls">
          <button
            className="button secondary"
            data-qa="writing-random-button"
            type="button"
            onClick={pickRandom}
          >
            <Shuffle size={16} />
            랜덤 문장
          </button>
          <button
            className="button secondary"
            data-qa="writing-next-button"
            type="button"
            onClick={goNext}
          >
            <RefreshCw size={16} />
            다음 문장
          </button>
          <button
            className="button secondary"
            data-qa="writing-hint-button"
            type="button"
            onClick={() => setShowHint((value) => !value)}
          >
            <Lightbulb size={16} />
            힌트
          </button>
          <button
            className="button secondary"
            data-qa="writing-answer-button"
            type="button"
            onClick={() => setShowAnswer((value) => !value)}
          >
            <Eye size={16} />
            답 보기
          </button>
        </div>

        {showHint ? (
          <section className="writing-practice-hint">
            <h3>
              <ListChecks size={17} />
              써보면 좋은 표현
            </h3>
            <div className="writing-term-row">
              {activePrompt.requiredTerms.length ? (
                activePrompt.requiredTerms.map((term) => <span key={term}>{term}</span>)
              ) : (
                <span>자유롭게 영작</span>
              )}
            </div>
          </section>
        ) : null}

        <form
          className="writing-answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void checkAnswer();
          }}
        >
          <textarea
            placeholder="여기에 영어로 써보세요..."
            value={answer}
            onChange={(event) => {
              const nextAnswer = event.target.value;
              setAnswer(nextAnswer);
              if (evaluation && nextAnswer.trim() !== lastSubmittedAnswer) {
                setEvaluation(null);
                setShowAnswer(false);
              }
            }}
          />
          <div className="writing-answer-actions">
            <button
              className="button primary"
              data-qa="writing-check-button"
              disabled={!normalizedCurrentAnswer || isCurrentAnswerAlreadyChecked}
              type="submit"
            >
              <CheckCircle size={17} />
              {isCurrentAnswerAlreadyChecked ? "확인 완료" : "확인"}
            </button>
            <button className="button secondary" type="button" onClick={resetAttempt}>
              다시 쓰기
            </button>
          </div>
        </form>
      </section>

      <aside className="writing-feedback-panel">
        <h2>피드백</h2>
        {evaluation ? (
          <>
            <div className={`writing-score-card ${evaluation.level}`}>
              <strong>{evaluation.score}</strong>
              <span>{getLevelLabel(evaluation.level)}</span>
              <small>추천 답안과 표현 기준으로 빠르게 계산한 점수입니다.</small>
            </div>

            <section>
              <h3>표현 체크</h3>
              <div className="writing-term-row">
                {evaluation.matchedTerms.map((term) => (
                  <span className="matched" key={term}>{term}</span>
                ))}
                {evaluation.missingTerms.map((term) => (
                  <span className="missing" key={term}>{term}</span>
                ))}
                {!evaluation.matchedTerms.length && !evaluation.missingTerms.length ? (
                  <span>필수 표현 없음</span>
                ) : null}
              </div>
            </section>

            <section>
              <h3>내 답안</h3>
              <p>{answer}</p>
            </section>
          </>
        ) : (
          <div className="writing-feedback-empty">
            <Target size={30} />
            <strong>답을 입력하고 확인을 누르세요</strong>
            <p>정답 하나를 맞히는 퀴즈가 아니라, 자연스러운 표현을 꺼내는 연습입니다.</p>
          </div>
        )}

        {showAnswer ? (
          <section className="writing-answer-suggestion">
            <h3>추천 답안</h3>
            <p>{activePrompt.targetEnglish}</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function getLevelLabel(level: WritingPracticeEvaluation["level"]) {
  if (level === "great") {
    return "좋음";
  }
  if (level === "good") {
    return "연습 통과";
  }
  return "다시 시도";
}

function getPromptTypeLabel(type: string) {
  if (type === "ko_to_en") {
    return "한글 보고 영작";
  }
  if (type === "make_sentence") {
    return "문장 만들기";
  }
  return "상황 질문";
}
