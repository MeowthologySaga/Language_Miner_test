import type { PdfSegmentTranslation, PdfTextSegment } from "../shared/types";
import { getSegmentHighlightStyle } from "./pdfLayoutExtraction";

type PdfTranslationSegmentListProps = {
  segments: PdfTextSegment[];
  translations: PdfSegmentTranslation[];
};

export function PdfTranslationSegmentList({
  segments,
  translations
}: PdfTranslationSegmentListProps) {
  return (
    <div className="pdf-translation-segments" tabIndex={0}>
      {segments.length ? (
        segments.map((segment, segmentIndex) => {
          const translation = translations.find((candidate) => candidate.id === segment.id);
          const segmentStyle = getSegmentHighlightStyle(segmentIndex);
          return (
            <article
              className={`pdf-segment-card${segment.sourceBounds ? " layout-mapped" : ""}`}
              key={segment.id}
              style={segmentStyle}
            >
              <div className="pdf-segment-meta">
                <span className="pdf-segment-title">
                  <span aria-hidden="true" className="pdf-segment-index">
                    {segmentIndex + 1}
                  </span>
                  <span className="pdf-segment-id">{segment.id}</span>
                </span>
                <span className="pdf-segment-badges">
                  {segment.sourceBounds ? <span className="layout-dot">위치 매핑</span> : null}
                  {translation?.cacheStatus ? (
                    <span className={`cache-dot ${translation.cacheStatus}`}>
                      {translation.cacheStatus === "hit" ? "캐시" : "신규"}
                    </span>
                  ) : null}
                </span>
              </div>
              <p className="pdf-segment-source">{segment.text}</p>
              <p className="pdf-segment-translation">
                {translation?.translationKo ?? "아직 번역되지 않았습니다."}
              </p>
            </article>
          );
        })
      ) : (
        <div className="pdf-translation-placeholder">번역 세그먼트가 여기에 표시됩니다.</div>
      )}
    </div>
  );
}
