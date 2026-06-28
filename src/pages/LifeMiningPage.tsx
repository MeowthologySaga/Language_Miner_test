import {
  Calculator,
  Check,
  Clock,
  Globe2,
  Inbox,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Radio,
  Save,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardGenerationUsageEstimate } from "../components/CardGenerationUsageEstimate";
import { CardPreview } from "../components/CardPreview";
import { EmptyState } from "../components/EmptyState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import {
  getLifeLogDisplayMessages,
  type LifeLogDisplayMessage
} from "../shared/lifeLogMessages";
import { isLifeLogProcessedForProfile } from "../shared/lifeLogProgress";
import type { CardGenerationUsageEstimate as CardGenerationUsageEstimateData } from "../shared/cardGenerationUsage";
import { estimateTranslationUsage } from "../shared/translationUsage";
import type { AppSettings, LifeLog, StudyCard } from "../shared/types";

type LifeMiningPageProps = {
  api: LocalEnglishMinerApi;
  provider: LLMProvider;
  settings: AppSettings;
  lifeLogs: LifeLog[];
  onLifeLogsChanged: () => Promise<void>;
  onCardsChanged: () => Promise<void>;
};

type LifeLogConversationMessage = LifeLogDisplayMessage;
type LifeLogCandidatePreviewMessage = LifeLogConversationMessage & {
  isTarget: boolean;
};
type LifeBulkAction = "delete" | "generate";

const LIFE_LOG_BUBBLE_COLLAPSE_LENGTH = 220;
const LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH = 54;

