import { AlertTriangle, ListPlus, Loader2, Save, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardGenerationUsageEstimate } from "../components/CardGenerationUsageEstimate";
import { CardPreview } from "../components/CardPreview";
import { SelectionPopover } from "../components/SelectionPopover";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import {
  estimateCardGenerationUsage,
  type CardGenerationUsageEstimate as CardGenerationUsageEstimateData
} from "../shared/cardGenerationUsage";
import type { AppSettings, HighlightColorKey } from "../shared/types";
import type { StudyCard } from "../shared/types";
import { extractSentenceContext } from "../utils/sentenceExtraction";

const readerText = `The city seemed to hold its breath after sunset.

Narrow, deserted streets wind through dilapidated buildings, their facades worn and battered by time and neglect.

A lone bakery still kept its windows warm, and the smell of bread drifted across the square.

Mara paused under a flickering streetlamp, wondering why the quiet felt less like peace and more like a warning.`;

type SelectionContext = {
  selectedText: string;
  selectionOffset?: number;
};

type SentenceTermsSession = {
  selectedTerms: string[];
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  normalizedFullText: string;
  extractionConfidence: "high" | "medium" | "fallback";
};

type PendingSentenceTerm = {
  text: string;
  position: {
    top: number;
    left: number;
  };
};

type ReaderPageProps = {
  api: LocalEnglishMinerApi;
  provider: LLMProvider;
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
};

const MAX_SENTENCE_TERMS = 10;

