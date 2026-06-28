import type { BilingualExportHistoryRecord } from "../shared/types";
import type { DocumentTranslationJob } from "./pdfReaderWorkflowState";
import {
  formatExportRecordDate,
  getDocumentJobStatusLabel,
  getExportArtifactLabel
} from "./pdfSelectionReaderUtils";

type PdfMakerJobSummaryProps = {
  canOpenReaderArtifact: boolean;
  displayedProgressPercent: number;
  documentJob: DocumentTranslationJob | null;
  documentJobProgressPercent: number;
  exportRecords: BilingualExportHistoryRecord[];
  failedPageCount: number;
  fileName: string;
  pageCount: number;
  selectedRangePageCount: number;
  translatedPageCount: number;
  translatedSegmentCount: number;
  onOpenExportRecord: (record: BilingualExportHistoryRecord) => void;
  onOpenExportRecordInReader: (record: BilingualExportHistoryRecord) => void;
  onRedownloadExportRecord: (record: BilingualExportHistoryRecord) => void;
  onRevealExportRecord: (record: BilingualExportHistoryRecord) => void;
};

export function PdfMakerJobSummary({
  canOpenReaderArtifact,
  displayedProgressPercent,
  documentJob,
  documentJobProgressPercent,
  exportRecords,
  failedPageCount,
  fileName,
  pageCount,
  selectedRangePageCount,
  translatedPageCount,
  translatedSegmentCount,
  onOpenExportRecord,
  onOpenExportRecordInReader,
  onRedownloadExportRecord,
  onRevealExportRecord
}: PdfMakerJobSummaryProps) {
  return (
    <div className="pdf-job-summary">
      <div className="pdf-job-overview">
        <div className="pdf-job-main">
          <div className="pdf-job-title">
            <span>문서 번역</span>
            <strong>{fileName || "Untitled PDF"}</strong>
          </div>
          <div className="pdf-job-progress" aria-label="Document translation progress">
            <span style={{ width: `${displayedProgressPercent}%` }} />
          </div>
        </div>
        <div className="pdf-job-stats">
          <span>
            {translatedPageCount}/{pageCount} 페이지
          </span>
          <span>{translatedSegmentCount} 세그먼트</span>
          <span>{selectedRangePageCount} 선택됨</span>
          {failedPageCount > 0 ? <span>{failedPageCount} 실패</span> : null}
        </div>
        {documentJob ? (
          <div className={`pdf-document-job ${documentJob.status}`} data-qa="book-maker-job">
            <div className="pdf-document-job-header">
              <span>작업 상태</span>
              <strong>{getDocumentJobStatusLabel(documentJob.status)}</strong>
            </div>
            <div className="pdf-document-job-progress" aria-label="Document job progress">
              <span style={{ width: `${documentJobProgressPercent}%` }} />
            </div>
            <p>{documentJob.message}</p>
            <div className="pdf-document-job-meta">
              <span>{documentJob.pageRange || "-"} 범위</span>
              <span>
                {documentJob.processedPages}/{documentJob.totalPages} 페이지
              </span>
              <span>
                {documentJob.translatedSegments}/{documentJob.totalSegments} 세그먼트
              </span>
              {documentJob.failedPages > 0 ? <span>{documentJob.failedPages} 실패</span> : null}
              {documentJob.outputPath ? <span>{documentJob.outputPath}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
      {exportRecords.length > 0 ? (
        <div className="pdf-export-records" aria-label="Recent bilingual PDF exports">
          <div className="pdf-export-records-title">
            <span>최근 결과</span>
            <strong>{exportRecords.length}</strong>
          </div>
          <div className="pdf-export-record-list">
            {exportRecords.map((record) => (
              <article className="pdf-export-record" key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <span>{record.filePath}</span>
                </div>
                <div className="pdf-export-record-side">
                  <div className="pdf-export-record-meta">
                    <span>{record.pageRange} 범위</span>
                    <span>{getExportArtifactLabel(record.fileType)}</span>
                    <span>{record.pageCount}페이지</span>
                    <span>{record.segmentCount}세그먼트</span>
                    <span>{record.providerLabel}</span>
                    <span>{formatExportRecordDate(record.createdAt)}</span>
                  </div>
                  <div className="pdf-export-record-actions">
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onOpenExportRecord(record)}
                    >
                      열기
                    </button>
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onRedownloadExportRecord(record)}
                    >
                      재다운
                    </button>
                    {canOpenReaderArtifact ? (
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => onOpenExportRecordInReader(record)}
                      >
                        리더기
                      </button>
                    ) : null}
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onRevealExportRecord(record)}
                    >
                      폴더
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