export function LifeMiningPage({
  api,
  provider,
  settings,
  lifeLogs,
  onLifeLogsChanged,
  onCardsChanged
}: LifeMiningPageProps) {
  const [text, setText] = useState("");
  const [beforeContext, setBeforeContext] = useState("");
  const [afterContext, setAfterContext] = useState("");
  const [selectedLog, setSelectedLog] = useState<LifeLog | null>(null);
  const [candidate, setCandidate] = useState<StudyCard | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingCostLog, setPendingCostLog] = useState<LifeLog | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<LifeBulkAction | null>(null);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const visibleLifeLogs = useMemo(
    () => lifeLogs.filter((log) => !isLifeLogProcessedForProfile(log, settings.profileId)),
    [lifeLogs, settings.profileId]
  );
  const autoLogs = visibleLifeLogs.filter((log) => log.sourceType === "browser_extension");
  const completedForProfileCount = lifeLogs.length - visibleLifeLogs.length;
  const selectedLogIdSet = useMemo(() => new Set(selectedLogIds), [selectedLogIds]);
  const selectedLifeLogs = useMemo(
    () => visibleLifeLogs.filter((log) => selectedLogIdSet.has(log.id)),
    [selectedLogIdSet, visibleLifeLogs]
  );
  const selectedLifeLogCount = selectedLifeLogs.length;
  const isAllVisibleSelected =
    visibleLifeLogs.length > 0 && selectedLifeLogCount === visibleLifeLogs.length;
  const lastAutoLog = autoLogs[0];
  const targetCardLabel = `${settings.learningProfile.targetLanguage.nameKo} 카드 만들기`;
  const pendingCostEstimate = pendingCostLog
    ? estimateLifeMiningCardCost(pendingCostLog, settings)
    : null;
  const selectedLogUsageEstimate = selectedLog
    ? toCardGenerationUsageEstimate(estimateLifeMiningCardCost(selectedLog, settings))
    : null;

  useEffect(() => {
    if (!selectedLog && !candidate) {
      return;
    }
    const detailPanel = detailPanelRef.current;
    if (!detailPanel) {
      return;
    }

    requestAnimationFrame(() => {
      const bounds = detailPanel.getBoundingClientRect();
      const isMostlyBelowViewport = bounds.top > window.innerHeight * 0.72;
      const isAboveViewport = bounds.bottom < 96;
      if (isMostlyBelowViewport || isAboveViewport) {
        detailPanel.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }, [candidate, selectedLog]);

  useEffect(() => {
    if (
      (!pendingCostLog && !isManualAddOpen && !pendingBulkAction) ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingCostLog(null);
        setIsManualAddOpen(false);
        setPendingBulkAction(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingCostLog, isManualAddOpen, pendingBulkAction]);

  useEffect(() => {
    const visibleIds = new Set(visibleLifeLogs.map((log) => log.id));
    setSelectedLogIds((previous) => previous.filter((id) => visibleIds.has(id)));
  }, [visibleLifeLogs]);

  useEffect(() => {
    if (!selectedLog) {
      return;
    }

    const latestSelectedLog = lifeLogs.find((log) => log.id === selectedLog.id);
    if (!latestSelectedLog) {
      setSelectedLog(visibleLifeLogs[0] ?? null);
      setCandidate(null);
      setSavedCardId(null);
      return;
    }

    if (isLifeLogProcessedForProfile(latestSelectedLog, settings.profileId)) {
      setSelectedLog(visibleLifeLogs.find((log) => log.id !== selectedLog.id) ?? null);
      setCandidate(null);
      setSavedCardId(null);
      return;
    }

    setSelectedLog(latestSelectedLog);
  }, [lifeLogs, selectedLog?.id, settings.profileId]);

  async function saveLifeLog() {
    if (!text.trim()) {
      return;
    }
    const saved = await api.lifeLogs.save({
      text: text.trim(),
      beforeContext: beforeContext.trim() || undefined,
      afterContext: afterContext.trim() || undefined,
      sourceType: "manual"
    });
    setSelectedLog(saved);
    setText("");
    setBeforeContext("");
    setAfterContext("");
    setStatusMessage("카드 후보로 저장했습니다.");
    setIsManualAddOpen(false);
    await onLifeLogsChanged();
  }

  async function makeEnglishCard(log: LifeLog) {
    setIsGenerating(true);
    setStatusMessage("");
    setSavedCardId(null);
    try {
      const generated = await provider.generateLifeExpressionCard({
        koreanText: log.text,
        beforeContext: log.beforeContext,
        afterContext: log.afterContext,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate"
      });
      setSelectedLog(log);
      setCandidate(createStudyCardFromGenerated(generated));
    } finally {
      setIsGenerating(false);
    }
  }

  function selectLifeLog(log: LifeLog) {
    setSelectedLog(log);
    setCandidate(null);
    setSavedCardId(null);
  }

  function toggleSelectionMode() {
    setIsSelectionMode((value) => {
      const next = !value;
      if (!next) {
        setSelectedLogIds([]);
        setPendingBulkAction(null);
      }
      return next;
    });
  }

  function toggleLifeLogSelection(logId: string) {
    setSelectedLogIds((previous) =>
      previous.includes(logId) ? previous.filter((id) => id !== logId) : [...previous, logId]
    );
  }

  function toggleSelectAllLifeLogs() {
    setSelectedLogIds(isAllVisibleSelected ? [] : visibleLifeLogs.map((log) => log.id));
  }

  function requestBulkAction(action: LifeBulkAction) {
    if (selectedLifeLogCount === 0 || isBulkActionRunning) {
      return;
    }
    setPendingBulkAction(action);
  }

  async function confirmBulkAction() {
    const action = pendingBulkAction;
    const logs = selectedLifeLogs;
    if (!action || logs.length === 0) {
      setPendingBulkAction(null);
      return;
    }

    setIsBulkActionRunning(true);
    setIsGenerating(action === "generate");
    setStatusMessage("");
    try {
      if (action === "delete") {
        await Promise.all(logs.map((log) => api.lifeLogs.delete(log.id)));
        if (selectedLog && logs.some((log) => log.id === selectedLog.id)) {
          setSelectedLog(null);
          setCandidate(null);
          setSavedCardId(null);
        }
        setStatusMessage(`${logs.length}개 기록을 삭제했습니다.`);
        await onLifeLogsChanged();
      } else {
        setCandidate(null);
        setSavedCardId(null);
        for (const [index, log] of logs.entries()) {
          setStatusMessage(`문장 카드 생성 중 (${index + 1}/${logs.length})`);
          const generated = await provider.generateLifeExpressionCard({
            koreanText: log.text,
            beforeContext: log.beforeContext,
            afterContext: log.afterContext,
            learningProfile: settings.learningProfile,
            learnerLevel: "intermediate"
          });
          await api.cards.save(createStudyCardFromGenerated(generated));
          await api.lifeLogs.markProcessed(log.id, settings.profileId);
        }
        setSelectedLog(null);
        setStatusMessage(`${logs.length}개 문장 카드를 만들었습니다.`);
        await onCardsChanged();
        await onLifeLogsChanged();
      }
      setSelectedLogIds([]);
      setIsSelectionMode(false);
      setPendingBulkAction(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "선택 작업에 실패했습니다.");
      setPendingBulkAction(null);
    } finally {
      setIsBulkActionRunning(false);
      setIsGenerating(false);
    }
  }

  function requestMakeEnglishCard(log: LifeLog) {
    if (settings.confirmLifeMiningCardCost) {
      setPendingCostLog(log);
      return;
    }
    void makeEnglishCard(log);
  }

  async function confirmLifeMiningCardCost() {
    const log = pendingCostLog;
    setPendingCostLog(null);
    if (!log) {
      return;
    }
    await makeEnglishCard(log);
  }

  async function saveCard() {
    if (!candidate) {
      return;
    }
    setIsSavingCard(true);
    try {
      const saved = await api.cards.save(candidate);
      setCandidate(saved);
      setSavedCardId(saved.id);
      if (selectedLog) {
        await api.lifeLogs.markProcessed(selectedLog.id, settings.profileId);
      }
      setStatusMessage("카드를 저장했습니다. 복습 화면에서 바로 복습할 수 있습니다.");
      await onCardsChanged();
      await onLifeLogsChanged();
      if (selectedLog) {
        setSelectedLog(visibleLifeLogs.find((log) => log.id !== selectedLog.id) ?? null);
        setCandidate(null);
        setSavedCardId(null);
      }
    } finally {
      setIsSavingCard(false);
    }
  }

  return (
    <div className="page-grid life-layout">
      <section className="panel list-panel life-candidate-panel">
        <div className="life-candidate-toolbar">
          <div className="panel-heading">
            <Lightbulb size={19} />
            <h2>라이프 마이닝</h2>
            <span className="pill">카드 후보 {visibleLifeLogs.length}</span>
            {completedForProfileCount > 0 ? (
              <span className="muted-small">이 프로필 완료 {completedForProfileCount}</span>
            ) : null}
          </div>
          <div className="life-candidate-actions">
            <button
              className={isSelectionMode ? "button primary small" : "button secondary small"}
              data-qa="life-selection-mode"
              type="button"
              onClick={toggleSelectionMode}
            >
              <ListChecks size={15} />
              {isSelectionMode ? "선택취소" : "선택모드"}
            </button>
            <button
              className="button secondary small"
              data-qa="life-manual-add"
              type="button"
              onClick={() => setIsManualAddOpen(true)}
            >
              <Plus size={15} />
              직접추가
            </button>
          </div>
        </div>
        {statusMessage ? <p className="status-text life-status-text">{statusMessage}</p> : null}
        {isSelectionMode ? (
          <div className="life-selection-toolbar" data-qa="life-selection-toolbar">
            <strong>{selectedLifeLogCount}개 선택됨</strong>
            <button
              className="button secondary small"
              data-qa="life-select-all"
              type="button"
              disabled={visibleLifeLogs.length === 0 || isBulkActionRunning}
              onClick={toggleSelectAllLifeLogs}
            >
              <Check size={15} />
              {isAllVisibleSelected ? "전체해제" : "전체선택"}
            </button>
            <button
              className="button danger small"
              data-qa="life-bulk-delete"
              type="button"
              disabled={selectedLifeLogCount === 0 || isBulkActionRunning}
              onClick={() => requestBulkAction("delete")}
            >
              <Trash2 size={15} />
              삭제
            </button>
            <button
              className="button success small"
              data-qa="life-bulk-generate"
              type="button"
              disabled={selectedLifeLogCount === 0 || isBulkActionRunning}
              onClick={() => requestBulkAction("generate")}
            >
              <Sparkles size={15} />
              문장생성
            </button>
          </div>
        ) : null}
        <div className="life-auto-status" data-qa="life-auto-status">
          <div>
            <Radio size={16} />
            <strong>브라우저 자동 수집</strong>
            <span>자동 후보 {autoLogs.length}개</span>
          </div>
          <small>
            {lastAutoLog
              ? `최근 수집: ${getLifeLogSourceLabel(lastAutoLog)} · ${formatLifeLogTime(lastAutoLog.createdAt)}`
              : "Discord Web, ChatGPT, Claude 메시지를 후보로 저장합니다."}
          </small>
        </div>
        <div className="life-log-list">
          {visibleLifeLogs.map((log) => {
            const isProcessed = isLifeLogProcessedForProfile(log, settings.profileId);
            const isBulkSelected = selectedLogIdSet.has(log.id);
            const usageEstimate = toCardGenerationUsageEstimate(
              estimateLifeMiningCardCost(log, settings)
            );
            return (
              <div
                key={log.id}
                className={[
                  "life-log-item",
                  selectedLog?.id === log.id && !isSelectionMode ? "selected" : "",
                  isSelectionMode ? "selection-mode" : "",
                  isBulkSelected ? "bulk-selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  aria-pressed={isSelectionMode ? isBulkSelected : undefined}
                  className={isSelectionMode ? "life-log-select selection-mode" : "life-log-select"}
                  type="button"
                  onClick={() => (isSelectionMode ? toggleLifeLogSelection(log.id) : selectLifeLog(log))}
                >
                  {isSelectionMode ? (
                    <span
                      className={isBulkSelected ? "life-log-check checked" : "life-log-check"}
                      aria-hidden="true"
                    >
                      {isBulkSelected ? <Check size={14} /> : null}
                    </span>
                  ) : null}
                  <span className="life-log-body">
                    <span className="life-log-text">{log.text}</span>
                    <LifeLogCandidatePreview log={log} />
                    <small className="life-log-source-line">
                      {getLifeLogCandidateSourceLine(log)}
                    </small>
                  </span>
                </button>
                {!isSelectionMode ? (
                  <div className="card-generation-action-row life-card-action-row">
                    <CardGenerationUsageEstimate
                      align="start"
                      estimate={usageEstimate}
                      variant="badge"
                    />
                    <button
                      className="button success small life-card-action"
                      data-qa="life-candidate-generate"
                      type="button"
                      disabled={isGenerating}
                      onClick={() => requestMakeEnglishCard(log)}
                    >
                      {isProcessed ? "카드 다시 만들기" : targetCardLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {visibleLifeLogs.length === 0 ? (
            <EmptyState
              data-qa="life-empty-state"
              description="새 후보가 들어오면 바로 카드로 만들 수 있습니다."
              icon={<Lightbulb size={24} />}
              title="대기 중인 카드 후보가 없습니다"
              actions={
                <button
                  className="button secondary small"
                  data-qa="life-empty-manual-add"
                  type="button"
                  onClick={() => setIsManualAddOpen(true)}
                >
                  <Plus size={15} />
                  직접추가
                </button>
              }
            />
          ) : null}
        </div>
      </section>

      <section className="panel detail-panel" ref={detailPanelRef}>
        {candidate ? (
          <>
            <CardPreview card={candidate} settings={settings} defaultShowBack />
            <button
              className="button primary wide"
              data-qa="life-save-card"
              type="button"
              disabled={isSavingCard || savedCardId === candidate.id}
              onClick={() => void saveCard()}
            >
              <Save size={18} />
              {savedCardId === candidate.id ? "저장 완료" : "카드 저장"}
            </button>
          </>
        ) : selectedLog ? (
          <div className="life-log-detail">
            <div className="panel-heading">
              <Inbox size={19} />
              <h2>선택한 카드 후보</h2>
            </div>
            <LifeLogConversationPreview log={selectedLog} profileId={settings.profileId} />
            <div className="card-generation-action-row life-card-action-row">
              <CardGenerationUsageEstimate
                align="start"
                estimate={selectedLogUsageEstimate}
                variant="badge"
              />
              <button
                className="button success wide life-card-action"
                data-qa="life-selected-generate"
                type="button"
                disabled={isGenerating}
                onClick={() => requestMakeEnglishCard(selectedLog)}
              >
                {isLifeLogProcessedForProfile(selectedLog, settings.profileId)
                  ? "카드 다시 만들기"
                  : targetCardLabel}
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            data-qa="life-detail-empty-state"
            description={
              isGenerating
                ? "완료되면 카드 미리보기가 표시됩니다."
                : visibleLifeLogs.length > 0
                  ? "왼쪽 목록에서 후보를 선택하면 대화 맥락과 카드 생성 버튼이 표시됩니다."
                  : "직접 후보를 추가하거나 자동 수집된 후보가 들어오면 여기에서 확인합니다."
            }
            icon={isGenerating ? <Loader2 className="spin" size={24} /> : <Inbox size={24} />}
            title={
              isGenerating
                ? "카드 생성 중"
                : visibleLifeLogs.length > 0
                  ? "후보를 선택하세요"
                  : "선택할 후보가 없습니다"
            }
            actions={
              !isGenerating && visibleLifeLogs.length === 0 ? (
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() => setIsManualAddOpen(true)}
                >
                  <Plus size={15} />
                  직접추가
                </button>
              ) : null
            }
          />
        )}
      </section>
      {isManualAddOpen ? (
        <div
          className="life-cost-modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsManualAddOpen(false)}
        >
          <section
            aria-label="라이프 마이닝 직접추가"
            aria-modal="true"
            className="life-cost-modal life-manual-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="life-cost-modal-heading">
              <div>
                <span>카드 후보 수동 입력</span>
                <h2>직접추가</h2>
              </div>
              <button
                className="icon-button"
                data-qa="life-manual-close"
                type="button"
                onClick={() => setIsManualAddOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="life-manual-form">
              <label className="field-label">
                내가 한 말
                <textarea
                  className="text-input tall"
                  data-qa="life-manual-text"
                  placeholder="카드로 만들고 싶은 내 표현을 입력하세요."
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
              <label className="field-label">
                직전 맥락
                <textarea
                  className="text-input"
                  placeholder="바로 전 대화나 상황을 입력하세요."
                  value={beforeContext}
                  onChange={(event) => setBeforeContext(event.target.value)}
                />
              </label>
              <label className="field-label">
                이후 맥락
                <textarea
                  className="text-input"
                  placeholder="이후 대화가 있으면 입력하세요."
                  value={afterContext}
                  onChange={(event) => setAfterContext(event.target.value)}
                />
              </label>
            </div>
            <div className="life-cost-actions life-manual-actions">
              <button
                className="button secondary"
                data-qa="life-manual-cancel"
                type="button"
                onClick={() => setIsManualAddOpen(false)}
              >
                닫기
              </button>
              <button
                className="button primary"
                data-qa="life-manual-save"
                type="button"
                onClick={() => void saveLifeLog()}
              >
                <Save size={18} />
                후보로 저장
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingBulkAction ? (
        <div
          className="life-cost-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!isBulkActionRunning) {
              setPendingBulkAction(null);
            }
          }}
        >
          <section
            aria-label="라이프 마이닝 선택 작업 확인"
            aria-modal="true"
            className="life-cost-modal life-bulk-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="life-cost-modal-heading">
              <div>
                <span>선택모드 작업 확인</span>
                <h2>
                  {pendingBulkAction === "delete"
                    ? "선택한 기록을 삭제할까요?"
                    : "선택한 기록으로 문장 카드를 만들까요?"}
                </h2>
              </div>
              <button
                className="icon-button"
                disabled={isBulkActionRunning}
                type="button"
                onClick={() => setPendingBulkAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="life-bulk-confirm-copy">
              {pendingBulkAction === "delete"
                ? `${selectedLifeLogCount}개 기록이 목록에서 삭제됩니다.`
                : `${selectedLifeLogCount}개 기록을 순서대로 문장 카드로 생성하고 바로 저장합니다.`}
            </p>
            <div className="life-cost-preview life-bulk-preview">
              <span>선택한 기록</span>
              <ul>
                {selectedLifeLogs.slice(0, 3).map((log) => (
                  <li key={log.id}>{log.text}</li>
                ))}
              </ul>
              {selectedLifeLogCount > 3 ? (
                <small>외 {selectedLifeLogCount - 3}개</small>
              ) : null}
            </div>
            <div className="life-cost-actions">
              <button
                className="button secondary"
                data-qa="life-bulk-cancel"
                disabled={isBulkActionRunning}
                type="button"
                onClick={() => setPendingBulkAction(null)}
              >
                아니오
              </button>
              <button
                className={pendingBulkAction === "delete" ? "button danger" : "button success"}
                data-qa="life-bulk-confirm"
                disabled={isBulkActionRunning}
                type="button"
                onClick={() => void confirmBulkAction()}
              >
                예
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingCostLog && pendingCostEstimate ? (
        <div
          className="life-cost-modal-backdrop"
          role="presentation"
          onMouseDown={() => setPendingCostLog(null)}
        >
          <section
            aria-label="라이프 마이닝 카드 생성 비용 확인"
            className="life-cost-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="life-cost-modal-heading">
              <div>
                <span>카드 생성 전 확인</span>
                <h2>예상 비용</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setPendingCostLog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="life-cost-summary">
              <Calculator size={19} />
              <div>
                <strong>{pendingCostEstimate.costLabel}</strong>
                <span>{pendingCostEstimate.providerLabel}</span>
              </div>
            </div>
            <div className="life-cost-grid">
              <div>
                <span>모델</span>
                <strong>{pendingCostEstimate.modelLabel}</strong>
              </div>
              <div>
                <span>예상 토큰</span>
                <strong>{pendingCostEstimate.tokenLabel}</strong>
              </div>
              <div>
                <span>요청</span>
                <strong>{pendingCostEstimate.requestLabel}</strong>
              </div>
              <div>
                <span>전기세</span>
                <strong>{pendingCostEstimate.electricityLabel}</strong>
              </div>
            </div>
            <p className="life-cost-note">{pendingCostEstimate.note}</p>
            <div className="life-cost-preview">
              <span>내가 한 말</span>
              <p>{pendingCostLog.text}</p>
            </div>
            <div className="life-cost-actions">
              <button className="button secondary" type="button" onClick={() => setPendingCostLog(null)}>
                취소
              </button>
              <button
                className="button success"
                disabled={isGenerating}
                type="button"
                onClick={() => void confirmLifeMiningCardCost()}
              >
                계속 만들기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LifeLogCandidatePreview({ log }: { log: LifeLog }) {
  const messages = getLifeLogCandidatePreviewMessages(log);

  return (
    <span className="life-log-message-preview" aria-label="대화 미리보기">
      {messages.map((message, index) => (
        <span
          key={`${message.role}-${message.speaker}-${message.text.slice(0, 18)}-${index}`}
          className={[
            "life-log-preview-row",
            message.role === "me" ? "is-me" : "is-other",
            message.isTarget ? "is-target" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="life-log-preview-speaker">{message.speaker}</span>
          <span className="life-log-preview-bubble">{message.text}</span>
        </span>
      ))}
    </span>
  );
}

function LifeLogConversationPreview({
  log,
  profileId
}: {
  log: LifeLog;
  profileId: AppSettings["profileId"];
}) {
  const messages = getLifeLogConversationMessages(log);
  const isProcessed = isLifeLogProcessedForProfile(log, profileId);
  return (
    <div className="life-log-conversation-preview">
      <div className="life-log-detail-meta">
        <span>
          <Globe2 size={13} />
          {getLifeLogSourceLabel(log)}
        </span>
        <span>
          <Clock size={13} />
          {formatLifeLogTime(log.createdAt)}
        </span>
        <span className={isProcessed ? "processed" : ""}>
          {isProcessed ? "카드 생성 완료" : "미생성"}
        </span>
      </div>
      <div className="life-chat-thread life-log-chat-thread">
        {messages.map((message, index) => (
          <LifeLogChatBubble
            key={`${message.speaker}-${message.text.slice(0, 24)}-${index}`}
            message={message}
          />
        ))}
      </div>
      {log.metadata?.title || log.metadata?.url ? (
        <div className="life-log-source-card">
          <small>수집 위치</small>
          <p>{log.metadata.title || log.metadata.url}</p>
        </div>
      ) : null}
    </div>
  );
}

function LifeLogChatBubble({ message }: { message: LifeLogConversationMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isCollapsible =
    message.role === "other" && message.text.length > LIFE_LOG_BUBBLE_COLLAPSE_LENGTH;
  const shouldClamp = isCollapsible && !expanded;

  return (
    <div className={`life-chat-row life-chat-row-${message.role}`}>
      {message.role === "other" ? (
        <span className="life-chat-avatar" title={message.speaker}>
          {getLifeLogSpeakerInitials(message.speaker)}
        </span>
      ) : null}
      <div className={`life-chat-bubble life-chat-bubble-${message.role}`}>
        <span className="life-chat-speaker">{message.speaker}</span>
        <p className={shouldClamp ? "life-chat-text is-clamped" : "life-chat-text"}>
          {message.text}
        </p>
        {isCollapsible ? (
          <button
            className="life-chat-read-more"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "접기" : "전체보기"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getLifeLogConversationMessages(log: LifeLog): LifeLogConversationMessage[] {
  return getLifeLogDisplayMessages(
    log,
    log.appName || getLifeLogSourceLabel(log).replace(/\s*·.*$/, "") || "상대"
  );
}

function getLifeLogCandidatePreviewMessages(log: LifeLog): LifeLogCandidatePreviewMessage[] {
  const messages = getLifeLogConversationMessages(log).filter((message) => message.text.trim());
  const fallbackTarget: LifeLogConversationMessage = {
    speaker: "나",
    text: log.text,
    role: "me"
  };

  if (!messages.length) {
    return [toLifeLogCandidatePreviewMessage(fallbackTarget, true)];
  }

  const targetIndex = getLifeLogCandidateTargetMessageIndex(messages, log.text);
  const target = targetIndex >= 0 ? messages[targetIndex] : fallbackTarget;
  const before = targetIndex >= 0 ? findNearestLifeLogPreviewMessage(messages, targetIndex, -1) : null;
  const after = targetIndex >= 0 ? findNearestLifeLogPreviewMessage(messages, targetIndex, 1) : null;

  return [before, target, after]
    .filter((message): message is LifeLogConversationMessage => Boolean(message))
    .slice(0, 3)
    .map((message) => toLifeLogCandidatePreviewMessage(message, message === target));
}

function getLifeLogCandidateTargetMessageIndex(
  messages: LifeLogConversationMessage[],
  targetText: string
) {
  const normalizedTarget = normalizeLifeLogPreviewLookupText(targetText);
  const exactIndex = messages.findIndex(
    (message) =>
      message.role === "me" &&
      normalizeLifeLogPreviewLookupText(message.text) === normalizedTarget
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const includesIndex = messages.findIndex((message) => {
    const normalizedMessage = normalizeLifeLogPreviewLookupText(message.text);
    return (
      message.role === "me" &&
      Boolean(normalizedTarget) &&
      (normalizedMessage.includes(normalizedTarget) || normalizedTarget.includes(normalizedMessage))
    );
  });
  if (includesIndex >= 0) {
    return includesIndex;
  }

  return messages.findIndex((message) => message.role === "me");
}

function findNearestLifeLogPreviewMessage(
  messages: LifeLogConversationMessage[],
  targetIndex: number,
  direction: -1 | 1
) {
  for (
    let index = targetIndex + direction;
    index >= 0 && index < messages.length;
    index += direction
  ) {
    if (messages[index]?.role === "other") {
      return messages[index];
    }
  }
  return messages[targetIndex + direction] ?? null;
}

function toLifeLogCandidatePreviewMessage(
  message: LifeLogConversationMessage,
  isTarget: boolean
): LifeLogCandidatePreviewMessage {
  return {
    ...message,
    speaker: normalizeLifeLogSpeaker(message.speaker) || (message.role === "me" ? "나" : "상대"),
    text: truncateLifeLogPreviewText(message.text),
    isTarget
  };
}

function truncateLifeLogPreviewText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH).trimEnd()}...`;
}

function normalizeLifeLogPreviewLookupText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function getLifeLogSpeakerInitials(value: string) {
  const normalized = normalizeLifeLogSpeaker(value);
  if (!normalized) {
    return "?";
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

function normalizeLifeLogSpeaker(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type LifeMiningCostEstimate = {
  providerLabel: string;
  modelLabel: string;
  tokenLabel: string;
  requestLabel: string;
  costLabel: string;
  electricityLabel: string;
  note: string;
};

function toCardGenerationUsageEstimate(
  estimate: LifeMiningCostEstimate
): CardGenerationUsageEstimateData {
  return {
    costLabel: estimate.costLabel,
    electricityLabel: estimate.electricityLabel,
    tokenLabel: estimate.tokenLabel,
    requestLabel: estimate.requestLabel,
    note: estimate.providerLabel
  };
}

function estimateLifeMiningCardCost(
  log: LifeLog,
  settings: AppSettings
): LifeMiningCostEstimate {
  if (settings.providerName !== "gemini") {
    return {
      providerLabel: settings.providerName === "ollama" ? "Ollama 로컬 카드 생성" : "Mock 카드 생성",
      modelLabel: settings.providerName === "ollama" ? settings.ollamaModel : "mock",
      tokenLabel: "API 토큰 없음",
      requestLabel: "0회",
      costLabel: "0원",
      electricityLabel: "0원",
      note:
        settings.providerName === "ollama"
          ? "로컬 Ollama를 사용하므로 API 비용은 없습니다. PC 자원만 사용합니다."
          : "Mock Provider는 실제 LLM을 호출하지 않으므로 비용이 없습니다."
    };
  }

  const estimateText = [
    log.beforeContext ? `바로 전 대화:\n${log.beforeContext}` : "",
    `내가 한 말:\n${log.text}`,
    log.afterContext ? `이후 대화:\n${log.afterContext}` : "",
    "Generate one structured life-expression card as JSON with variants, pattern notes, and practice prompts."
  ]
    .filter(Boolean)
    .join("\n\n");
  const estimate = estimateTranslationUsage({
    texts: [{ text: estimateText, cacheStatus: "miss" }],
    providerName: "gemini",
    model: settings.geminiModel,
    plan: settings.geminiPlan,
    sourceLang: settings.learningProfile.nativeLanguage.code,
    targetLang: settings.learningProfile.targetLanguage.code,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });

  return {
    providerLabel: settings.geminiPlan === "free" ? "Gemini 무료등급 설정" : "Gemini 유료등급 설정",
    modelLabel: estimate.model,
    tokenLabel: `${formatInteger(estimate.totalTokens.min)} ~ ${formatInteger(
      estimate.totalTokens.max
    )}`,
    requestLabel: `${estimate.requestCount}회`,
    costLabel:
      estimate.estimatedCostKrw.min === 0 && estimate.estimatedCostKrw.max === 0
        ? "0원"
        : `${formatWon(estimate.estimatedCostKrw.min)} ~ ${formatWon(
            estimate.estimatedCostKrw.max
          )}`,
    electricityLabel: "0원",
    note:
      "카드 JSON 출력까지 감안한 보수적 추정입니다. 실제 청구액은 Gemini 응답 길이와 과금 정책에 따라 달라질 수 있습니다."
  };
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function getLifeLogSourceLabel(log: LifeLog) {
  if (log.sourceType === "browser_extension") {
    return log.appName ? `${log.appName} · 확장 프로그램` : "브라우저 확장";
  }

  if (log.sourceType === "manual") {
    return "직접 추가";
  }

  return log.appName ?? log.sourceType;
}

function getLifeLogCandidateSourceLine(log: LifeLog) {
  return [
    getLifeLogCompactSourceLabel(log),
    getLifeLogCompactChannelLabel(log),
    formatLifeLogCompactTime(log.createdAt)
  ]
    .filter(Boolean)
    .join(" · ");
}

function getLifeLogCompactSourceLabel(log: LifeLog) {
  if (log.appName?.trim()) {
    return log.appName.trim();
  }
  if (log.sourceType === "manual") {
    return "직접 추가";
  }
  if (log.sourceType === "browser_extension") {
    return "브라우저";
  }
  if (log.sourceType === "desktop_capture") {
    return "화면 캡처";
  }
  return log.sourceType;
}

function getLifeLogCompactChannelLabel(log: LifeLog) {
  const title = typeof log.metadata?.title === "string" ? log.metadata.title.trim() : "";
  if (!title) {
    return "";
  }

  const parts = title.split(/[|·]/).map((part) => part.trim()).filter(Boolean);
  const channel = parts.find((part) => part.startsWith("#"));
  return channel ?? "";
}

function formatLifeLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatLifeLogCompactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}