export function ReaderPage({
  api,
  provider,
  settings,
  onCardsChanged
}: ReaderPageProps) {
  const readerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [sentenceTermsSession, setSentenceTermsSession] =
    useState<SentenceTermsSession | null>(null);
  const [sentenceTermsWarning, setSentenceTermsWarning] = useState("");
  const [pendingSentenceTerm, setPendingSentenceTerm] = useState<PendingSentenceTerm | null>(
    null
  );
  const [candidate, setCandidate] = useState<StudyCard | null>(null);
  const [generationUsageEstimate, setGenerationUsageEstimate] =
    useState<CardGenerationUsageEstimateData | null>(null);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectionWarning = useMemo(() => {
    if (!selection?.selectedText) {
      return "";
    }
    if (selection.selectedText.length > 80) {
      return "선택 텍스트가 깁니다. 문장 추출은 계속 진행됩니다.";
    }
    if (
      settings.learningProfile.targetLanguage.code === "en" &&
      !/[A-Za-z]/.test(selection.selectedText)
    ) {
      return `${settings.learningProfile.targetLanguage.nameKo} 표현이 아닌 것 같습니다. 생성은 계속 진행됩니다.`;
    }
    return "";
  }, [selection, settings.learningProfile.targetLanguage]);
  const selectionUsageEstimate = useMemo(() => {
    if (!selection?.selectedText) {
      return null;
    }
    const fullText = readerRef.current?.innerText ?? readerText;
    const extraction = extractSentenceContext({
      fullText,
      selectedText: selection.selectedText,
      selectionOffset: selection.selectionOffset
    });
    return estimateCardGenerationUsage({
      selectedText: extraction.selectedText,
      sourceSentence: extraction.sourceSentence,
      beforeSentence: extraction.beforeSentence,
      afterSentence: extraction.afterSentence,
      readerTextContext:
        extraction.extractionConfidence === "fallback"
          ? extraction.sourceSentence
          : extraction.normalizedFullText,
      settings
    });
  }, [selection, settings]);
  const sentenceTermsUsageEstimate = useMemo(() => {
    if (!sentenceTermsSession) {
      return null;
    }
    return estimateCardGenerationUsage({
      selectedText: sentenceTermsSession.selectedTerms.join(", "),
      sourceSentence: sentenceTermsSession.sourceSentence,
      beforeSentence: sentenceTermsSession.beforeSentence,
      afterSentence: sentenceTermsSession.afterSentence,
      readerTextContext:
        sentenceTermsSession.extractionConfidence === "fallback"
          ? sentenceTermsSession.sourceSentence
          : sentenceTermsSession.normalizedFullText,
      settings
    });
  }, [sentenceTermsSession, settings]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setPopoverPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const cancelSelectionFlow = useCallback(() => {
    setSentenceTermsSession(null);
    setSentenceTermsWarning("");
    setPendingSentenceTerm(null);
    setGenerationUsageEstimate(null);
    clearSelection();
  }, [clearSelection]);

  const addSentenceTerm = useCallback(
    (term: string) => {
      if (!sentenceTermsSession) {
        return;
      }

      if (sentenceTermsSession.selectedTerms.length >= MAX_SENTENCE_TERMS) {
        setSentenceTermsWarning(`단어는 최대 ${MAX_SENTENCE_TERMS}개까지 고를 수 있습니다.`);
        setPendingSentenceTerm(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      const normalizedTerm = term.trim().toLowerCase();
      const hasTerm = sentenceTermsSession.selectedTerms.some(
        (selectedTerm) => selectedTerm.toLowerCase() === normalizedTerm
      );

      if (hasTerm) {
        setSentenceTermsWarning("이미 고른 단어입니다.");
        setPendingSentenceTerm(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      setSentenceTermsSession({
        ...sentenceTermsSession,
        selectedTerms: [...sentenceTermsSession.selectedTerms, term.trim()]
      });
      setSentenceTermsWarning("");
      setPendingSentenceTerm(null);
      setStatusMessage(`추가됨: ${term.trim()}`);
      window.getSelection()?.removeAllRanges();
    },
    [sentenceTermsSession]
  );

  const updateSelectionFromWindow = useCallback(() => {
    const activeSelection = window.getSelection();
    const reader = readerRef.current;
    if (!activeSelection || activeSelection.rangeCount === 0 || !reader) {
      return;
    }

    const selectedText = activeSelection.toString().trim();
    if (!selectedText) {
      setSelection(null);
      setPopoverPosition(null);
      return;
    }

    const range = activeSelection.getRangeAt(0);
    if (!reader.contains(range.commonAncestorContainer)) {
      return;
    }

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(reader);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const selectionOffset = preSelectionRange.toString().length;
    const rect = range.getBoundingClientRect();

    if (sentenceTermsSession) {
      setSentenceTermsWarning("오른쪽 문장 박스에서 단어를 골라 주세요.");
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      setPopoverPosition(null);
      return;
    }

    setSelection({ selectedText, selectionOffset });
    setPopoverPosition({
      top: Math.max(12, rect.top - 104),
      left: Math.min(window.innerWidth - 236, Math.max(16, rect.left + rect.width / 2 - 118))
    });
  }, [sentenceTermsSession]);

  const updateSentencePanelSelection = useCallback(() => {
    if (!sentenceTermsSession) {
      return;
    }

    if (sentenceTermsSession.selectedTerms.length >= MAX_SENTENCE_TERMS) {
      setSentenceTermsWarning(`단어는 최대 ${MAX_SENTENCE_TERMS}개까지 고를 수 있습니다.`);
      setPendingSentenceTerm(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.rangeCount === 0) {
      return;
    }

    const selectedText = activeSelection.toString().trim();
    if (!selectedText) {
      setPendingSentenceTerm(null);
      return;
    }

    const range = activeSelection.getRangeAt(0);
    const sourceBox = document.querySelector(".sentence-source-box");
    if (!sourceBox?.contains(range.commonAncestorContainer)) {
      return;
    }

    const rect = range.getBoundingClientRect();
    setPendingSentenceTerm({
      text: selectedText,
      position: {
        top: Math.max(12, rect.top - 74),
        left: Math.min(window.innerWidth - 176, Math.max(16, rect.left + rect.width / 2 - 88))
      }
    });
    setSentenceTermsWarning("");
  }, [sentenceTermsSession]);

  const generateCardFromSentence = useCallback(
    async (
      input: {
        selectedText: string;
        sourceSentence: string;
        beforeSentence?: string;
        afterSentence?: string;
        normalizedFullText: string;
        extractionConfidence: "high" | "medium" | "fallback";
      },
      afterGenerate?: () => void
    ) => {
      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setErrorMessage("");
      setStatusMessage("");
      setGenerationUsageEstimate(
        estimateCardGenerationUsage({
          selectedText: input.selectedText,
          sourceSentence: input.sourceSentence,
          beforeSentence: input.beforeSentence,
          afterSentence: input.afterSentence,
          readerTextContext:
            input.extractionConfidence === "fallback"
              ? input.sourceSentence
              : input.normalizedFullText,
          settings
        })
      );

      try {
        const generated = await provider.generateReadingCard({
          selectedText: input.selectedText,
          sourceSentence: input.sourceSentence,
          beforeSentence: input.beforeSentence,
          afterSentence: input.afterSentence,
          readerTextContext:
            input.extractionConfidence === "fallback"
              ? input.sourceSentence
              : input.normalizedFullText,
          learningProfile: settings.learningProfile,
          learnerLevel: "intermediate"
        });
        setCandidate(createStudyCardFromGenerated(generated));
        setSavedCardId(null);
        setStatusMessage(`문장 추출: ${input.extractionConfidence}`);
        afterGenerate?.();
      } catch (caught) {
        setErrorMessage(caught instanceof Error ? caught.message : "카드를 생성하지 못했습니다.");
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, provider, settings]
  );

  const createCardFromSelection = useCallback(async () => {
    if (!selection || isGenerating) {
      return;
    }

    const fullText = readerRef.current?.innerText ?? readerText;
    const extraction = extractSentenceContext({
      fullText,
      selectedText: selection.selectedText,
      selectionOffset: selection.selectionOffset
    });
    await generateCardFromSentence(extraction, clearSelection);
  }, [clearSelection, generateCardFromSentence, isGenerating, selection]);

  const startSentenceTermSelection = useCallback(() => {
    if (!selection) {
      return;
    }

    const fullText = readerRef.current?.innerText ?? readerText;
    const extraction = extractSentenceContext({
      fullText,
      selectedText: selection.selectedText,
      selectionOffset: selection.selectionOffset
    });

    setSentenceTermsSession({
      selectedTerms: [extraction.selectedText],
      sourceSentence: extraction.sourceSentence,
      beforeSentence: extraction.beforeSentence,
      afterSentence: extraction.afterSentence,
      normalizedFullText: extraction.normalizedFullText,
      extractionConfidence: extraction.extractionConfidence
    });
    setSentenceTermsWarning("");
    setPendingSentenceTerm(null);
    setCandidate(null);
    setGenerationUsageEstimate(null);
    setStatusMessage(`문장 단어 선택 중: ${extraction.selectedText}`);
    clearSelection();
  }, [clearSelection, selection]);

  const createCardFromSentenceTerms = useCallback(async () => {
    if (!sentenceTermsSession || isGenerating) {
      return;
    }

    await generateCardFromSentence(
      {
        selectedText: sentenceTermsSession.selectedTerms.join(", "),
        sourceSentence: sentenceTermsSession.sourceSentence,
        beforeSentence: sentenceTermsSession.beforeSentence,
        afterSentence: sentenceTermsSession.afterSentence,
        normalizedFullText: sentenceTermsSession.normalizedFullText,
        extractionConfidence: sentenceTermsSession.extractionConfidence
      },
      cancelSelectionFlow
    );
  }, [cancelSelectionFlow, generateCardFromSentence, isGenerating, sentenceTermsSession]);

  async function saveCandidate() {
    if (!candidate) {
      return;
    }
    setIsSavingCard(true);
    try {
      const saved = await api.cards.save(candidate);
      setCandidate(null);
      setGenerationUsageEstimate(null);
      setSavedCardId(saved.id);
      setStatusMessage("카드를 저장했습니다. 복습 화면에서 바로 복습할 수 있습니다.");
      await onCardsChanged();
    } finally {
      setIsSavingCard(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (sentenceTermsSession) {
          void createCardFromSentenceTerms();
        } else {
          void createCardFromSelection();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createCardFromSelection, createCardFromSentenceTerms, sentenceTermsSession]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const reader = readerRef.current;
      const popover = document.querySelector(".selection-popover");
      const termAddPopover = document.querySelector(".term-add-popover");
      const sentenceTermPanel = document.querySelector(".sentence-term-panel");
      if (
        reader?.contains(target) ||
        popover?.contains(target) ||
        termAddPopover?.contains(target) ||
        sentenceTermPanel?.contains(target)
      ) {
        return;
      }
      cancelSelectionFlow();
    }

    function handleSelectionChange() {
      if (!window.getSelection()?.toString().trim()) {
        setSelection(null);
        setPendingSentenceTerm(null);
        if (!sentenceTermsSession) {
          setPopoverPosition(null);
        }
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("blur", cancelSelectionFlow);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("blur", cancelSelectionFlow);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [cancelSelectionFlow, sentenceTermsSession]);

  return (
    <div className="page-grid reader-layout">
      <section className="panel reader-panel text-reader-panel">
        <div className="panel-heading">
          <Sparkles size={19} />
          <h2>Text Reader</h2>
          <span className="pill">{provider.name}</span>
        </div>
        <div
          ref={readerRef}
          className="reader-text"
          onMouseUp={() => window.setTimeout(updateSelectionFromWindow, 0)}
          onKeyUp={() => window.setTimeout(updateSelectionFromWindow, 0)}
          tabIndex={0}
        >
          {readerText.split("\n\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {popoverPosition && selection ? (
          <SelectionPopover
            loading={isGenerating}
            position={popoverPosition}
            selectedText={selection.selectedText}
            usageEstimate={selectionUsageEstimate}
            warning={selectionWarning}
            onCreate={() => void createCardFromSelection()}
            onStartSentenceTerms={startSentenceTermSelection}
            onDismiss={clearSelection}
          />
        ) : null}
      </section>

      <aside className="side-stack reader-candidate-stack">
        <section className="panel candidate-panel">
          <div className="panel-heading">
            {isGenerating ? <Loader2 className="spin" size={19} /> : <AlertTriangle size={19} />}
            <h2>Card Candidate</h2>
          </div>
          {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          <CardGenerationUsageEstimate estimate={generationUsageEstimate} variant="badge" />
          {sentenceTermsSession ? (
            <div className="sentence-term-panel">
              <div className="sentence-term-header">
                <ListPlus size={18} />
                <strong>문장 단어 더 고르기</strong>
              </div>
              <p className="muted compact">
                아래 문장에서 단어를 드래그한 뒤 이 단어 추가를 누르세요.
              </p>
              <div
                className="sentence-source-box"
                onMouseUp={() => window.setTimeout(updateSentencePanelSelection, 0)}
                onKeyUp={() => window.setTimeout(updateSentencePanelSelection, 0)}
                tabIndex={0}
              >
                {renderSentenceTerms(
                  sentenceTermsSession.sourceSentence,
                  sentenceTermsSession.selectedTerms
                )}
              </div>
              {pendingSentenceTerm ? (
                <div
                  className="term-add-popover"
                  style={{
                    top: pendingSentenceTerm.position.top,
                    left: pendingSentenceTerm.position.left
                  }}
                >
                  <div className="selection-popover-text">{pendingSentenceTerm.text}</div>
                  <button
                    className="button primary"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addSentenceTerm(pendingSentenceTerm.text)}
                  >
                    <ListPlus size={16} />이 단어 추가
                  </button>
                </div>
              ) : null}
              <div className="selection-term-list">
                {sentenceTermsSession.selectedTerms.map((term) => (
                  <span className="selection-term-chip" key={term}>
                    {term}
                  </span>
                ))}
              </div>
              <p className="muted compact">
                {sentenceTermsSession.selectedTerms.length}/{MAX_SENTENCE_TERMS}
              </p>
              {sentenceTermsWarning ? (
                <p className="selection-warning">{sentenceTermsWarning}</p>
              ) : null}
              <div className="sentence-term-actions">
                <div className="card-generation-action-row">
                  <CardGenerationUsageEstimate
                    estimate={sentenceTermsUsageEstimate}
                    variant="badge"
                  />
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void createCardFromSentenceTerms()}
                  >
                    {isGenerating ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                    문장카드 만들기
                  </button>
                </div>
                <button className="button ghost" type="button" onClick={cancelSelectionFlow}>
                  <X size={16} />
                  취소
                </button>
              </div>
            </div>
          ) : candidate ? (
            <>
              <CardPreview card={candidate} settings={settings} defaultShowBack />
              <button
                className="button primary wide"
                type="button"
                disabled={isSavingCard || savedCardId === candidate.id}
                onClick={saveCandidate}
              >
                <Save size={18} />
                {savedCardId === candidate.id ? "저장됨" : "카드 저장"}
              </button>
            </>
          ) : (
            <div className="empty-state">후보가 없습니다.</div>
          )}
        </section>
      </aside>
    </div>
  );
}

const sentenceTermColors: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

function renderSentenceTerms(sourceSentence: string, selectedTerms: string[]) {
  const matches = findSentenceTermMatches(sourceSentence, selectedTerms);
  if (matches.length === 0) {
    return sourceSentence;
  }

  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(sourceSentence.slice(cursor, match.start));
    }

    parts.push(
      <mark
        className={`highlight highlight-${match.colorKey}`}
        key={`${match.start}-${match.end}-${index}`}
      >
        {sourceSentence.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  });

  if (cursor < sourceSentence.length) {
    parts.push(sourceSentence.slice(cursor));
  }

  return parts;
}

function findSentenceTermMatches(sourceSentence: string, selectedTerms: string[]) {
  const matches: Array<{
    start: number;
    end: number;
    colorKey: HighlightColorKey;
  }> = [];

  selectedTerms.forEach((term, termIndex) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      return;
    }

    const colorKey = sentenceTermColors[termIndex % sentenceTermColors.length];
    const regex = new RegExp(escapeRegExp(trimmedTerm), "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceSentence)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        colorKey
      });

      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
  });

  return matches
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<typeof matches>((accepted, match) => {
      const overlaps = accepted.some(
        (existing) => match.start < existing.end && match.end > existing.start
      );
      return overlaps ? accepted : [...accepted, match];
    }, []);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
