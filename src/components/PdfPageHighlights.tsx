import type { PdfTextSegment } from "../shared/types";
import {
  getDebugSegmentHighlightBounds,
  getSegmentHighlightStyle
} from "./pdfLayoutExtraction";

type PdfPageHighlightsProps = {
  segments: PdfTextSegment[];
};

export function PdfPageHighlights({ segments }: PdfPageHighlightsProps) {
  return (
    <>
      {segments.flatMap((segment, segmentIndex) => {
        const segmentStyle = getSegmentHighlightStyle(segmentIndex);
        return getDebugSegmentHighlightBounds(segment).map((bounds, highlightIndex) => (
          <span
            aria-hidden="true"
            className={`pdf-page-highlight segment${bounds.left < 0.055 ? " edge-start" : ""}`}
            key={`${segment.id}-${highlightIndex}`}
            style={{
              ...segmentStyle,
              left: `${bounds.left * 100}%`,
              top: `${bounds.top * 100}%`,
              width: `${bounds.width * 100}%`,
              height: `${bounds.height * 100}%`
            }}
            title={`${segmentIndex + 1}. ${segment.text}`}
          >
            {highlightIndex === 0 ? (
              <span className="pdf-page-highlight-label">{segmentIndex + 1}</span>
            ) : null}
          </span>
        ));
      })}
    </>
  );
}
