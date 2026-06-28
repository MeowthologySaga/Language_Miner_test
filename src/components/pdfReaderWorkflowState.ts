import type { TranslationUsageEstimate } from "../shared/translationUsage";
import type {
  BilingualExportHistoryRecord,
  PdfTextSegment
} from "../shared/types";
import { parsePageRange } from "../utils/pageRange";
import type {
  DocumentJobStatus,
  PageTranslationState
} from "./pdfSelectionReaderUtils";

export type RangeTranslationProgress = {
  current: number;
  total: number;
  pageNumber: number;
  translatedSegments: number;
  totalSegments: number;
};

export type PageTranslationFailure = {
  pageNumber: number;
  message: string;
  segmentCount: number;
  updatedAt: string;
};

export type DocumentTranslationJob = {
  id: string;
  status: DocumentJobStatus;
  pageRange: string;
  totalPages: number;
  processedPages: number;
  translatedSegments: number;
  totalSegments: number;
  failedPages: number;
  message: string;
  outputPath?: string;
  updatedAt: string;
};

export type RangeTranslationResult = {
  jobId: string;
  pageNumbers: number[];
  failedPageNumbers: number[];
  translationsByPage: Record<number, PageTranslationState>;
  completedPages: number;
  failedPages: number;
  translatedSegments: number;
  totalSegments: number;
  blocked: boolean;
};

export type ExportBilingualPdfOptions = {
  pageNumbers?: number[];
  translationsByPage?: Record<number, PageTranslationState>;
  jobId?: string;
};

export type TranslatePageRangeOptions = {
  skipModelCheck?: boolean;
  afterModelDownload?: "translate" | "translateAndExport";
};

type PdfReaderWorkflowStateInput = {
  currentPage: number;
  documentJob: DocumentTranslationJob | null;
  exportRecords: BilingualExportHistoryRecord[];
  isDownloadingModel: boolean;
  isExporting: boolean;
  isMakerMode: boolean;
  isOpening: boolean;
  isTranslating: boolean;
  makerRuntimeBlocked: boolean;
  makerUsageEstimate: TranslationUsageEstimate | null;
  monthlySpendLimitKrw: number;
  pageCount: number;
  pageRangeInput: string;
  pageTranslationFailures: Record<number, PageTranslationFailure>;
  pdfDocumentLoaded: boolean;
  stopOnFreeTierLimit: boolean;
  stopOnMonthlyLimit: boolean;
  translatedPageCount: number;
};

export type PdfReaderWorkflowState = {
  canShowMakerDone: boolean;
  displayedProgressPercent: number;
  documentJobProgressPercent: number;
  documentProgressPercent: number;
  failedPageCount: number;
  failedPageList: string;
  failedPageNumbers: number[];
  isMakerBusy: boolean;
  isMakerJobActive: boolean;
  latestExportRecord: BilingualExportHistoryRecord | undefined;
  makerFreeTierLimitBlocked: boolean;
  makerMonthlyLimitBlocked: boolean;
  makerStartBlocked: boolean;
  selectedRangePageCount: number;
  shouldKeepMakerAlive: boolean;
};

export function getFailedPageNumbers(
  pageTranslationFailures: Record<number, PageTranslationFailure>
) {
  return Object.keys(pageTranslationFailures)
    .map(Number)
    .sort((left, right) => left - right);
}

export function getAllPageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_value, index) => index + 1);
}

export function getUntranslatedPageNumbers(
  pageCount: number,
  pageTranslations: Record<number, PageTranslationState>
) {
  return getAllPageNumbers(pageCount).filter((pageNumber) => {
    const pageState = pageTranslations[pageNumber];
    return !pageState || pageState.translations.length < pageState.segments.length;
  });
}

export function hasCompletePageTranslation(
  pageState: PageTranslationState | undefined,
  segments: PdfTextSegment[],
  bypassTranslationCache: boolean
) {
  if (bypassTranslationCache) {
    return false;
  }

  if (!pageState || pageState.translations.length < segments.length) {
    return false;
  }

  const segmentIds = segments.map((segment) => segment.id).join("|");
  const translatedSegmentIds = pageState.segments.map((segment) => segment.id).join("|");
  return segmentIds === translatedSegmentIds;
}

export function isDocumentJobActive(documentJob: DocumentTranslationJob | null) {
  return (
    documentJob !== null &&
    ["checking", "translating", "blocked", "exporting"].includes(documentJob.status)
  );
}

export function getDocumentJobProgressPercent(documentJob: DocumentTranslationJob | null) {
  return documentJob
    ? Math.round((documentJob.processedPages / Math.max(1, documentJob.totalPages)) * 100)
    : 0;
}

export function getPdfReaderWorkflowState({
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
  monthlySpendLimitKrw,
  pageCount,
  pageRangeInput,
  pageTranslationFailures,
  pdfDocumentLoaded,
  stopOnFreeTierLimit,
  stopOnMonthlyLimit,
  translatedPageCount
}: PdfReaderWorkflowStateInput): PdfReaderWorkflowState {
  const failedPageNumbers = getFailedPageNumbers(pageTranslationFailures);
  const selectedRangePageCount = pdfDocumentLoaded
    ? parsePageRange({
        value: pageRangeInput,
        pageCount,
        fallbackPage: currentPage
      }).length
    : 0;
  const documentProgressPercent = pageCount
    ? Math.round((translatedPageCount / pageCount) * 100)
    : 0;
  const documentJobProgressPercent = getDocumentJobProgressPercent(documentJob);
  const displayedProgressPercent =
    isMakerMode && documentJob ? documentJobProgressPercent : documentProgressPercent;
  const latestExportRecord = exportRecords[0];
  const isMakerBusy = isTranslating || isExporting || isDownloadingModel;
  const isMakerJobActive = isDocumentJobActive(documentJob);
  const canShowMakerDone =
    latestExportRecord !== undefined &&
    !isMakerBusy &&
    (documentJob === null || documentJob.status === "exported");
  const makerFreeTierLimitBlocked =
    Boolean(makerUsageEstimate?.freeTier) &&
    stopOnFreeTierLimit &&
    (makerUsageEstimate?.dailyLimitUsagePercent.max ?? 0) >= 100;
  const makerMonthlyLimitBlocked =
    Boolean(makerUsageEstimate) &&
    stopOnMonthlyLimit &&
    monthlySpendLimitKrw > 0 &&
    (makerUsageEstimate?.estimatedCostKrw.max ?? 0) > monthlySpendLimitKrw;
  const makerStartBlocked =
    makerFreeTierLimitBlocked || makerMonthlyLimitBlocked || makerRuntimeBlocked;

  return {
    canShowMakerDone,
    displayedProgressPercent,
    documentJobProgressPercent,
    documentProgressPercent,
    failedPageCount: failedPageNumbers.length,
    failedPageList: failedPageNumbers.join(", "),
    failedPageNumbers,
    isMakerBusy,
    isMakerJobActive,
    latestExportRecord,
    makerFreeTierLimitBlocked,
    makerMonthlyLimitBlocked,
    makerStartBlocked,
    selectedRangePageCount,
    shouldKeepMakerAlive: isMakerMode && (isOpening || isMakerBusy || isMakerJobActive)
  };
}
