import {
  FileText,
  Languages,
  Loader2,
  Save
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { CardGenerationUsageEstimate } from "./CardGenerationUsageEstimate";
import { CardPreview } from "./CardPreview";
import { PdfMakerJobSummary } from "./PdfMakerJobSummary";
import { PdfMakerWorkflow } from "./PdfMakerWorkflow";
import { PdfPageHighlights } from "./PdfPageHighlights";
import { PdfReaderEmptyState } from "./PdfReaderEmptyState";
import { PdfReaderRuntimeDialogs } from "./PdfReaderRuntimeDialogs";
import { PdfReaderToolbar } from "./PdfReaderToolbar";
import { PdfTranslationSegmentList } from "./PdfTranslationSegmentList";
import {
  loadPdfDocument,
  usePdfPageDataReader,
  usePdfPageRenderer,
  type ExtractedPdfPageData,
  type PdfDocument
} from "./pdfReaderDocument";
import {
  getTranslationSegmentsForExportMode,
  prepareBilingualExportPage,
  renderPdfPageImage
} from "./pdfExportPreparation";
import {
  buildPdfReaderTranslationContext,
  createPdfSegmentTranslationRequest,
  createPdfTranslationCacheLookupInput
} from "./pdfReaderTranslationRequest";
import {
  normalizeBrowserTranslatorLanguage,
  translatePdfSegmentsWithBrowserTranslator
} from "./pdfBrowserTranslator";
import {
  arrayBufferFromPdfFileData,
  createReaderArtifactFromExportRecord,
  formatPdfExportActionError,
  formatPageList,
  getExportArtifactLabel,
  getMergedCacheStatus,
  getPageNavigationDelta,
  isEditableTarget,
  isOllamaConnectionError,
  isPageNavigationShortcut,
  matchesShortcut,
  mergePageTranslationStates,
  mergeSegmentTranslations,
  type PageTranslationState
} from "./pdfSelectionReaderUtils";
import {
  type PdfPageViewport
} from "./pdfLayoutExtraction";
import {
  getPdfReaderWorkflowState,
  getUntranslatedPageNumbers,
  hasCompletePageTranslation as hasCompleteCachedPageTranslation,
  type DocumentTranslationJob,
  type ExportBilingualPdfOptions,
  type PageTranslationFailure,
  type RangeTranslationProgress,
  type RangeTranslationResult,
  type TranslatePageRangeOptions
} from "./pdfReaderWorkflowState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { buildBilingualDocumentHtml } from "../shared/bilingualExport";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage,
  getTranslationModelName,
  getTranslationProviderLabel,
  type TranslationUsageEstimate
} from "../shared/translationUsage";
import type {
  AppSettings,
  BilingualExportHistoryRecord,
  BilingualReaderArtifact,
  BilingualPdfExportPage,
  PdfSegmentTranslation,
  PdfTextSegment,
  PdfTranslationContext,
  StudyCard,
  TranslatePdfSegmentsResult
} from "../shared/types";
import { recordTranslationUsageEvent } from "../utils/translationUsageLedger";
import { parsePageRange } from "../utils/pageRange";
import { extractSentenceContext } from "../utils/sentenceExtraction";
import {
  createPdfLiveCardRequest,
  estimatePdfLiveCardUsage,
  type PdfLiveCardUsageEstimate
} from "./pdfReaderLiveCards";

