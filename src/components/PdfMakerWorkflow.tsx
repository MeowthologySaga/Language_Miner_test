import { FileText, Languages, Loader2, Save, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import type { AppSettings, BilingualExportHistoryRecord } from "../shared/types";
import type { TranslationUsageEstimate } from "../shared/translationUsage";
import { formatPageList } from "./pdfSelectionReaderUtils";
import { PdfMakerAdvancedSettings } from "./PdfMakerAdvancedSettings";
import { PdfMakerUsageEstimate } from "./PdfMakerUsageEstimate";

type MakerDocumentJob = {
  message: string;
  processedPages: number;
  totalPages: number;
  translatedSegments: number;
  totalSegments: number;
};

type MakerPageFailure = {
  message: string;
};

type PdfMakerWorkflowProps = {
  bypassTranslationCache: boolean;
  canOpenReaderArtifact: boolean;
  canShowMakerDone: boolean;
  displayedProgressPercent: number;
  documentJob: MakerDocumentJob | null;
  failedPageCount: number;
  failedPageNumbers: number[];
  fileName: string;
  googleKeyMissing: boolean;
  isMakerBusy: boolean;
  isMakerJobActive: boolean;
  isOpening: boolean;
  latestExportRecord: BilingualExportHistoryRecord | undefined;
  makerFreeTierLimitBlocked: boolean;
  makerMonthlyLimitBlocked: boolean;
  makerRuntimeBlocked: boolean;
  makerRuntimeBlockedMessage: string;
  makerStartBlocked: boolean;
  makerUsageEstimate: TranslationUsageEstimate | null;
  makerUsageStatus: string;
  pageCount: number;
  pageRangeInput: string;
  pageTranslationFailures: Record<number, MakerPageFailure>;
  pdfDocumentLoaded: boolean;
  providerLabel: string;
  selectedRangePageCount: number;
  settings: AppSettings;
  translatedSegmentCount: number;
  onBypassTranslationCacheChange: (enabled: boolean) => void;
  onFileSelected: (file: File | undefined) => void;
  onOpenExportRecord: (record: BilingualExportHistoryRecord) => void;
  onOpenExportRecordInReader: (record: BilingualExportHistoryRecord) => void;
  onPageRangeInputChange: (value: string) => void;
  onRedownloadExportRecord: (record: BilingualExportHistoryRecord) => void;
  onResetPdfReaderToEmpty: () => void;
  onRetryFailedPagesAndExportSelectedRange: () => void;
  onRevealExportRecord: (record: BilingualExportHistoryRecord) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onTogglePdfSourceHighlights: () => void;
  onTranslateAndExportSelectedRange: () => void;
};

export function PdfMakerWorkflow({
  bypassTranslationCache,
  canOpenReaderArtifact,
  canShowMakerDone,
  displayedProgressPercent,
  documentJob,
  failedPageCount,
  failedPageNumbers,
  fileName,
  googleKeyMissing,
  isMakerBusy,
  isMakerJobActive,
  isOpening,
  latestExportRecord,
  makerFreeTierLimitBlocked,
  makerMonthlyLimitBlocked,
  makerRuntimeBlocked,
  makerRuntimeBlockedMessage,
  makerStartBlocked,
  makerUsageEstimate,
  makerUsageStatus,
  pageCount,
  pageRangeInput,
  pageTranslationFailures,
  pdfDocumentLoaded,
  providerLabel,
  selectedRangePageCount,
  settings,
  translatedSegmentCount,
  onBypassTranslationCacheChange,
  onFileSelected,
  onOpenExportRecord,
  onOpenExportRecordInReader,
  onPageRangeInputChange,
  onRedownloadExportRecord,
  onResetPdfReaderToEmpty,
  onRetryFailedPagesAndExportSelectedRange,
  onRevealExportRecord,
  onSettingsChange,
  onTogglePdfSourceHighlights,
  onTranslateAndExportSelectedRange
}: PdfMakerWorkflowProps) {
  const makerProgressStyle = {
    "--maker-progress": `${displayedProgressPercent}%`
  } as CSSProperties;

  return (
    <div className="pdf-maker-simple">
      {!pdfDocumentLoaded ? (
        <div className="pdf-maker-start">
          <label className="pdf-maker-dropzone" data-qa="book-maker-file-dropzone">
            <FileText size={42} />
            <strong>PDF를 여기에 놓기</strong>
            <span>한 번 선택하면 번역 PDF 만들기를 바로 시작할 수 있습니다.</span>
            <span className="button primary reader-action">
              {isOpening ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
              PDF 선택
            </span>
            <input
              accept="application/pdf"
              data-qa="book-maker-file-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                onFileSelected(file);
              }}
            />
          </label>
          <div className="pdf-maker-chip-row">
            <span>
              {settings.learningProfile.targetLanguage.nameKo} →{" "}
              {settings.learningProfile.nativeLanguage.nameKo}
            </span>
            <span>{providerLabel} 번역</span>
            <span>{settings.showPdfSourceHighlights ? "박스 표시" : "박스 숨김"}</span>
          </div>
          {makerRuntimeBlocked ? (
            <p className="selection-warning">{makerRuntimeBlockedMessage}</p>
          ) : null}
          <PdfMakerAdvancedSettings
            bypassTranslationCache={bypassTranslationCache}
            pageCount={pageCount}
            pageRangeInput={pageRangeInput}
            settings={settings}
            onBypassTranslationCacheChange={onBypassTranslationCacheChange}
            onPageRangeInputChange={onPageRangeInputChange}
            onSettingsChange={onSettingsChange}
            onTogglePdfSourceHighlights={onTogglePdfSourceHighlights}
          />
        </div>
      ) : canShowMakerDone && latestExportRecord ? (
        <div className="pdf-maker-done" data-qa="book-maker-done">
          <div className="pdf-maker-done-icon">✓</div>
          <h3>이중언어 PDF가 완성됐습니다</h3>
          <p>
            {latestExportRecord.pageCount}페이지 · {latestExportRecord.segmentCount}세그먼트 ·{" "}
            {latestExportRecord.providerLabel}
          </p>
          <div className="pdf-maker-done-actions">
            <button
              className="button primary maker-action"
              type="button"
              onClick={() => onOpenExportRecord(latestExportRecord)}
            >
              PDF 열기
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => onRedownloadExportRecord(latestExportRecord)}
            >
              재다운로드
            </button>
            {canOpenReaderArtifact ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => onOpenExportRecordInReader(latestExportRecord)}
              >
                리더기에서 열기
              </button>
            ) : null}
            <button
              className="button secondary"
              type="button"
              onClick={() => onRevealExportRecord(latestExportRecord)}
            >
              폴더에서 보기
            </button>
            <button
              className="button ghost"
              data-qa="book-maker-new-pdf-button"
              type="button"
              onClick={onResetPdfReaderToEmpty}
            >
              새 PDF 만들기
            </button>
          </div>
        </div>
      ) : isMakerBusy || isMakerJobActive ? (
        <div className="pdf-maker-progress-panel" data-qa="book-maker-progress">
          <div className="pdf-maker-file-strip">
            <FileText size={22} />
            <div>
              <strong>{fileName || "선택한 PDF"}</strong>
              <span>{selectedRangePageCount}페이지 선택</span>
            </div>
          </div>
          <div className="pdf-maker-progress-center">
            <div className="pdf-maker-progress-ring" style={makerProgressStyle}>
              {displayedProgressPercent}%
            </div>
            <h3>{documentJob?.message ?? "이중언어 PDF를 만드는 중입니다."}</h3>
            <p>완료되면 저장창이 열립니다.</p>
            <div className="pdf-maker-progress-stats">
              <span>
                {documentJob?.processedPages ?? 0}/
                {documentJob?.totalPages ?? selectedRangePageCount} 페이지
              </span>
              <span>
                {documentJob?.translatedSegments ?? translatedSegmentCount}/
                {documentJob?.totalSegments ?? "-"} 세그먼트
              </span>
              {failedPageCount > 0 ? (
                <span className="failed">{failedPageCount}페이지 실패</span>
              ) : null}
            </div>
            {failedPageCount > 0 ? (
              <button
                className="button secondary"
                data-qa="book-maker-progress-retry-failed"
                disabled={isMakerBusy}
                type="button"
                onClick={onRetryFailedPagesAndExportSelectedRange}
              >
                <Languages size={16} />
                실패 페이지만 다시 번역
              </button>
            ) : null}
          </div>
        </div>
      ) : failedPageCount > 0 ? (
        <div className="pdf-maker-recovery" data-qa="book-maker-recovery">
          <div className="pdf-maker-selected-file">
            <FileText size={34} />
            <div>
              <span>일부 페이지 실패</span>
              <strong>{fileName}</strong>
              <small>{formatPageList(failedPageNumbers)} 페이지를 다시 번역해야 합니다.</small>
            </div>
          </div>
          <div className="pdf-maker-failure-list">
            {failedPageNumbers.slice(0, 4).map((pageNumber) => (
              <div key={pageNumber}>
                <strong>{pageNumber}p</strong>
                <span>{pageTranslationFailures[pageNumber]?.message ?? "번역 실패"}</span>
              </div>
            ))}
          </div>
          <button
            className="button primary maker-action pdf-maker-main-action"
            data-qa="book-maker-retry-failed-export"
            disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
            type="button"
            onClick={onRetryFailedPagesAndExportSelectedRange}
          >
            <Languages size={18} />
            실패 페이지만 다시 번역하고 PDF 만들기
          </button>
          <button
            className="button ghost"
            disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
            type="button"
            onClick={onTranslateAndExportSelectedRange}
          >
            전체 범위 다시 시작
          </button>
        </div>
      ) : (
        <div className="pdf-maker-ready">
          <div className="pdf-maker-selected-file">
            <FileText size={34} />
            <div>
              <span>선택한 PDF</span>
              <strong>{fileName}</strong>
              <small>
                {pageCount}페이지 · {settings.learningProfile.targetLanguage.nameKo} →{" "}
                {settings.learningProfile.nativeLanguage.nameKo}
              </small>
            </div>
            <label className="button ghost">
              다른 PDF
              <input
                accept="application/pdf"
                data-qa="book-maker-replace-file-input"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  onFileSelected(file);
                }}
              />
            </label>
            <button
              className="button ghost"
              data-qa="book-maker-clear-button"
              type="button"
              onClick={onResetPdfReaderToEmpty}
            >
              선택 해제
            </button>
          </div>
          {makerRuntimeBlocked ? (
            <p className="selection-warning">{makerRuntimeBlockedMessage}</p>
          ) : null}
          <PdfMakerUsageEstimate
            estimate={makerUsageEstimate}
            makerFreeTierLimitBlocked={makerFreeTierLimitBlocked}
            makerMonthlyLimitBlocked={makerMonthlyLimitBlocked}
            makerUsageStatus={makerUsageStatus}
            providerLabel={providerLabel}
          />
          <div className="pdf-maker-status-dock">
            <div>
              <strong>
                {makerRuntimeBlocked
                  ? "데스크톱 앱에서 실행해 주세요"
                  : makerStartBlocked
                  ? "한도 설정을 확인해 주세요"
                  : "무료 한도 내 · 캐시 적용 · 한도 초과 시 자동 중지"}
              </strong>
              <span>
                {makerRuntimeBlocked
                  ? "로컬 웹은 Local MT 책 번역/저장 경로를 지원하지 않습니다."
                  : "예상 금액입니다. 실제 청구액과 다를 수 있습니다."}
              </span>
            </div>
            <button
              className="button primary maker-action pdf-maker-main-action"
              data-qa="book-maker-start-button"
              disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
              type="button"
              onClick={onTranslateAndExportSelectedRange}
            >
              <Save size={18} />
              번역 PDF 만들기
            </button>
          </div>
          <PdfMakerAdvancedSettings
            bypassTranslationCache={bypassTranslationCache}
            pageCount={pageCount}
            pageRangeInput={pageRangeInput}
            settings={settings}
            onBypassTranslationCacheChange={onBypassTranslationCacheChange}
            onPageRangeInputChange={onPageRangeInputChange}
            onSettingsChange={onSettingsChange}
            onTogglePdfSourceHighlights={onTogglePdfSourceHighlights}
          />
        </div>
      )}
    </div>
  );
}
