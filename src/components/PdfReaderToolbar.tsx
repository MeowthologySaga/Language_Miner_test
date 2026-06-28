import { ChevronLeft, ChevronRight, FileText, Loader2, Upload } from "lucide-react";

type PdfReaderToolbarProps = {
  cacheStatus: "idle" | "hit" | "miss";
  currentPage: number;
  fileName: string;
  isOpening: boolean;
  pageCount: number;
  pdfDocumentLoaded: boolean;
  providerLabel: string;
  translatedPageCount: number;
  onFileSelected: (file: File | undefined) => void;
  onGoToPage: (page: number) => void;
};

export function PdfReaderToolbar({
  cacheStatus,
  currentPage,
  fileName,
  isOpening,
  pageCount,
  pdfDocumentLoaded,
  providerLabel,
  translatedPageCount,
  onFileSelected,
  onGoToPage
}: PdfReaderToolbarProps) {
  return (
    <>
      <div className="pdf-workbench-header">
        <div className="panel-heading pdf-heading">
          <FileText size={19} />
          <h2>리더기</h2>
        </div>
        <div className="pdf-badge-row">
          <span className="pill">{providerLabel} 번역</span>
          {translatedPageCount > 0 ? (
            <span className="pill">{translatedPageCount}페이지 번역됨</span>
          ) : null}
          {cacheStatus === "hit" ? <span className="pill cache-pill hit">캐시 적중</span> : null}
          {cacheStatus === "miss" ? (
            <span className="pill cache-pill miss">캐시 없음</span>
          ) : null}
        </div>
      </div>

      <div className="pdf-toolbar">
        <div className="pdf-toolbar-left">
          <label className="file-button pdf-file-button" data-qa="pdf-reader-open-pdf">
            {isOpening ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
            PDF 열기
            <input
              accept="application/pdf"
              data-qa="pdf-reader-file-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                onFileSelected(file);
              }}
            />
          </label>

          {pdfDocumentLoaded ? (
            <div className="pdf-page-controls">
              <button
                aria-label="Previous page"
                className="icon-button"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => onGoToPage(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                aria-label="PDF page"
                className="pdf-page-input"
                max={pageCount}
                min={1}
                type="number"
                value={currentPage}
                onChange={(event) => onGoToPage(Number(event.target.value))}
              />
              <span className="muted compact">/ {pageCount}</span>
              <button
                aria-label="Next page"
                className="icon-button"
                disabled={currentPage >= pageCount}
                type="button"
                onClick={() => onGoToPage(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="pdf-toolbar-meta">
          {fileName ? <span>{fileName}</span> : <span>PDF 없음</span>}
        </div>
      </div>
    </>
  );
}
