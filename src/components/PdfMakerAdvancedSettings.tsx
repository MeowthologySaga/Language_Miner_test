import type { AppSettings } from "../shared/types";

type PdfMakerAdvancedSettingsProps = {
  bypassTranslationCache: boolean;
  pageCount: number;
  pageRangeInput: string;
  settings: AppSettings;
  onBypassTranslationCacheChange: (enabled: boolean) => void;
  onPageRangeInputChange: (value: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onTogglePdfSourceHighlights: () => void;
};

export function PdfMakerAdvancedSettings({
  bypassTranslationCache,
  pageCount,
  pageRangeInput,
  settings,
  onBypassTranslationCacheChange,
  onPageRangeInputChange,
  onSettingsChange,
  onTogglePdfSourceHighlights
}: PdfMakerAdvancedSettingsProps) {
  return (
    <details className="pdf-maker-advanced" data-qa="book-maker-advanced-settings">
      <summary>고급 설정</summary>
      <div className="pdf-maker-advanced-grid">
        <label className="pdf-job-field pdf-range-label">
          <span>페이지 범위</span>
          <input
            className="pdf-range-input"
            data-qa="book-maker-page-range"
            placeholder={pageCount ? `1-${pageCount}` : "PDF 선택 후 사용"}
            value={pageRangeInput}
            onChange={(event) => onPageRangeInputChange(event.target.value)}
          />
        </label>
        <div className="pdf-job-field">
          <span>문서 모드</span>
          <div className="segmented-control compact">
            {(["reading", "paper"] as const).map((exportMode) => (
              <button
                key={exportMode}
                className={settings.pdfExportMode === exportMode ? "active" : ""}
                data-qa={`book-maker-export-mode-${exportMode}`}
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    pdfExportMode: exportMode
                  })
                }
              >
                {exportMode === "reading" ? "일반 문서" : "논문·원문 보존"}
              </button>
            ))}
          </div>
        </div>
        <label className="pdf-maker-toggle">
          <input
            checked={settings.showPdfSourceHighlights}
            data-qa="book-maker-source-highlights"
            type="checkbox"
            onChange={onTogglePdfSourceHighlights}
          />
          <span>원문 박스 표시</span>
        </label>
        <label className="pdf-maker-toggle">
          <input
            checked={bypassTranslationCache}
            data-qa="book-maker-cache-bypass"
            type="checkbox"
            onChange={(event) => onBypassTranslationCacheChange(event.target.checked)}
          />
          <span>캐시 무시하고 다시 번역</span>
        </label>
      </div>
    </details>
  );
}
