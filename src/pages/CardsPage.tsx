import {
  AlertTriangle,
  BookOpen,
  Cloud,
  Download,
  Link2,
  Lightbulb,
  RefreshCw,
  Trash2,
  Unlink,
  Upload,
  CreditCard
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardPreview } from "../components/CardPreview";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  getCardDeckFilterLabel,
  getCardDeckLabel,
  getCardDeckShortLabel,
  type CardDeckFilter
} from "../shared/cardDeck";
import { sanitizeSecretStatusMessage } from "../shared/settingsStatus";
import type { AppSettings, CardSyncSettings, CardSyncStatus, StudyCard } from "../shared/types";

type CardsPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
  onSettingsChange: (settings: AppSettings) => void;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
  onNavigate?: (route: "pdfReader" | "life" | "settings") => void;
};

export function CardsPage({
  api,
  cards,
  settings,
  onCardsChanged,
  onSettingsChange,
  onStartWritingPractice,
  onNavigate
}: CardsPageProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(cards[0]?.id ?? null);
  const [deckFilter, setDeckFilter] = useState<CardDeckFilter>("all");
  const [syncStatus, setSyncStatus] = useState<CardSyncStatus | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<StudyCard | null>(null);
  const syncSettings = useMemo<CardSyncSettings>(
    () => ({
      folderPath: settings.cardSyncFolderPath
    }),
    [settings.cardSyncFolderPath]
  );
  const filteredCards = useMemo(
    () => cards.filter((card) => deckFilter === "all" || card.deckType === deckFilter),
    [cards, deckFilter]
  );
  const selectedCard =
    filteredCards.find((card) => card.id === selectedCardId) ?? filteredCards[0] ?? null;

  useEffect(() => {
    if (filteredCards.length === 0) {
      setSelectedCardId(null);
      return;
    }
    if (!selectedCardId || !filteredCards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(filteredCards[0].id);
    }
  }, [filteredCards, selectedCardId]);

  async function deleteCard(card: StudyCard) {
    await api.cards.delete(card.id);
    setSelectedCardId(null);
    setDeleteCandidate(null);
    await onCardsChanged();
  }

  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await api.cardSync.status(syncSettings);
      setSyncStatus(status);
      setSyncMessage(sanitizeSecretStatusMessage(status.message));
    } catch (caught) {
      setSyncStatus(null);
      setSyncMessage(
        sanitizeSecretStatusMessage(
          getErrorMessage(caught, "동기화 폴더 상태 확인에 실패했습니다.")
        )
      );
    }
  }, [api.cardSync, syncSettings]);

  useEffect(() => {
    void loadSyncStatus();
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!deleteCandidate) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeleteCandidate(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteCandidate]);

  async function runSyncAction(
    action: () => Promise<{ message: string; folderPath?: string; connected?: boolean; configured?: boolean }>,
    options: { reloadCards?: boolean } = {}
  ) {
    setIsSyncing(true);
    setSyncMessage("동기화 폴더 작업 중...");
    try {
      const result = await action();
      const isStatusResult =
        typeof result.connected === "boolean" && typeof result.configured === "boolean";
      if (typeof result.folderPath === "string" && result.folderPath !== settings.cardSyncFolderPath) {
        onSettingsChange({
          ...settings,
          cardSyncFolderPath: result.folderPath
        });
      }
      setSyncMessage(sanitizeSecretStatusMessage(result.message));
      if (isStatusResult) {
        setSyncStatus(result as CardSyncStatus);
      }
      if (options.reloadCards) {
        await onCardsChanged();
      }
      if (!isStatusResult) {
        await loadSyncStatus();
      }
    } catch (caught) {
      setSyncMessage(
        sanitizeSecretStatusMessage(getErrorMessage(caught, "동기화 폴더 작업에 실패했습니다."))
      );
    } finally {
      setIsSyncing(false);
    }
  }

  const isSyncConfigured = Boolean(settings.cardSyncFolderPath.trim());
  const isSyncConnected = Boolean(syncStatus?.connected);

  return (
    <div className="page-grid cards-layout">
      <section className="panel list-panel">
        <div className="panel-heading">
          <CreditCard size={19} />
          <h2>카드</h2>
          <span className="pill">{cards.length}</span>
        </div>
        <div className="card-sync-panel">
          <div className="card-sync-heading">
            <Cloud size={17} />
            <div>
              <strong>동기화 폴더</strong>
              <small>Google Drive, OneDrive, Dropbox 폴더에 카드 JSON을 저장합니다.</small>
            </div>
          </div>
          <div className={isSyncConnected ? "card-sync-config ready" : "card-sync-config"}>
            <span>{isSyncConfigured ? "동기화 폴더 선택됨" : "동기화 폴더 필요"}</span>
            <small>
              {isSyncConfigured
                ? settings.cardSyncFolderPath
                : "Google Drive 데스크톱 앱이 동기화하는 폴더 안에 Language Miner 폴더를 만들고 선택하세요."}
            </small>
          </div>
          <div className="card-sync-options" aria-label="자동 동기화 설정">
            <label className="toggle-field compact-toggle">
              <input
                checked={settings.cardSyncOnStartup}
                type="checkbox"
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    cardSyncOnStartup: event.target.checked
                  })
                }
              />
              <span>
                <strong>시작 시 동기화</strong>
                <small>앱이 켜진 뒤 한 번만 병합합니다.</small>
              </span>
            </label>
            <label className="toggle-field compact-toggle">
              <input
                checked={settings.cardSyncOnQuit}
                type="checkbox"
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    cardSyncOnQuit: event.target.checked
                  })
                }
              />
              <span>
                <strong>종료 시 동기화</strong>
                <small>트레이 Quit/완전 종료 때 저장합니다.</small>
              </span>
            </label>
          </div>
          <div className="card-sync-actions">
            <button
              className="button secondary small"
              disabled={isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.connect(syncSettings))}
            >
              <Link2 size={15} />
              폴더 선택
            </button>
            <button
              className="button ghost small"
              disabled={!isSyncConfigured || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.disconnect())}
            >
              <Unlink size={15} />
              폴더 해제
            </button>
            <button
              className="button ghost small"
              data-qa="cards-sync-status-button"
              disabled={!isSyncConfigured || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.status(syncSettings))}
            >
              <RefreshCw size={15} />
              확인
            </button>
          </div>
          <div className="card-sync-actions">
            <button
              className="button secondary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.upload(syncSettings))}
            >
              <Upload size={15} />
              업로드
            </button>
            <button
              className="button secondary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() =>
                void runSyncAction(() => api.cardSync.download(syncSettings), {
                  reloadCards: true
                })
              }
            >
              <Download size={15} />
              다운로드
            </button>
            <button
              className="button primary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() =>
                void runSyncAction(() => api.cardSync.sync(syncSettings), {
                  reloadCards: true
                })
              }
            >
              <RefreshCw size={15} />
              동기화
            </button>
          </div>
          <p className={isSyncConnected ? "status-text compact" : "muted compact"}>
            {syncMessage || "동기화 폴더 상태를 확인 중입니다."}
          </p>
          {syncStatus?.remoteModifiedAt ? (
            <small className="muted compact">
              마지막 카드 파일 변경: {new Date(syncStatus.remoteModifiedAt).toLocaleString()}
            </small>
          ) : null}
        </div>
        <div className="segmented-control compact deck-filter">
          {(["all", "input", "input-listening", "output"] as CardDeckFilter[]).map((filter) => (
            <button
              key={filter}
              className={deckFilter === filter ? "active" : ""}
              type="button"
              onClick={() => setDeckFilter(filter)}
            >
              {getCardDeckFilterLabel(filter)}
            </button>
          ))}
        </div>
        <div className="card-list">
          {filteredCards.map((card) => {
            const preview = getCardListPreview(card);
            return (
              <button
                key={card.id}
                className={`card-list-item ${selectedCard?.id === card.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedCardId(card.id)}
              >
                <span className="card-list-title">
                  <span className={`card-list-deck-badge deck-${card.deckType}`}>
                    {getCardDeckShortLabel(card)}
                  </span>
                  <span>{preview.title}</span>
                </span>
                <small>{preview.subtitle}</small>
              </button>
            );
          })}
          {filteredCards.length === 0 ? (
            <div className="empty-state" data-qa="cards-empty-state">
              <span>저장된 카드가 없습니다.</span>
              {onNavigate ? (
                <div className="empty-state-actions">
                  <button
                    className="button primary small"
                    data-qa="cards-empty-open-reader"
                    type="button"
                    onClick={() => onNavigate("pdfReader")}
                  >
                    <BookOpen size={15} />
                    리더기 열기
                  </button>
                  <button
                    className="button secondary small"
                    data-qa="cards-empty-open-life"
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
        </div>
      </section>
      <section className="panel detail-panel">
        {selectedCard ? (
          <>
            <div className="detail-toolbar">
              <span className="pill">
                복습 예정 {new Date(selectedCard.srs.dueAt).toLocaleString()}
              </span>
              <button
                className="icon-button danger"
                title="카드 삭제"
                type="button"
                onClick={() => setDeleteCandidate(selectedCard)}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <CardPreview
              card={selectedCard}
              settings={settings}
              defaultShowBack
              onStartWritingPractice={onStartWritingPractice}
            />
          </>
        ) : (
          <div className="empty-state">선택한 카드가 없습니다.</div>
        )}
      </section>
      {deleteCandidate ? (
        <div
          className="card-delete-modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeleteCandidate(null)}
        >
          <div
            aria-labelledby="card-delete-title"
            aria-modal="true"
            className="card-delete-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="card-delete-modal-heading">
              <span>
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 id="card-delete-title">카드를 삭제할까요?</h2>
                <p>삭제하면 복습 기록과 카드 내용이 함께 사라집니다.</p>
              </div>
            </div>
            <div className="card-delete-preview">
              <span className={`card-list-deck-badge deck-${deleteCandidate.deckType}`}>
                {getCardDeckShortLabel(deleteCandidate)}
              </span>
              <strong>{getCardListPreview(deleteCandidate).title}</strong>
              <small>{getCardListPreview(deleteCandidate).subtitle}</small>
            </div>
            <div className="card-delete-modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setDeleteCandidate(null)}
              >
                취소
              </button>
              <button
                className="button secondary danger-button"
                type="button"
                onClick={() => void deleteCard(deleteCandidate)}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getCardListPreview(card: StudyCard) {
  const prefix = card.syncMetadata?.conflict ? "충돌 · " : "";
  if (card.deckType === "input-listening") {
    return prefixPreview(getListeningCardListPreview(card), prefix);
  }

  if (card.cardType === "life_expression" || card.deckType === "output") {
    return prefixPreview(getOutputCardListPreview(card), prefix);
  }

  return prefixPreview(getInputCardListPreview(card), prefix);
}

function prefixPreview(preview: { title: string; subtitle: string }, prefix: string) {
  if (!prefix) {
    return preview;
  }
  return {
    ...preview,
    title: `${prefix}${preview.title}`
  };
}

function getListeningCardListPreview(card: StudyCard) {
  const title = firstMeaningfulLine(card.sourceSentence || card.frontText) || getCardDeckLabel(card);
  const videoLine = splitMeaningfulLines(card.structureNote).find((line) =>
    /^(?:영상|Video|YouTube)/i.test(line)
  );

  return {
    title,
    subtitle: videoLine?.replace(/^(?:영상|Video)\s*[:：]\s*/i, "") || getCardDeckLabel(card)
  };
}

function getInputCardListPreview(card: StudyCard) {
  const terms = getUniquePreviewTerms([
    ...card.vocabularyItems.map((item) => item.term),
    ...card.highlightMappings.map((mapping) => mapping.sourceText)
  ]);
  const fallback = firstMeaningfulLine(card.frontText || card.sourceSentence) || getCardDeckLabel(card);
  const title = terms.length ? formatTermsTitle(terms) : fallback;
  const subtitle =
    firstMeaningfulLine(card.sourceSentence || card.frontText) ||
    (title === fallback ? getCardDeckLabel(card) : fallback);

  return {
    title,
    subtitle
  };
}

function getOutputCardListPreview(card: StudyCard) {
  const title =
    firstMeaningfulLine(card.sourceSentence) ||
    extractMeLineFromFrontText(card.frontText) ||
    lastMeaningfulLine(card.frontText) ||
    getCardDeckLabel(card);

  return {
    title,
    subtitle: getOutputCardSubtitle(card.frontText) || getCardDeckLabel(card)
  };
}

function getOutputCardSubtitle(frontText: string) {
  const originalLines = getOriginalSectionLines(frontText);
  if (originalLines.length === 0) {
    return "";
  }

  const meIndex = originalLines.findIndex(isMeLine);
  const contextLines = (meIndex >= 0 ? originalLines.slice(0, meIndex) : originalLines)
    .map((line) => line.trim())
    .filter((line) => line && !isCardFrontHeading(line));

  if (contextLines.length === 0) {
    return "";
  }

  const speakerLabels = contextLines
    .map(extractSpeakerLabel)
    .filter((label): label is string => Boolean(label && !isMeSpeaker(label)));
  const sourceLabel = normalizeSourceLabel(speakerLabels[0]);
  const contextCount = Math.max(1, speakerLabels.length || contextLines.length);
  const contextLabel =
    sourceLabel === "ChatGPT" || sourceLabel === "Claude"
      ? "이전 맥락 있음"
      : `이전 대화 ${contextCount}개`;

  return sourceLabel ? `${sourceLabel} · ${contextLabel}` : contextLabel;
}

function extractMeLineFromFrontText(frontText: string) {
  const meLine = getOriginalSectionLines(frontText).find(isMeLine);
  if (!meLine) {
    return "";
  }
  return normalizePreviewText(meLine.replace(/^\s*(?:Me|나|내 말)\s*[:：]\s*/i, ""));
}

function getOriginalSectionLines(frontText: string) {
  const lines = splitNormalizedLines(frontText);
  const originalHeadingIndex = lines.findIndex((line) =>
    /^(?:원문|original|conversation)$/i.test(line.trim())
  );
  const scopedLines = originalHeadingIndex >= 0 ? lines.slice(originalHeadingIndex + 1) : lines;
  return scopedLines.filter((line) => !isCardFrontHeading(line));
}

function firstMeaningfulLine(value: string | undefined) {
  return splitMeaningfulLines(value)[0] ?? "";
}

function lastMeaningfulLine(value: string | undefined) {
  const lines = splitMeaningfulLines(value);
  return lines[lines.length - 1] ?? "";
}

function splitMeaningfulLines(value: string | undefined) {
  return splitNormalizedLines(value).filter((line) => !isCardFrontHeading(line));
}

function splitNormalizedLines(value: string | undefined) {
  return String(value || "")
    .split(/\n+/)
    .map(normalizePreviewText)
    .filter(Boolean);
}

function normalizePreviewText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isCardFrontHeading(line: string) {
  return /^(?:맥락|원문|context|original|conversation)$/i.test(line.trim());
}

function isMeLine(line: string) {
  return /^\s*(?:Me|나|내 말)\s*[:：]/i.test(line);
}

function isMeSpeaker(label: string) {
  return /^(?:Me|나|내 말)$/i.test(label.trim());
}

function extractSpeakerLabel(line: string) {
  const match = line.match(/^\s*([^:：]{1,40})\s*[:：]/);
  return match?.[1]?.trim();
}

function normalizeSourceLabel(label: string | undefined) {
  const normalized = normalizePreviewText(label || "");
  if (!normalized) {
    return "";
  }
  if (/chatgpt|gpt/i.test(normalized)) {
    return "ChatGPT";
  }
  if (/claude/i.test(normalized)) {
    return "Claude";
  }
  if (/discord/i.test(normalized)) {
    return "Discord";
  }
  return normalized;
}

function getUniquePreviewTerms(values: string[]) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = normalizePreviewText(value);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatTermsTitle(terms: string[]) {
  const visibleTerms = terms.slice(0, 3).join(", ");
  const hiddenCount = terms.length - 3;
  return hiddenCount > 0 ? `${visibleTerms} +${hiddenCount}` : visibleTerms;
}