type PDFSelectionReaderProps = {
  api: LocalEnglishMinerApi;
  mode?: "reader" | "maker";
  provider?: LLMProvider;
  settings: AppSettings;
  onCardsChanged?: () => Promise<void>;
  onMakerKeepAliveChange?: (shouldKeepAlive: boolean) => void;
  onOpenReaderArtifact?: (artifact: BilingualReaderArtifact) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

type PendingModelDownload = {
  segments?: PdfTextSegment[];
  pageNumbers?: number[];
  continueAction?: "translate" | "translateAndExport";
  model: string;
  baseUrl: string;
};

type PendingOllamaSetup = {
  baseUrl: string;
  model: string;
  message: string;
};

type PdfExportRecord = BilingualExportHistoryRecord;

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/windows";

export function PDFSelectionReader({
  api,
  mode = "reader",
  provider,
  settings,
  onCardsChanged,
  onMakerKeepAliveChange,
  onOpenReaderArtifact,
  onSettingsChange
}: PDFSelectionReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const debugPdfLoadKeyRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [sourcePdfData, setSourcePdfData] = useState<Uint8Array | null>(null);
  const [sourcePdfFilePath, setSourcePdfFilePath] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const [pageSegments, setPageSegments] = useState<PdfTextSegment[]>([]);
  const [segmentTranslations, setSegmentTranslations] = useState<PdfSegmentTranslation[]>([]);
  const [pageTranslations, setPageTranslations] = useState<Record<number, PageTranslationState>>(
    {}
  );
  const [pageTranslationFailures, setPageTranslationFailures] = useState<
    Record<number, PageTranslationFailure>
  >({});
  const [pageRangeInput, setPageRangeInput] = useState("1");
  const [rangeProgress, setRangeProgress] = useState<RangeTranslationProgress | null>(null);
  const [cacheStatus, setCacheStatus] = useState<"idle" | "hit" | "miss">("idle");
  const [viewerStatus, setViewerStatus] = useState("");
  const [translationStatus, setTranslationStatus] = useState("");
  const [exportRecords, setExportRecords] = useState<PdfExportRecord[]>([]);
  const [documentJob, setDocumentJob] = useState<DocumentTranslationJob | null>(null);
  const [showLayoutHighlights, setShowLayoutHighlights] = useState(false);
  const [showLayoutPreview, setShowLayoutPreview] = useState(false);
  const [layoutPreviewHtml, setLayoutPreviewHtml] = useState("");
  const [layoutPreviewStatus, setLayoutPreviewStatus] = useState("");
  const [bypassTranslationCache, setBypassTranslationCache] = useState(false);
  const [makerUsageEstimate, setMakerUsageEstimate] = useState<TranslationUsageEstimate | null>(
    null
  );
  const [makerUsageStatus, setMakerUsageStatus] = useState("");
  const [error, setError] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBuildingLayoutPreview, setIsBuildingLayoutPreview] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [liveCardCandidate, setLiveCardCandidate] = useState<StudyCard | null>(null);
  const [liveCardStatus, setLiveCardStatus] = useState("");
  const [liveCardUsageEstimate, setLiveCardUsageEstimate] =
    useState<PdfLiveCardUsageEstimate | null>(null);
  const [isGeneratingLiveCard, setIsGeneratingLiveCard] = useState(false);
  const [pendingModelDownload, setPendingModelDownload] =
    useState<PendingModelDownload | null>(null);
  const [pendingOllamaSetup, setPendingOllamaSetup] = useState<PendingOllamaSetup | null>(
    null
  );
  const {
    clearPageDataCache,
    readPageData,
    readPageText,
    readPageSegments
  } = usePdfPageDataReader(pdfDocument);

  const isMakerMode = mode === "maker";
  const isDesktopRuntime =
    typeof window !== "undefined" && Boolean(window.localEnglishMiner);
  const providerLabel = getTranslationProviderLabel(settings);
  const selectedTranslationModel = getTranslationModelName(settings);
  const googleKeyMissing =
    (settings.translationProviderName === "google" && !settings.googleTranslateApiKey.trim()) ||
    (settings.translationProviderName === "gemini" && !settings.geminiApiKey.trim());
  const makerRuntimeBlocked =
    isMakerMode && settings.translationProviderName === "localMt" && !isDesktopRuntime;
  const makerRuntimeBlockedMessage =
    "Local MT 책 번역은 데스크톱 앱에서만 지원됩니다. 로컬 웹에서는 Ollama LLM, Gemini, Google 번역을 선택하거나 Electron 앱을 실행해 주세요.";
  const translatedPageCount = Object.values(pageTranslations).filter(
    (pageState) => pageState.translations.length > 0
  ).length;
  const translatedSegmentCount = Object.values(pageTranslations).reduce(
    (sum, pageState) => sum + pageState.translations.length,
    0
  );
  const {
    canShowMakerDone,
    displayedProgressPercent,
    documentJobProgressPercent,
    failedPageCount,
    failedPageList,
    failedPageNumbers,
    isMakerBusy,
    isMakerJobActive,
    latestExportRecord,
    makerFreeTierLimitBlocked,
    makerMonthlyLimitBlocked,
    makerStartBlocked,
    selectedRangePageCount,
    shouldKeepMakerAlive
  } = getPdfReaderWorkflowState({
    currentPage,
    documentJob,
    exportRecords,
    isDownloadingModel,
    isExporting,
    isMakerMode,
    isOpening,
    isTranslating,
    makerRuntimeBlocked,
    makerUsageEstimate,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw,
    pageCount,
    pageRangeInput,
    pageTranslationFailures,
    pdfDocumentLoaded: Boolean(pdfDocument),
    stopOnFreeTierLimit: settings.stopOnFreeTierLimit,
    stopOnMonthlyLimit: settings.stopOnMonthlyLimit,
    translatedPageCount
  });

  function togglePdfSourceHighlights() {
    onSettingsChange({
      ...settings,
      showPdfSourceHighlights: !settings.showPdfSourceHighlights
    });
  }

  const getLiveSelectionSnapshot = useCallback(() => {
    if (isMakerMode) {
      return null;
    }

    const activeSelection = window.getSelection();
    const textLayer = textLayerRef.current;
    const selectedText = activeSelection?.toString().trim() ?? "";
    if (!activeSelection || activeSelection.rangeCount === 0 || !selectedText || !textLayer) {
      return null;
    }

    const range = activeSelection.getRangeAt(0);
    if (!textLayer.contains(range.commonAncestorContainer)) {
      return null;
    }

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(textLayer);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    return {
      selectedText,
      fullText: pageText || textLayer.innerText,
      selectionOffset: preSelectionRange.toString().length
    };
  }, [isMakerMode, pageText]);
  const getLiveCardExtraction = useCallback(() => {
    const snapshot = getLiveSelectionSnapshot();
    if (!snapshot) {
      return null;
    }
    return extractSentenceContext({
      fullText: snapshot.fullText,
      selectedText: snapshot.selectedText,
      selectionOffset: snapshot.selectionOffset
    });
  }, [getLiveSelectionSnapshot]);
  const buildLiveCardUsageEstimate = useCallback(
    (extraction: ReturnType<typeof extractSentenceContext>) =>
      estimatePdfLiveCardUsage(extraction, settings),
    [settings]
  );
  const refreshLiveCardUsageEstimate = useCallback(() => {
    const extraction = getLiveCardExtraction();
    setLiveCardUsageEstimate(extraction ? buildLiveCardUsageEstimate(extraction) : null);
  }, [buildLiveCardUsageEstimate, getLiveCardExtraction]);

  const createLiveCardFromSelection = useCallback(async () => {
    if (!provider || isGeneratingLiveCard) {
      return;
    }

    const extraction = getLiveCardExtraction();
    if (!extraction) {
      setLiveCardStatus("Select text in the PDF page first.");
      setLiveCardUsageEstimate(null);
      return;
    }

    setLiveCardUsageEstimate(buildLiveCardUsageEstimate(extraction));
    setIsGeneratingLiveCard(true);
    setLiveCardStatus("Making sentence card...");
    try {
      const generated = await provider.generateReadingCard(
        createPdfLiveCardRequest(extraction, settings.learningProfile)
      );
      setLiveCardCandidate(createStudyCardFromGenerated(generated));
      setLiveCardStatus(`Sentence extracted: ${extraction.extractionConfidence}`);
    } catch (caught) {
      setLiveCardStatus(caught instanceof Error ? caught.message : "Could not create a card.");
    } finally {
      setIsGeneratingLiveCard(false);
    }
  }, [
    buildLiveCardUsageEstimate,
    getLiveCardExtraction,
    isGeneratingLiveCard,
    provider,
    settings.learningProfile
  ]);

  useEffect(() => {
    setLiveCardUsageEstimate(null);
  }, [currentPage, pageText]);

  useEffect(() => {
    if (isMakerMode || !provider) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!matchesShortcut(event, settings.captureShortcut)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!getLiveSelectionSnapshot()) {
        return;
      }
      event.preventDefault();
      void createLiveCardFromSelection();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createLiveCardFromSelection,
    getLiveSelectionSnapshot,
    isMakerMode,
    provider,
    settings.captureShortcut
  ]);

  async function saveLiveCardCandidate() {
    if (!liveCardCandidate) {
      return;
    }

    const saved = await api.cards.save(liveCardCandidate);
    setLiveCardCandidate(saved);
    setLiveCardStatus("Card saved.");
    await onCardsChanged?.();
  }

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    onMakerKeepAliveChange?.(shouldKeepMakerAlive);
  }, [isMakerMode, onMakerKeepAliveChange, shouldKeepMakerAlive]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    return () => {
      onMakerKeepAliveChange?.(false);
    };
  }, [isMakerMode, onMakerKeepAliveChange]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    let cancelled = false;
    api.documents
      .listExportRecords()
      .then((records) => {
        if (!cancelled) {
          setExportRecords(records.slice(0, 5));
        }
      })
      .catch(() => {
        // Export history is convenience UI; loading failures should not block the maker.
      });

    return () => {
      cancelled = true;
    };
  }, [api, isMakerMode]);

  useEffect(() => {
    if (!isMakerMode || !api.qa?.heartbeat) {
      return;
    }

    void api.qa.heartbeat({
      fileName,
      pageRange: pageRangeInput,
      pageCount,
      translatedPageCount,
      translatedSegmentCount,
      failedPageNumbers,
      error,
      isTranslating,
      isExporting,
      isDownloadingModel,
      documentJob,
      latestExportRecord: latestExportRecord
        ? {
            filePath: latestExportRecord.filePath,
            pageCount: latestExportRecord.pageCount,
            segmentCount: latestExportRecord.segmentCount,
            providerLabel: latestExportRecord.providerLabel
          }
        : undefined
    });
  }, [
    api,
    documentJob,
    error,
    failedPageList,
    fileName,
    isDownloadingModel,
    isExporting,
    isMakerMode,
    isTranslating,
    latestExportRecord,
    pageCount,
    pageRangeInput,
    translatedPageCount,
    translatedSegmentCount
  ]);

  function updateDocumentJob(jobId: string, patch: Partial<DocumentTranslationJob>) {
    setDocumentJob((previous) => {
      if (!previous || previous.id !== jobId) {
        return previous;
      }

      return {
        ...previous,
        ...patch,
        updatedAt: new Date().toLocaleString()
      };
    });
  }

  function setRangeToCurrentPage() {
    setPageRangeInput(String(currentPage));
  }

  function setRangeToAllPages() {
    if (!pageCount) {
      return;
    }

    setPageRangeInput(`1-${pageCount}`);
  }

  function setRangeToUntranslatedPages() {
    const pageNumbers = getUntranslatedPageNumbers(pageCount, pageTranslations);
    setPageRangeInput(pageNumbers.length ? pageNumbers.join(", ") : String(currentPage));
  }

  function hasCompletePageTranslation(pageNumber: number, segments: PdfTextSegment[]) {
    return hasCompleteCachedPageTranslation(
      pageTranslations[pageNumber],
      segments,
      bypassTranslationCache
    );
  }

  function clearPageTranslationFailure(pageNumber: number) {
    setPageTranslationFailures((previous) => {
      if (!previous[pageNumber]) {
        return previous;
      }

      const nextFailures = { ...previous };
      delete nextFailures[pageNumber];
      return nextFailures;
    });
  }

  function recordPageTranslationFailure(
    pageNumber: number,
    message: string,
    segmentCount: number
  ) {
    setPageTranslationFailures((previous) => ({
      ...previous,
      [pageNumber]: {
        pageNumber,
        message,
        segmentCount,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  function clearPageTranslationFailures(pageNumbers: number[]) {
    if (pageNumbers.length === 0) {
      return;
    }

    setPageTranslationFailures((previous) => {
      const nextFailures = { ...previous };
      pageNumbers.forEach((pageNumber) => {
        delete nextFailures[pageNumber];
      });
      return nextFailures;
    });
  }

  function resetPdfReaderForOpen(nextFileName: string) {
    setFileName(nextFileName);
    setError("");
    setViewerStatus("PDF 여는 중...");
    setTranslationStatus("");
    setPageText("");
    setPageSegments([]);
    setSegmentTranslations([]);
    setPageTranslations({});
    setPageTranslationFailures({});
    setPageRangeInput("1");
    setRangeProgress(null);
    setCacheStatus("idle");
    setExportRecords([]);
    setDocumentJob(null);
    setShowLayoutHighlights(false);
    setShowLayoutPreview(false);
    setLayoutPreviewHtml("");
    setLayoutPreviewStatus("");
    setMakerUsageEstimate(null);
    setMakerUsageStatus("");
    setPdfDocument(null);
    setSourcePdfData(null);
    setSourcePdfFilePath("");
    setPageCount(0);
    setCurrentPage(1);
    clearPageDataCache();
  }

  function resetPdfReaderToEmpty() {
    resetPdfReaderForOpen("");
    setViewerStatus("");
  }

  async function openPdfArrayBuffer(data: ArrayBuffer, sourcePath = "") {
    const sourceBytes = new Uint8Array(data.byteLength);
    sourceBytes.set(new Uint8Array(data));
    const document = await loadPdfDocument(data);
    setPdfDocument(document);
    setSourcePdfData(sourceBytes);
    setSourcePdfFilePath(sourcePath);
    setPageCount(document.numPages);
    setPageRangeInput(isMakerMode ? `1-${document.numPages}` : "1");
    setViewerStatus("");
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setIsOpening(true);
    resetPdfReaderForOpen(file.name);
    try {
      const data = await file.arrayBuffer();
      await openPdfArrayBuffer(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF를 열 수 없습니다.");
      setViewerStatus("");
    } finally {
      setIsOpening(false);
    }
  }

  useEffect(() => {
    if (!settings.debugMode || pdfDocument || isOpening) {
      return;
    }

    const debugPdfPath = settings.debugPdfPath.trim();
    if (!debugPdfPath || debugPdfLoadKeyRef.current === debugPdfPath) {
      return;
    }

    let cancelled = false;
    debugPdfLoadKeyRef.current = debugPdfPath;
    setIsOpening(true);
    resetPdfReaderForOpen("디버그 PDF");
    setViewerStatus("디버그 PDF 여는 중...");

    async function loadDebugPdf() {
      try {
        const result = await api.documents.readPdfFile(debugPdfPath);
        if (cancelled) {
          return;
        }

        if (!result) {
          setError("디버그 PDF 자동 로드는 Electron 앱에서만 사용할 수 있습니다.");
          setViewerStatus("");
          return;
        }

        setFileName(result.fileName);
        await openPdfArrayBuffer(arrayBufferFromPdfFileData(result.data), result.filePath);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "디버그 PDF를 열 수 없습니다.");
          setViewerStatus("");
        }
      } finally {
        if (!cancelled) {
          setIsOpening(false);
        }
      }
    }

    void loadDebugPdf();

    return () => {
      cancelled = true;
    };
  }, [api, isOpening, pdfDocument, settings.debugMode, settings.debugPdfPath]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    if (!pdfDocument) {
      setMakerUsageEstimate(null);
      setMakerUsageStatus("PDF를 선택하면 예상 토큰과 비용을 계산합니다.");
      return;
    }

    let cancelled = false;

    async function refreshMakerEstimate() {
      const pageNumbers = parsePageRange({
        value: pageRangeInput,
        pageCount,
        fallbackPage: currentPage
      });
      if (pageNumbers.length === 0) {
        setMakerUsageEstimate(null);
        setMakerUsageStatus("페이지 범위를 확인해 주세요.");
        return;
      }

      setMakerUsageStatus("예상 사용량 계산 중...");
      try {
        const pageDataList: ExtractedPdfPageData[] = [];
        for (const pageNumber of pageNumbers) {
          pageDataList.push(await readPageData(pageNumber));
        }
        const segments = pageDataList.flatMap((pageData) =>
          getTranslationSegmentsForExportMode(pageData.segments, settings.pdfExportMode)
        );
        const translationContext = buildTranslationContextForSegments(segments);
        const cacheEntries = bypassTranslationCache
          ? []
          : await Promise.all(
              segments.map((segment) =>
                api.translations.getCached({
                  ...createPdfTranslationCacheLookupInput({
                    segment,
                    settings,
                    selectedTranslationModel,
                    contextHash: translationContext.contextHash
                  })
                })
              )
            );

        if (cancelled) {
          return;
        }

        const estimate = estimateTranslationUsage({
          texts: segments.map((segment, index) => ({
            text: segment.text,
            cacheStatus: cacheEntries[index] ? "hit" : "miss"
          })),
          providerName: settings.translationProviderName,
          model: selectedTranslationModel,
          plan: settings.geminiPlan,
          sourceLang: settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code,
          dailyAppTokenLimit: settings.dailyAppTokenLimit,
          monthlySpendLimitKrw: settings.monthlySpendLimitKrw
        });
        setMakerUsageEstimate(estimate);
        setMakerUsageStatus(`${segments.length}개 세그먼트 기준 예상치입니다.`);
      } catch (caught) {
        if (!cancelled) {
          setMakerUsageEstimate(null);
          setMakerUsageStatus(
            caught instanceof Error ? caught.message : "예상 사용량을 계산하지 못했습니다."
          );
        }
      }
    }

    void refreshMakerEstimate();

    return () => {
      cancelled = true;
    };
  }, [
    api,
    bypassTranslationCache,
    currentPage,
    isMakerMode,
    pageCount,
    pageRangeInput,
    pdfDocument,
    readPageData,
    selectedTranslationModel,
    settings.dailyAppTokenLimit,
    settings.geminiPlan,
    settings.learningProfile,
    settings.monthlySpendLimitKrw,
    settings.pdfExportMode,
    settings.translationProviderName
  ]);

  const readCurrentPageText = useCallback(
    () => readPageText(currentPage),
    [currentPage, readPageText]
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!pageCount) {
        return;
      }
      const boundedPage = Math.max(1, Math.min(pageCount, nextPage));
      setCurrentPage(boundedPage);
    },
    [pageCount]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!pageCount || isEditableTarget(event.target) || !isPageNavigationShortcut(event)) {
        return;
      }

      event.preventDefault();
      goToPage(currentPage + getPageNavigationDelta(event));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, goToPage, pageCount]);

  async function translateCurrentPage() {
    setError("");
    setPendingModelDownload(null);
    setPendingOllamaSetup(null);

    if (googleKeyMissing) {
      setError("Settings에서 선택한 번역 API key를 입력해 주세요.");
      return;
    }

    setIsTranslating(true);
    setTranslationStatus("번역 중...");

    try {
      const text = pageText || (await readCurrentPageText());
      const sourceSegments = pageSegments.length
        ? pageSegments
        : await readPageSegments(currentPage);
      const segments = getTranslationSegmentsForExportMode(sourceSegments, settings.pdfExportMode);
      if (!text || sourceSegments.length === 0) {
        throw new Error("현재 페이지에서 번역할 텍스트를 찾지 못했습니다.");
      }
      if (segments.length === 0) {
        throw new Error("논문 모드에서 현재 페이지의 표/수식형 세그먼트는 원문으로 보존됩니다.");
      }

      if (settings.translationProviderName === "local") {
        setTranslationStatus("번역 모델 확인 중...");
        const modelStatus = await api.translations.getOllamaModelStatus({
          baseUrl: settings.ollamaBaseUrl,
          model: settings.ollamaModel
        });
        if (!modelStatus.installed) {
          setPendingModelDownload({
            segments,
            model: modelStatus.model,
            baseUrl: modelStatus.baseUrl
          });
          setTranslationStatus("번역모델이 없습니다.");
          return;
        }
      }

      await translateSegments(segments, currentPage);
    } catch (caught) {
      handleTranslationFailure(caught);
      setTranslationStatus("");
    } finally {
      setIsTranslating(false);
    }
  }

  async function downloadMissingModelAndTranslate() {
    if (!pendingModelDownload) {
      return;
    }

    setError("");
    setIsDownloadingModel(true);
    setIsTranslating(true);
    setTranslationStatus(`${pendingModelDownload.model} 다운로드 중...`);

    try {
      await api.translations.pullOllamaModel({
        baseUrl: pendingModelDownload.baseUrl,
        model: pendingModelDownload.model
      });
      const segments = pendingModelDownload.segments;
      const pageNumbers = pendingModelDownload.pageNumbers;
      const continueAction = pendingModelDownload.continueAction;
      setPendingModelDownload(null);
      setTranslationStatus("다운로드 완료. 번역 중...");
      if (pageNumbers?.length) {
        const result = await translatePageRange(pageNumbers, { skipModelCheck: true });
        if (continueAction === "translateAndExport" && result && !result.blocked) {
          const exportTranslationsByPage = mergePageTranslationStates(
            bypassTranslationCache ? {} : pageTranslations,
            result.translationsByPage
          );
          const incompletePageNumbers = await getIncompleteExportPageNumbers(
            pageNumbers,
            exportTranslationsByPage
          );
          if (incompletePageNumbers.length > 0) {
            const message = `아직 번역되지 않은 페이지가 있어 PDF를 저장하지 않았습니다: ${formatPageList(
              incompletePageNumbers
            )}`;
            setError(message);
            updateDocumentJob(result.jobId, {
              status: "partial",
              pageRange: pageNumbers.join(", "),
              totalPages: pageNumbers.length,
              processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
              failedPages: incompletePageNumbers.length,
              message
            });
            return;
          }
          await exportBilingualPdf({
            pageNumbers,
            translationsByPage: exportTranslationsByPage,
            jobId: result.jobId
          });
        }
      } else if (segments?.length) {
        await translateSegments(segments, currentPage);
      }
    } catch (caught) {
      handleTranslationFailure(caught, "모델 다운로드에 실패했습니다.");
      setTranslationStatus("");
    } finally {
      setIsDownloadingModel(false);
      setIsTranslating(false);
    }
  }

  function dismissModelDownloadPrompt() {
    if (isDownloadingModel) {
      return;
    }
    setPendingModelDownload(null);
    setTranslationStatus("");
  }

  function dismissOllamaSetupPrompt() {
    setPendingOllamaSetup(null);
    setTranslationStatus("");
  }

  function handleTranslationFailure(caught: unknown, fallback = "번역에 실패했습니다.") {
    const message = caught instanceof Error ? caught.message : fallback;
    if (settings.translationProviderName === "local" && isOllamaConnectionError(message)) {
      setPendingModelDownload(null);
      setPendingOllamaSetup({
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        message
      });
      setError("");
      setTranslationStatus("Ollama 설치 또는 실행이 필요합니다.");
      return;
    }

    setError(message);
  }

  function buildTranslationContextForSegments(segments: PdfTextSegment[]) {
    return buildPdfReaderTranslationContext(segments, settings);
  }

  async function requestBrowserTranslateSegments(
    segments: PdfTextSegment[],
    translationContext: PdfTranslationContext
  ): Promise<TranslatePdfSegmentsResult> {
    const now = new Date().toISOString();
    const sourceLang = normalizeBrowserTranslatorLanguage(
      settings.learningProfile.targetLanguage.code,
      "en"
    );
    const targetLang = normalizeBrowserTranslatorLanguage(
      settings.learningProfile.nativeLanguage.code,
      "ko"
    );
    const cachedEntries = bypassTranslationCache
      ? []
      : await Promise.all(
          segments.map((segment) =>
            api.translations.getCached({
              ...createPdfTranslationCacheLookupInput({
                segment,
                settings,
                selectedTranslationModel,
                contextHash: translationContext.contextHash,
                providerName: "browser",
                sourceLang,
                targetLang
              })
            })
          )
        );
    const cachedTranslations = cachedEntries.flatMap((entry, index) =>
      entry
        ? [
            {
              id: segments[index].id,
              translationKo: entry.translatedText,
              cacheStatus: "hit" as const
            }
          ]
        : []
    );
    const cachedIds = new Set(cachedTranslations.map((translation) => translation.id));
    const missingSegments = segments.filter((segment) => !cachedIds.has(segment.id));
    const translatedMisses = missingSegments.length
      ? await translatePdfSegmentsWithBrowserTranslator({
          segments: missingSegments,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          onStatus: setTranslationStatus
        })
      : [];
    if (translatedMisses.length > 0) {
      const translatedMissesById = new Map(
        translatedMisses.map((translation) => [translation.id, translation])
      );
      await Promise.all(
        missingSegments.flatMap((segment) => {
          const translation = translatedMissesById.get(segment.id);
          if (!translation?.translationKo.trim()) {
            return [];
          }

          return api.translations.saveCached({
            ...createPdfTranslationCacheLookupInput({
              segment,
              settings,
              selectedTranslationModel,
              contextHash: translationContext.contextHash,
              providerName: "browser",
              sourceLang,
              targetLang
            }),
            translatedText: translation.translationKo
          });
        })
      );
    }
    const translations = mergeSegmentTranslations(segments, cachedTranslations, translatedMisses);
    const translatedIds = new Set(translations.map((translation) => translation.id));
    const usageEstimate = missingSegments.length
      ? estimateTranslationUsage({
          texts: segments.map((segment) => ({
            text: segment.text,
            cacheStatus: cachedIds.has(segment.id) ? "hit" : "miss"
          })),
          providerName: "browser",
          model: "browser-translator",
          sourceLang,
          targetLang,
          dailyAppTokenLimit: settings.dailyAppTokenLimit,
          monthlySpendLimitKrw: settings.monthlySpendLimitKrw
        })
      : null;

    return {
      translations,
      providerName: "browser",
      sourceLang,
      targetLang,
      cacheStatus:
        !bypassTranslationCache && translatedMisses.length === 0
          ? "hit"
          : cachedTranslations.length > 0
            ? "partial"
            : "miss",
      missingSegmentIds: segments
        .map((segment) => segment.id)
        .filter((segmentId) => !translatedIds.has(segmentId)),
      usage: usageEstimate
        ? createTranslationUsageEvent({
            profileId: settings.profileId,
            providerName: "browser",
            model: usageEstimate.model,
            sourceLang,
            targetLang,
            usage: {
              inputTokens: usageEstimate.inputTokens.max,
              outputTokens: usageEstimate.outputTokens.max,
              totalTokens: usageEstimate.totalTokens.max,
              billableCharacters: usageEstimate.billableCharacters,
              requestCount: usageEstimate.requestCount,
              cacheHitCount: usageEstimate.cacheHitCount,
              cacheMissCount: usageEstimate.cacheMissCount
            }
          })
        : undefined,
      createdAt: now,
      updatedAt: new Date().toISOString()
    };
  }

  async function requestTranslateSegments(
    segments: PdfTextSegment[],
    translationContext: PdfTranslationContext
  ) {
    if (settings.translationProviderName === "localMt" && !isDesktopRuntime) {
      throw new Error(makerRuntimeBlockedMessage);
    }

    if (settings.translationProviderName === "browser") {
      const result = await requestBrowserTranslateSegments(segments, translationContext);
      recordTranslationUsageEvent(result.usage);
      return result;
    }

    if (settings.translationProviderName === "localMt") {
      setTranslationStatus(`Local MT loading/translating with ${selectedTranslationModel}...`);
    }

    const result = await api.translations.translatePdfSegments(
      createPdfSegmentTranslationRequest({
        segments,
        translationContext,
        settings,
        selectedTranslationModel,
        bypassTranslationCache
      })
    );
    return result;
  }

  async function translateSegments(
    segments: PdfTextSegment[],
    pageNumber: number,
    translationContext = buildTranslationContextForSegments(segments)
  ) {
    let result = await requestTranslateSegments(segments, translationContext);
    if (result.missingSegmentIds.length > 0) {
      const missingIds = new Set(result.missingSegmentIds);
      const missingSegments = segments.filter((segment) => missingIds.has(segment.id));
      if (missingSegments.length > 0) {
        setTranslationStatus(
          `페이지 ${pageNumber} 누락 세그먼트 ${missingSegments.length}개 재번역 중...`
        );
        const retryResult = await requestTranslateSegments(missingSegments, translationContext);
        const translations = mergeSegmentTranslations(
          segments,
          result.translations,
          retryResult.translations
        );
        const translatedIds = new Set(translations.map((translation) => translation.id));
        result = {
          ...result,
          translations,
          cacheStatus: getMergedCacheStatus(translations, segments.length),
          missingSegmentIds: segments
            .map((segment) => segment.id)
            .filter((segmentId) => !translatedIds.has(segmentId)),
          updatedAt: retryResult.updatedAt
        };
      }
    }
    const pageState: PageTranslationState = {
      segments,
      translations: result.translations,
      cacheStatus: result.cacheStatus
    };
    setPageTranslations((previous) => ({
      ...previous,
      [pageNumber]: pageState
    }));
    clearPageTranslationFailure(pageNumber);
    if (pageNumber === currentPage) {
      setPageSegments(segments);
      setSegmentTranslations(result.translations);
      setCacheStatus(result.cacheStatus === "partial" ? "miss" : result.cacheStatus);
    }
    return {
      ...result,
      pageState
    };
  }

  async function translatePageRange(
    pageNumbers: number[],
    options: TranslatePageRangeOptions = {}
  ): Promise<RangeTranslationResult | undefined> {
    if (!pdfDocument) {
      return undefined;
    }

    setError("");
    setPendingModelDownload(null);
    setPendingOllamaSetup(null);
    const jobId = `translate-${Date.now()}`;
    const jobPageRange = pageNumbers.join(", ");
    setDocumentJob({
      id: jobId,
      status: "checking",
      pageRange: jobPageRange,
      totalPages: pageNumbers.length,
      processedPages: 0,
      translatedSegments: 0,
      totalSegments: 0,
      failedPages: 0,
      message: "번역 작업 준비 중...",
      updatedAt: new Date().toLocaleString()
    });

    if (googleKeyMissing) {
      setError("Settings에서 선택한 번역 API key를 입력해 주세요.");
      updateDocumentJob(jobId, {
        status: "failed",
        message: "번역 API key가 필요합니다."
      });
      return undefined;
    }

    if (settings.translationProviderName === "local" && !options.skipModelCheck) {
      setTranslationStatus("번역 모델 확인 중...");
      updateDocumentJob(jobId, {
        status: "checking",
        message: `${settings.ollamaModel} 모델 설치 여부 확인 중...`
      });
      const modelStatus = await api.translations.getOllamaModelStatus({
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel
      });
      if (!modelStatus.installed) {
        setPendingModelDownload({
          pageNumbers,
          continueAction: options.afterModelDownload,
          model: modelStatus.model,
          baseUrl: modelStatus.baseUrl
        });
        setTranslationStatus("번역모델이 없습니다.");
        updateDocumentJob(jobId, {
          status: "blocked",
          message: `${modelStatus.model} 모델 다운로드가 필요합니다.`
        });
        return undefined;
      }
    }

    setIsTranslating(true);
    updateDocumentJob(jobId, {
      status: "translating",
      message: "선택한 범위 번역 중..."
    });
    setRangeProgress({
      current: 0,
      total: pageNumbers.length,
      pageNumber: pageNumbers[0] ?? currentPage,
      translatedSegments: 0,
      totalSegments: 0
    });
    clearPageTranslationFailures(pageNumbers);

    let completedPageCount = 0;
    let failedCount = 0;
    const failedPageNumbersInRun: number[] = [];
    let jobTranslatedSegments = 0;
    let jobTotalSegments = 0;
    let stoppedForConnectionError = false;
    const translationsByPage: Record<number, PageTranslationState> = {};

    try {
      const rangePageData = new Map<number, ExtractedPdfPageData>();
      const pageDataFailures = new Map<number, string>();
      for (const pageNumber of pageNumbers) {
        try {
          rangePageData.set(pageNumber, await readPageData(pageNumber));
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : `페이지 ${pageNumber} 텍스트 추출에 실패했습니다.`;
          pageDataFailures.set(pageNumber, message);
          recordPageTranslationFailure(pageNumber, message, 0);
          failedCount += 1;
          failedPageNumbersInRun.push(pageNumber);
        }
      }
      const rangeTranslationContext = buildTranslationContextForSegments(
        [...rangePageData.values()].flatMap((pageData) =>
          getTranslationSegmentsForExportMode(pageData.segments, settings.pdfExportMode)
        )
      );

      for (const [pageIndex, pageNumber] of pageNumbers.entries()) {
        setTranslationStatus(`페이지 ${pageNumber} 세그먼트 확인 중...`);
        const pageDataFailure = pageDataFailures.get(pageNumber);
        if (pageDataFailure) {
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: 0
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message: pageDataFailure
          });
          continue;
        }
        try {
          const { segments: sourceSegments } =
            rangePageData.get(pageNumber) ?? (await readPageData(pageNumber));
          const segments = getTranslationSegmentsForExportMode(
            sourceSegments,
            settings.pdfExportMode
          );
          jobTotalSegments += segments.length;
          setRangeProgress({
            current: pageIndex,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: segments.length
          });

          if (segments.length === 0) {
            completedPageCount += 1;
            updateDocumentJob(jobId, {
              processedPages: pageIndex + 1,
              totalSegments: jobTotalSegments,
              translatedSegments: jobTranslatedSegments,
              failedPages: failedCount,
              message: `페이지 ${pageNumber}에는 번역할 세그먼트가 없습니다.`
            });
            continue;
          }

          if (hasCompletePageTranslation(pageNumber, segments)) {
            const existingPageState = pageTranslations[pageNumber];
            const existingTranslations = existingPageState?.translations.length ?? 0;
            if (existingPageState) {
              translationsByPage[pageNumber] = existingPageState;
            }
            jobTranslatedSegments += existingTranslations;
            completedPageCount += 1;
            setRangeProgress({
              current: pageIndex + 1,
              total: pageNumbers.length,
              pageNumber,
              translatedSegments: existingTranslations,
              totalSegments: segments.length
            });
            updateDocumentJob(jobId, {
              processedPages: pageIndex + 1,
              totalSegments: jobTotalSegments,
              translatedSegments: jobTranslatedSegments,
              failedPages: failedCount,
              message: `페이지 ${pageNumber} 캐시/기존 번역을 사용했습니다.`
            });
            continue;
          }

          const result = await translateSegments(segments, pageNumber, rangeTranslationContext);
          translationsByPage[pageNumber] = result.pageState;
          jobTranslatedSegments += result.translations.length;
          if (result.missingSegmentIds.length > 0) {
            recordPageTranslationFailure(
              pageNumber,
              `${result.missingSegmentIds.length}개 세그먼트가 누락됐습니다.`,
              segments.length
            );
            failedCount += 1;
            failedPageNumbersInRun.push(pageNumber);
          } else {
            completedPageCount += 1;
          }
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: result.translations.length,
            totalSegments: segments.length
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message:
              result.missingSegmentIds.length > 0
                ? `페이지 ${pageNumber} 일부 세그먼트가 누락됐습니다.`
                : `페이지 ${pageNumber} 번역 완료.`
          });
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "페이지 번역에 실패했습니다.";
          recordPageTranslationFailure(pageNumber, message, 0);
          failedCount += 1;
          failedPageNumbersInRun.push(pageNumber);
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: 0
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message
          });

          if (settings.translationProviderName === "local" && isOllamaConnectionError(message)) {
            handleTranslationFailure(caught);
            updateDocumentJob(jobId, {
              status: "blocked",
              message: "Ollama 연결이 필요합니다."
            });
            stoppedForConnectionError = true;
            break;
          }
        }
      }

      const rangeResult: RangeTranslationResult = {
        jobId,
        pageNumbers,
        failedPageNumbers: [...new Set(failedPageNumbersInRun)],
        translationsByPage,
        completedPages: completedPageCount,
        failedPages: failedCount,
        translatedSegments: jobTranslatedSegments,
        totalSegments: jobTotalSegments,
        blocked: stoppedForConnectionError
      };

      if (!stoppedForConnectionError) {
        setTranslationStatus(
          failedCount > 0
            ? `${completedPageCount}개 페이지 완료, ${failedCount}개 페이지 실패`
            : `${completedPageCount}개 페이지 범위 번역을 완료했습니다.`
        );
        updateDocumentJob(jobId, {
          status: failedCount > 0 ? "partial" : "completed",
          processedPages: pageNumbers.length,
          totalSegments: jobTotalSegments,
          translatedSegments: jobTranslatedSegments,
          failedPages: failedCount,
          message:
            failedCount > 0
              ? `${completedPageCount}개 페이지 완료, ${failedCount}개 페이지 실패`
              : `${completedPageCount}개 페이지 번역 완료.`
        });
      }

      return rangeResult;
    } catch (caught) {
      handleTranslationFailure(caught);
      setTranslationStatus("");
      updateDocumentJob(jobId, {
        status: "failed",
        message: caught instanceof Error ? caught.message : "범위 번역에 실패했습니다."
      });
      return undefined;
    } finally {
      setIsTranslating(false);
    }
  }

  async function translateSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    await translatePageRange(pageNumbers);
  }

  async function retryFailedPages() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (failedPageNumbers.length === 0) {
      return;
    }

    await translatePageRange(failedPageNumbers);
  }

  async function retryFailedPagesAndExportSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (failedPageNumbers.length === 0) {
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const retryResult = await translatePageRange(failedPageNumbers, {
      skipModelCheck: true,
      afterModelDownload: "translateAndExport"
    });
    if (!retryResult || retryResult.blocked) {
      return;
    }

    const exportTranslationsByPage = mergePageTranslationStates(
      bypassTranslationCache ? {} : pageTranslations,
      retryResult.translationsByPage
    );
    const incompletePageNumbers = await getIncompleteExportPageNumbers(
      pageNumbers,
      exportTranslationsByPage
    );

    if (incompletePageNumbers.length > 0) {
      const message = `아직 번역되지 않은 페이지가 있어 PDF를 저장하지 않았습니다: ${formatPageList(
        incompletePageNumbers
      )}`;
      setError(message);
      updateDocumentJob(retryResult.jobId, {
        status: "partial",
        pageRange: pageNumbers.join(", "),
        totalPages: pageNumbers.length,
        processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
        failedPages: incompletePageNumbers.length,
        message
      });
      return;
    }

    await exportBilingualPdf({
      pageNumbers,
      translationsByPage: exportTranslationsByPage,
      jobId: retryResult.jobId
    });
  }

  async function getIncompleteExportPageNumbers(
    pageNumbers: number[],
    translationsByPage: Record<number, PageTranslationState>
  ) {
    const incompletePageNumbers: number[] = [];

    for (const pageNumber of pageNumbers) {
      let sourceSegments: PdfTextSegment[];
      try {
        sourceSegments = (await readPageData(pageNumber)).segments;
      } catch (caught) {
        recordPageTranslationFailure(
          pageNumber,
          caught instanceof Error ? caught.message : `페이지 ${pageNumber} 텍스트 추출에 실패했습니다.`,
          0
        );
        incompletePageNumbers.push(pageNumber);
        continue;
      }
      const exportSegments = getTranslationSegmentsForExportMode(
        sourceSegments,
        settings.pdfExportMode
      );
      if (exportSegments.length === 0) {
        continue;
      }

      const pageState =
        translationsByPage[pageNumber] ?? (bypassTranslationCache ? undefined : pageTranslations[pageNumber]);
      const translatedIds = new Set(
        pageState?.translations
          .filter((translation) => translation.translationKo.trim())
          .map((translation) => translation.id) ?? []
      );
      const missingCount = exportSegments.filter((segment) => !translatedIds.has(segment.id)).length;
      if (missingCount > 0) {
        incompletePageNumbers.push(pageNumber);
      }
    }

    return incompletePageNumbers;
  }

  async function previewCurrentPageLayout() {
    if (!pdfDocument) {
      setError("PDF가 열려 있지 않습니다.");
      return;
    }

    setIsBuildingLayoutPreview(true);
    setShowLayoutPreview(true);
    setLayoutPreviewStatus("현재 페이지 조판 미리보기 생성 중...");
    setLayoutPreviewHtml("");
    setError("");

    try {
      const previewTranslationsByPage: Record<number, PageTranslationState> = {
        ...pageTranslations,
        [currentPage]: {
          segments: pageSegments,
          translations: segmentTranslations,
          cacheStatus:
            segmentTranslations.length === pageSegments.length
              ? cacheStatus === "hit"
                ? "hit"
                : "miss"
              : "partial"
        }
      };
      const prepared = await prepareBilingualExportPage({
        pageNumber: currentPage,
        translationsByPage: previewTranslationsByPage,
        readPageData,
        renderPageImage: (pageNumber) => renderPdfPageImage(pdfDocument, pageNumber),
        exportMode: settings.pdfExportMode
      });
      if (prepared.translatedSegmentCount === 0) {
        setLayoutPreviewStatus("현재 페이지에 미리보기로 표시할 번역 결과가 없습니다. 먼저 현재 페이지를 번역해 주세요.");
        return;
      }

      const html = buildBilingualDocumentHtml({
        title: fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-preview",
        sourceLanguageLabel: settings.learningProfile.targetLanguage.nameKo,
        targetLanguageLabel: settings.learningProfile.nativeLanguage.nameKo,
        exportMode: settings.pdfExportMode,
        showSourceHighlights: settings.showPdfSourceHighlights,
        pages: [prepared.page]
      });
      setLayoutPreviewHtml(html);
      setLayoutPreviewStatus(
        `${prepared.translatedSegmentCount}/${prepared.sourceSegmentCount}개 세그먼트를 export와 같은 조판으로 미리보기 중입니다.`
      );
    } catch (caught) {
      setLayoutPreviewStatus("");
      setError(caught instanceof Error ? caught.message : "조판 미리보기를 만들지 못했습니다.");
    } finally {
      setIsBuildingLayoutPreview(false);
    }
  }

  async function translateAndExportSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (makerStartBlocked) {
      setError("예상 사용량이 설정한 한도를 넘습니다. 페이지 범위나 사용량 설정을 확인해 주세요.");
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const result = await translatePageRange(pageNumbers, {
      afterModelDownload: "translateAndExport"
    });
    if (!result || result.blocked) {
      return;
    }

    let jobId = result.jobId;
    let exportTranslationsByPage = mergePageTranslationStates(
      bypassTranslationCache ? {} : pageTranslations,
      result.translationsByPage
    );
    let incompletePageNumbers = await getIncompleteExportPageNumbers(
      pageNumbers,
      exportTranslationsByPage
    );

    if (incompletePageNumbers.length > 0) {
      updateDocumentJob(jobId, {
        status: "translating",
        totalPages: pageNumbers.length,
        pageRange: pageNumbers.join(", "),
        message: `${formatPageList(incompletePageNumbers)} 페이지를 자동으로 한 번 더 번역합니다.`
      });
      const retryResult = await translatePageRange(incompletePageNumbers, {
        skipModelCheck: true,
        afterModelDownload: "translateAndExport"
      });
      if (!retryResult || retryResult.blocked) {
        return;
      }
      jobId = retryResult.jobId;
      exportTranslationsByPage = mergePageTranslationStates(
        exportTranslationsByPage,
        retryResult.translationsByPage
      );
      incompletePageNumbers = await getIncompleteExportPageNumbers(
        pageNumbers,
        exportTranslationsByPage
      );
    }

    if (incompletePageNumbers.length > 0) {
      const message = `아직 번역되지 않은 페이지가 있어 PDF를 저장하지 않았습니다: ${formatPageList(
        incompletePageNumbers
      )}`;
      setError(message);
      updateDocumentJob(jobId, {
        status: "partial",
        pageRange: pageNumbers.join(", "),
        totalPages: pageNumbers.length,
        processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
        failedPages: incompletePageNumbers.length,
        message
      });
      return;
    }

    await exportBilingualPdf({
      pageNumbers,
      translationsByPage: exportTranslationsByPage,
      jobId
    });
  }

  async function exportBilingualPdf(options: ExportBilingualPdfOptions = {}) {
    if (!pdfDocument) {
      setError("PDF가 열려 있지 않습니다.");
      return;
    }

    const pageNumbers = options.pageNumbers ?? parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const exportPageRange = options.pageNumbers ? options.pageNumbers.join(", ") : pageRangeInput;
    const exportTranslationsByPage = options.translationsByPage ?? pageTranslations;
    const jobId = options.jobId ?? `export-${Date.now()}`;

    setError("");
    setIsExporting(true);
    setTranslationStatus("대조 문서 페이지 준비 중...");
    if (options.jobId) {
      updateDocumentJob(jobId, {
        status: "exporting",
        pageRange: exportPageRange,
        totalPages: pageNumbers.length,
        processedPages: 0,
        message: "번역 완료. 대조 문서 페이지 준비 중..."
      });
    } else {
      setDocumentJob({
        id: jobId,
        status: "exporting",
        pageRange: exportPageRange,
        totalPages: pageNumbers.length,
        processedPages: 0,
        translatedSegments: 0,
        totalSegments: 0,
        failedPages: 0,
        message: "대조 문서 페이지 준비 중...",
        updatedAt: new Date().toLocaleString()
      });
    }

    try {
      const incompletePageNumbers = await getIncompleteExportPageNumbers(
        pageNumbers,
        exportTranslationsByPage
      );
      if (incompletePageNumbers.length > 0) {
        const message = `아직 번역되지 않은 페이지가 있어 PDF를 저장하지 않았습니다: ${formatPageList(incompletePageNumbers)}`;
        setError(message);
        setTranslationStatus("");
        updateDocumentJob(jobId, {
          status: "partial",
          processedPages: 0,
          failedPages: incompletePageNumbers.length,
          message
        });
        return;
      }

      const pages: BilingualPdfExportPage[] = [];
      let exportSegmentCount = 0;
      let exportSourceSegmentCount = 0;

      for (const pageNumber of pageNumbers) {
        setTranslationStatus(`페이지 ${pageNumber} 원문 이미지 렌더링 중...`);
        const prepared = await prepareBilingualExportPage({
          pageNumber,
          translationsByPage: exportTranslationsByPage,
          readPageData,
          renderPageImage: (targetPageNumber) => renderPdfPageImage(pdfDocument, targetPageNumber),
          exportMode: settings.pdfExportMode
        });
        exportSourceSegmentCount += prepared.sourceSegmentCount;
        exportSegmentCount += prepared.translatedSegmentCount;
        pages.push(prepared.page);
        updateDocumentJob(jobId, {
          processedPages: pages.length,
          totalPages: pageNumbers.length,
          translatedSegments: exportSegmentCount,
          totalSegments: exportSourceSegmentCount,
          message:
            exportSegmentCount < exportSourceSegmentCount
              ? `페이지 ${pageNumber} 준비 완료. 일부 세그먼트는 아직 번역되지 않았습니다.`
              : `페이지 ${pageNumber} 원문/번역 페이지 준비 완료.`
        });
      }

      if (exportSegmentCount === 0 && settings.pdfExportMode !== "paper") {
        setError("선택 범위에 내보낼 번역 결과가 없습니다. 먼저 범위 번역을 실행해 주세요.");
        setTranslationStatus("");
        updateDocumentJob(jobId, {
          status: "failed",
          processedPages: pageNumbers.length,
          message: "선택 범위에 내보낼 번역 결과가 없습니다."
        });
        return;
      }

      setTranslationStatus("대조 문서 내보내는 중...");
      const missingExportSegments = Math.max(0, exportSourceSegmentCount - exportSegmentCount);
      updateDocumentJob(jobId, {
        status: "exporting",
        totalSegments: exportSourceSegmentCount,
        translatedSegments: exportSegmentCount,
        message:
          missingExportSegments > 0
            ? `대조 문서 파일 생성 중... ${missingExportSegments}개 세그먼트는 아직 번역되지 않았습니다.`
            : "대조 문서 파일 생성 중..."
      });
      const result = await api.documents.exportBilingualPdf({
        title: fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-translation",
        sourceLanguageLabel: settings.learningProfile.targetLanguage.nameKo,
        targetLanguageLabel: settings.learningProfile.nativeLanguage.nameKo,
        sourcePdfData: sourcePdfData ?? undefined,
        sourcePdfFilePath: sourcePdfFilePath || undefined,
        exportMode: settings.pdfExportMode,
        showSourceHighlights: settings.showPdfSourceHighlights,
        pages
      });
      const exportArtifactLabel = getExportArtifactLabel(result.fileType);
      setTranslationStatus(
        `${exportArtifactLabel} 저장 완료: ${result.pageCount}페이지, ${result.segmentCount}세그먼트`
      );
      updateDocumentJob(jobId, {
        status: missingExportSegments > 0 ? "partial" : "exported",
        processedPages: result.pageCount,
        totalPages: result.pageCount,
        translatedSegments: result.segmentCount,
        totalSegments: exportSourceSegmentCount,
        outputPath: result.filePath,
        message:
          missingExportSegments > 0
            ? `${exportArtifactLabel} 저장 완료. ${missingExportSegments}개 세그먼트는 번역 누락으로 제외됐습니다.`
            : `${exportArtifactLabel} 저장 완료.`
      });
      const createdAt = new Date();
      const title = fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-translation";
      const exportRecord: PdfExportRecord = {
        id: `${createdAt.toISOString()}-${result.filePath}`,
        title,
        filePath: result.filePath,
        fileType: result.fileType,
        pageRange: exportPageRange,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        providerLabel: selectedTranslationModel,
        sourceLanguageLabel: settings.learningProfile.targetLanguage.nameKo,
        targetLanguageLabel: settings.learningProfile.nativeLanguage.nameKo,
        createdAt: createdAt.toISOString()
      };
      let savedRecord = exportRecord;
      try {
        savedRecord = await api.documents.saveExportRecord(exportRecord);
      } catch (recordSaveError) {
        setError(
          recordSaveError instanceof Error
            ? `파일은 저장됐지만 내보내기 기록 저장에 실패했습니다: ${recordSaveError.message}`
            : "파일은 저장됐지만 내보내기 기록 저장에 실패했습니다."
        );
      }
      setExportRecords((previous) => [
        savedRecord,
        ...previous.filter((record) => record.id !== savedRecord.id)
      ].slice(0, 5));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대조 문서를 내보내지 못했습니다.");
      setTranslationStatus("");
      updateDocumentJob(jobId, {
        status: "failed",
        message: caught instanceof Error ? caught.message : "대조 문서를 내보내지 못했습니다."
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function openExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const opened = await api.documents.openPath(record.filePath);
      if (!opened) {
        throw new Error("브라우저 모드에서는 저장된 파일을 직접 열 수 없습니다.");
      }
      setTranslationStatus(`파일을 열었습니다: ${record.filePath}`);
    } catch (caught) {
      setError(formatPdfExportActionError("파일 열기", record, caught));
    }
  }

  async function revealExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const revealed = await api.documents.revealPath(record.filePath);
      if (!revealed) {
        throw new Error("브라우저 모드에서는 저장 폴더를 직접 열 수 없습니다.");
      }
      setTranslationStatus(`파일 위치를 열었습니다: ${record.filePath}`);
    } catch (caught) {
      setError(formatPdfExportActionError("폴더 열기", record, caught));
    }
  }

  async function redownloadExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const result = await api.documents.redownloadExport(record);
      const createdAt = new Date().toISOString();
      const savedRecord = await api.documents.saveExportRecord({
        ...record,
        id: `${createdAt}-${result.filePath}`,
        filePath: result.filePath,
        fileType: result.fileType,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        createdAt
      });
      setExportRecords((previous) => [
        savedRecord,
        ...previous.filter((candidate) => candidate.id !== savedRecord.id)
      ].slice(0, 5));
      setTranslationStatus(`재다운로드 완료: ${result.filePath}`);
    } catch (caught) {
      setError(formatPdfExportActionError("재다운로드", record, caught));
    }
  }

  function openExportRecordInReader(record: PdfExportRecord) {
    onOpenReaderArtifact?.(createReaderArtifactFromExportRecord(record));
  }

  usePdfPageRenderer({
    canvasRef,
    currentPage,
    onError: setError,
    onStatus: setViewerStatus,
    pdfDocument,
    textLayerRef
  });

  useEffect(() => {
    if (!pdfDocument) {
      return;
    }

    let cancelled = false;

    async function loadTextAndCachedTranslation() {
      setPageText("");
      setPageSegments([]);
      setSegmentTranslations([]);
      setCacheStatus("idle");
      setTranslationStatus("현재 페이지 텍스트 확인 중...");
      setError("");

      try {
        const { text, segments } = await readPageData(currentPage);
        if (cancelled) {
          return;
        }

        setPageText(text);
        if (!text) {
          setTranslationStatus("텍스트 레이어가 없는 페이지입니다.");
          return;
        }

        setPageSegments(segments);
        if (segments.length === 0) {
          setTranslationStatus("번역 가능한 세그먼트를 찾지 못했습니다.");
          return;
        }

        const translatedPageState = pageTranslations[currentPage];
        if (
          translatedPageState &&
          translatedPageState.segments.map((segment) => segment.id).join("|") ===
            segments.map((segment) => segment.id).join("|")
        ) {
          setPageSegments(translatedPageState.segments);
          setSegmentTranslations(translatedPageState.translations);
          setCacheStatus(
            translatedPageState.cacheStatus === "partial" ? "miss" : translatedPageState.cacheStatus
          );
          setTranslationStatus("번역된 페이지 결과를 불러왔습니다.");
          return;
        }

        const translationContext = buildTranslationContextForSegments(segments);
        const cachedEntries = await Promise.all(
          segments.map((segment) =>
            api.translations.getCached({
              ...createPdfTranslationCacheLookupInput({
                segment,
                settings,
                selectedTranslationModel,
                contextHash: translationContext.contextHash
              })
            })
          )
        );
        if (cancelled) {
          return;
        }

        const cachedTranslations = cachedEntries.flatMap((entry, index) =>
          entry
            ? [
                {
                  id: segments[index].id,
                  translationKo: entry.translatedText,
                  cacheStatus: "hit" as const
                }
              ]
            : []
        );
        setSegmentTranslations(cachedTranslations);
        if (cachedTranslations.length > 0) {
          setPageTranslations((previous) => ({
            ...previous,
            [currentPage]: {
              segments,
              translations: cachedTranslations,
              cacheStatus: cachedTranslations.length === segments.length ? "hit" : "partial"
            }
          }));
        }

        if (cachedTranslations.length === segments.length) {
          setCacheStatus("hit");
          setTranslationStatus("모든 세그먼트를 캐시에서 불러왔습니다.");
        } else if (cachedTranslations.length > 0) {
          setCacheStatus("miss");
          setTranslationStatus(
            `${cachedTranslations.length}/${segments.length} 세그먼트가 캐시에 있습니다.`
          );
        } else {
          setCacheStatus("miss");
          setTranslationStatus(`${segments.length}개 세그먼트가 준비됐습니다.`);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "PDF 텍스트 확인에 실패했습니다.");
          setTranslationStatus("");
        }
      }
    }

    void loadTextAndCachedTranslation();

    return () => {
      cancelled = true;
    };
  }, [
    api,
    currentPage,
    pageTranslations,
    pdfDocument,
    readPageData,
    settings.learningProfile,
    selectedTranslationModel,
    settings.translationProviderName
  ]);

  useEffect(() => {
    if (!showLayoutPreview) {
      return;
    }

    setLayoutPreviewHtml("");
    setLayoutPreviewStatus("현재 페이지, 번역, 또는 위치 표시 옵션이 바뀌었습니다. 조판 미리보기를 다시 생성해 주세요.");
  }, [
    currentPage,
    segmentTranslations,
    settings.pdfExportMode,
    settings.showPdfSourceHighlights,
    showLayoutPreview
  ]);

  return (
    <section className={`panel pdf-panel pdf-panel-${mode}`}>
      {!isMakerMode ? (
        <PdfReaderToolbar
          cacheStatus={cacheStatus}
          currentPage={currentPage}
          fileName={fileName}
          isOpening={isOpening}
          pageCount={pageCount}
          pdfDocumentLoaded={Boolean(pdfDocument)}
          providerLabel={providerLabel}
          translatedPageCount={translatedPageCount}
          onFileSelected={(file) => void handleFile(file)}
          onGoToPage={goToPage}
        />
      ) : null}

      {pdfDocument && isMakerMode && (documentJob || exportRecords.length > 0) ? (
        <PdfMakerJobSummary
          canOpenReaderArtifact={Boolean(onOpenReaderArtifact)}
          displayedProgressPercent={displayedProgressPercent}
          documentJob={documentJob}
          documentJobProgressPercent={documentJobProgressPercent}
          exportRecords={exportRecords}
          failedPageCount={failedPageCount}
          fileName={fileName}
          pageCount={pageCount}
          selectedRangePageCount={selectedRangePageCount}
          translatedPageCount={translatedPageCount}
          translatedSegmentCount={translatedSegmentCount}
          onOpenExportRecord={(record) => void openExportRecord(record)}
          onOpenExportRecordInReader={openExportRecordInReader}
          onRedownloadExportRecord={(record) => void redownloadExportRecord(record)}
          onRevealExportRecord={(record) => void revealExportRecord(record)}
        />
      ) : null}

      {error ? <p className="error-text" data-qa="pdf-error">{error}</p> : null}

      {isMakerMode ? (
        <PdfMakerWorkflow
          bypassTranslationCache={bypassTranslationCache}
          canOpenReaderArtifact={Boolean(onOpenReaderArtifact)}
          canShowMakerDone={canShowMakerDone}
          displayedProgressPercent={displayedProgressPercent}
          documentJob={documentJob}
          failedPageCount={failedPageCount}
          failedPageNumbers={failedPageNumbers}
          fileName={fileName}
          googleKeyMissing={googleKeyMissing}
          isMakerBusy={isMakerBusy}
          isMakerJobActive={isMakerJobActive}
          isOpening={isOpening}
          latestExportRecord={latestExportRecord}
          makerFreeTierLimitBlocked={makerFreeTierLimitBlocked}
          makerMonthlyLimitBlocked={makerMonthlyLimitBlocked}
          makerRuntimeBlocked={makerRuntimeBlocked}
          makerRuntimeBlockedMessage={makerRuntimeBlockedMessage}
          makerStartBlocked={makerStartBlocked}
          makerUsageEstimate={makerUsageEstimate}
          makerUsageStatus={makerUsageStatus}
          pageCount={pageCount}
          pageRangeInput={pageRangeInput}
          pageTranslationFailures={pageTranslationFailures}
          pdfDocumentLoaded={Boolean(pdfDocument)}
          providerLabel={providerLabel}
          selectedRangePageCount={selectedRangePageCount}
          settings={settings}
          translatedSegmentCount={translatedSegmentCount}
          onBypassTranslationCacheChange={setBypassTranslationCache}
          onFileSelected={(file) => void handleFile(file)}
          onOpenExportRecord={(record) => void openExportRecord(record)}
          onOpenExportRecordInReader={openExportRecordInReader}
          onPageRangeInputChange={setPageRangeInput}
          onRedownloadExportRecord={(record) => void redownloadExportRecord(record)}
          onResetPdfReaderToEmpty={resetPdfReaderToEmpty}
          onRetryFailedPagesAndExportSelectedRange={() =>
            void retryFailedPagesAndExportSelectedRange()
          }
          onRevealExportRecord={(record) => void revealExportRecord(record)}
          onSettingsChange={onSettingsChange}
          onTogglePdfSourceHighlights={togglePdfSourceHighlights}
          onTranslateAndExportSelectedRange={() => void translateAndExportSelectedRange()}
        />
      ) : null}

      {pdfDocument && !isMakerMode ? (
        <div className="pdf-reader-grid">
          <div className="pdf-viewer-pane">
            {viewerStatus ? <div className="pdf-loading">{viewerStatus}</div> : null}
            <div className="pdf-page-stage">
              <canvas
                ref={canvasRef}
                aria-label={`PDF page ${currentPage}`}
                className="pdf-canvas"
              />
              <div
                ref={textLayerRef}
                aria-label={`PDF page ${currentPage} selectable text`}
                className="pdf-visible-text-layer textLayer"
              />
              {showLayoutHighlights ? <PdfPageHighlights segments={pageSegments} /> : null}
            </div>
          </div>

          <aside className="pdf-translation-pane">
            <div className="pdf-translation-header">
              <div>
                <h3>번역본</h3>
                {translationStatus ? <p className="muted compact">{translationStatus}</p> : null}
              </div>
              <div className="pdf-translation-actions">
                <button
                  className="button ghost"
                  disabled={pageSegments.length === 0}
                  type="button"
                  onClick={() => setShowLayoutHighlights((previous) => !previous)}
                >
                  {showLayoutHighlights ? "위치 숨기기" : "위치 보기"}
                </button>
                <button
                  className="button ghost"
                  disabled={pageSegments.length === 0}
                  type="button"
                  onClick={togglePdfSourceHighlights}
                >
                  {settings.showPdfSourceHighlights ? "원문 박스 끄기" : "원문 박스 켜기"}
                </button>
                {isMakerMode ? (
                  <button
                    className="button secondary"
                    disabled={pageSegments.length === 0 || isBuildingLayoutPreview}
                    type="button"
                    onClick={() => void previewCurrentPageLayout()}
                  >
                    {isBuildingLayoutPreview ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    조판 미리보기
                  </button>
                ) : null}
                <button
                  className="button primary"
                  disabled={
                    pageSegments.length === 0 ||
                    isTranslating ||
                    isExporting ||
                    isDownloadingModel ||
                    googleKeyMissing
                  }
                  type="button"
                  onClick={() => void translateCurrentPage()}
                >
                  {isTranslating ? <Loader2 className="spin" size={16} /> : <Languages size={16} />}
                  현재 페이지 번역
                </button>
              </div>
            </div>

            {provider ? (
              <section className="pdf-live-card-panel">
                <div className="pdf-live-card-header">
                  <div>
                    <strong>Sentence Card</strong>
                    <span>Select text, then press {settings.captureShortcut || "Ctrl+Q"}</span>
                  </div>
                  <div className="card-generation-action-row">
                    <CardGenerationUsageEstimate estimate={liveCardUsageEstimate} variant="badge" />
                    <button
                      className="button secondary small"
                      disabled={isGeneratingLiveCard || pageSegments.length === 0}
                      type="button"
                      onFocus={refreshLiveCardUsageEstimate}
                      onMouseEnter={refreshLiveCardUsageEstimate}
                      onClick={() => void createLiveCardFromSelection()}
                    >
                      {isGeneratingLiveCard ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Save size={15} />
                      )}
                      카드 만들기
                    </button>
                  </div>
                </div>
                {liveCardStatus ? <p className="status-text compact">{liveCardStatus}</p> : null}
                {liveCardCandidate ? (
                  <>
                    <CardPreview card={liveCardCandidate} settings={settings} defaultShowBack />
                    <button
                      className="button primary wide"
                      type="button"
                      onClick={() => void saveLiveCardCandidate()}
                    >
                      카드 저장
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}

            {googleKeyMissing ? (
              <p className="selection-warning">클라우드 번역을 쓰려면 Settings에서 API key가 필요합니다.</p>
            ) : null}
            {settings.translationProviderName === "local" ||
            settings.translationProviderName === "localMt" ? (
              <p className="muted compact">
                {settings.learningProfile.targetLanguage.nameKo}에서{" "}
                {settings.learningProfile.nativeLanguage.nameKo}로 번역합니다.
              </p>
            ) : null}
            {isMakerMode && rangeProgress ? (
              <div className="pdf-progress">
                <div className="pdf-progress-bar">
                  <span
                    style={{
                      width: `${Math.round((rangeProgress.current / Math.max(1, rangeProgress.total)) * 100)}%`
                    }}
                  />
                </div>
                <p className="muted compact">
                  페이지 {rangeProgress.pageNumber} · {rangeProgress.current}/
                  {rangeProgress.total} · 세그먼트 {rangeProgress.translatedSegments}/
                  {rangeProgress.totalSegments}
                </p>
              </div>
            ) : null}
            {isMakerMode && failedPageCount > 0 ? (
              <div className="pdf-failure-summary">
                <div>
                  <strong>{failedPageCount}개 페이지 실패</strong>
                  <p className="muted compact">
                    {failedPageNumbers.slice(0, 6).join(", ")}
                    {failedPageNumbers.length > 6 ? " 외" : ""} 페이지를 다시 시도할 수 있습니다.
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={isTranslating || isExporting || isDownloadingModel}
                  type="button"
                  onClick={() => void retryFailedPages()}
                >
                  실패 재시도
                </button>
              </div>
            ) : null}

            {isMakerMode && showLayoutPreview ? (
              <section className="pdf-layout-preview">
                <div className="pdf-layout-preview-header">
                  <div>
                    <strong>조판 미리보기</strong>
                    {layoutPreviewStatus ? (
                      <p className="muted compact">{layoutPreviewStatus}</p>
                    ) : null}
                  </div>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => {
                      setShowLayoutPreview(false);
                      setLayoutPreviewHtml("");
                      setLayoutPreviewStatus("");
                    }}
                  >
                    닫기
                  </button>
                </div>
                {layoutPreviewHtml ? (
                  <iframe
                    className="pdf-layout-preview-frame"
                    sandbox=""
                    srcDoc={layoutPreviewHtml}
                    title={`Page ${currentPage} bilingual layout preview`}
                  />
                ) : (
                  <div className="pdf-layout-preview-empty">
                    {isBuildingLayoutPreview ? "조판 미리보기를 생성하는 중입니다." : "조판 미리보기를 생성해 주세요."}
                  </div>
                )}
              </section>
            ) : null}

            <PdfTranslationSegmentList
              segments={pageSegments}
              translations={segmentTranslations}
            />

            <details className="pdf-source-details">
              <summary>현재 페이지 텍스트</summary>
              <div className="pdf-page-text">{pageText || "추출된 텍스트가 없습니다."}</div>
            </details>
          </aside>
        </div>
      ) : !pdfDocument && !isMakerMode ? (
        <PdfReaderEmptyState
          isMakerMode={isMakerMode}
          selectedTranslationModel={selectedTranslationModel}
          settings={settings}
          onFileSelected={(file) => void handleFile(file)}
        />
      ) : null}
      <PdfReaderRuntimeDialogs
        isDownloadingModel={isDownloadingModel}
        ollamaDownloadUrl={OLLAMA_DOWNLOAD_URL}
        pendingModelDownload={pendingModelDownload}
        pendingOllamaSetup={pendingOllamaSetup}
        onDismissModelDownload={dismissModelDownloadPrompt}
        onDismissOllamaSetup={dismissOllamaSetupPrompt}
        onDownloadMissingModel={() => void downloadMissingModelAndTranslate()}
        onRetryOllamaSetup={() => void translateCurrentPage()}
      />
    </section>
  );
}


