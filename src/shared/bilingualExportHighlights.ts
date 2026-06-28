import type { BilingualPdfExportInput, PdfPageRect } from "./types";
import {
  areRectsOnSameSourceLine,
  clamp,
  expandSourceHighlightRect,
  hasSourceRectHorizontalOverlap,
  mergeSourceBounds,
  minSourceHighlightHeight,
  minSourceHighlightWidth,
  normalizeSourceRect,
  roundLayoutNumber,
  sourceHighlightGap,
  sourceHighlightHorizontalPadding,
  sourceHighlightLineVerticalPadding,
  sourceHighlightVerticalPadding
} from "./bilingualExportGeometry";
import {
  getBilingualSegmentColor,
  getBilingualSegmentColorIndexMap
} from "./bilingualExportPalette";

type ExportPage = BilingualPdfExportInput["pages"][number];
type ExportSegment = ExportPage["segments"][number];
type SegmentBounds = NonNullable<ExportSegment["sourceBounds"]>;

type SourceHighlight = {
  id: string;
  rect: SegmentBounds;
  colorIndex: number;
  lineFragment: boolean;
};

type SourceLineHighlight = {
  id: string;
  rect: SegmentBounds;
  colorIndex: number;
  lineIndex: number;
  sharedLine: boolean;
};

export type BilingualSourceHighlight = {
  id: string;
  rect: PdfPageRect;
  colorIndex: number;
  border: string;
  background: string;
};

export function getBilingualSourceHighlightsForPage(page: ExportPage): BilingualSourceHighlight[] {
  return buildSourceHighlights(
    page.segments,
    getBilingualSegmentColorIndexMap(page.segments)
  ).map((highlight) => {
    const color = getBilingualSegmentColor(highlight.colorIndex);
    return {
      id: highlight.id,
      rect: highlight.rect,
      colorIndex: highlight.colorIndex,
      border: color.border,
      background: color.background
    };
  });
}

function buildSourceHighlights(
  segments: ExportPage["segments"],
  colorIndexBySegment = getBilingualSegmentColorIndexMap(segments)
): SourceHighlight[] {
  const lineHighlights = segments.flatMap((segment, segmentIndex) => {
    const colorIndex = colorIndexBySegment.get(segment.id) ?? segmentIndex;
    return getSourceHighlightLineBounds(segment).map((rect, lineIndex) => ({
      id: segment.id,
      rect,
      colorIndex,
      lineIndex,
      sharedLine: false
    }));
  });

  markSharedSourceLines(lineHighlights);

  const highlights = segments.flatMap((segment, segmentIndex) => {
    const segmentLines = lineHighlights
      .filter((line) => line.id === segment.id)
      .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
    const colorIndex = colorIndexBySegment.get(segment.id) ?? segmentIndex;
    const output: SourceHighlight[] = [];
    let currentGroup: SourceLineHighlight[] = [];

    const flushGroup = () => {
      if (currentGroup.length === 0) {
        return;
      }

      const rect = mergeSourceBounds(currentGroup.map((line) => line.rect));
      if (rect) {
        output.push({
          id: segment.id,
          rect: expandSourceHighlightRect(
            rect,
            sourceHighlightHorizontalPadding,
            sourceHighlightVerticalPadding
          ),
          colorIndex,
          lineFragment: false
        });
      }
      currentGroup = [];
    };

    segmentLines.forEach((line) => {
      if (line.sharedLine) {
        flushGroup();
        output.push({
          id: segment.id,
          rect: expandSourceHighlightRect(
            line.rect,
            sourceHighlightHorizontalPadding,
            sourceHighlightLineVerticalPadding
          ),
          colorIndex,
          lineFragment: true
        });
        return;
      }

      currentGroup.push(line);
    });

    flushGroup();
    return output;
  });

  return resolveSourceHighlightCollisions(highlights);
}

function getSourceHighlightLineBounds(segment: ExportSegment) {
  const rawBounds =
    segment.sourceLineBounds?.length
      ? segment.sourceLineBounds
      : segment.sourceBounds
        ? [segment.sourceBounds]
        : [];

  return rawBounds
    .map((rect) => normalizeSourceRect(rect))
    .filter((rect): rect is SegmentBounds => Boolean(rect))
    .sort((left, right) => left.top - right.top || left.left - right.left);
}

function markSharedSourceLines(lines: SourceLineHighlight[]) {
  const rows: SourceLineHighlight[][] = [];

  [...lines]
    .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left)
    .forEach((line) => {
      const row = rows[rows.length - 1];
      if (row && areRectsOnSameSourceLine(row[0].rect, line.rect)) {
        row.push(line);
        return;
      }

      rows.push([line]);
    });

  rows.forEach((row) => {
    const sortedRow = [...row].sort((left, right) => left.rect.left - right.rect.left);
    for (let index = 1; index < sortedRow.length; index += 1) {
      const previous = sortedRow[index - 1];
      const current = sortedRow[index];
      const previousRight = previous.rect.left + previous.rect.width;
      const currentRight = current.rect.left + current.rect.width;
      const gap = current.rect.left - previousRight;
      const sameLineSplit =
        previous.id !== current.id &&
        currentRight > previous.rect.left &&
        gap < Math.max(0.04, Math.min(previous.rect.width, current.rect.width) * 0.25);

      if (sameLineSplit) {
        previous.sharedLine = true;
        current.sharedLine = true;
      }
    }
  });
}

function resolveSourceHighlightCollisions(highlights: SourceHighlight[]) {
  const resolved = highlights.map((highlight) => ({
    ...highlight,
    rect: { ...highlight.rect }
  }));

  resolveSameLineSourceHighlightCollisions(resolved);
  resolveVerticalSourceHighlightCollisions(resolved);

  return resolved
    .flatMap((highlight): SourceHighlight[] => {
      const rect = normalizeSourceRect(highlight.rect);
      if (!rect) {
        return [];
      }

      return [{ ...highlight, rect }];
    })
    .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
}

function resolveSameLineSourceHighlightCollisions(highlights: SourceHighlight[]) {
  const lineFragments = highlights.filter((highlight) => highlight.lineFragment);
  const rows: SourceHighlight[][] = [];

  lineFragments
    .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left)
    .forEach((highlight) => {
      const row = rows[rows.length - 1];
      if (row && areRectsOnSameSourceLine(row[0].rect, highlight.rect)) {
        row.push(highlight);
        return;
      }

      rows.push([highlight]);
    });

  rows.forEach((row) => {
    const sortedRow = row.sort((left, right) => left.rect.left - right.rect.left);
    for (let index = 1; index < sortedRow.length; index += 1) {
      const previous = sortedRow[index - 1];
      const current = sortedRow[index];
      if (previous.id === current.id) {
        continue;
      }

      const previousRight = previous.rect.left + previous.rect.width;
      const currentRight = current.rect.left + current.rect.width;
      if (current.rect.left >= previousRight + sourceHighlightGap) {
        continue;
      }

      const boundary = clamp(
        (previousRight + current.rect.left) / 2,
        previous.rect.left + minSourceHighlightWidth,
        currentRight - minSourceHighlightWidth
      );
      const previousNewRight = boundary - sourceHighlightGap / 2;
      const currentNewLeft = boundary + sourceHighlightGap / 2;
      if (
        previousNewRight <= previous.rect.left + minSourceHighlightWidth ||
        currentNewLeft >= currentRight - minSourceHighlightWidth
      ) {
        continue;
      }

      previous.rect.width = roundLayoutNumber(previousNewRight - previous.rect.left);
      current.rect.left = roundLayoutNumber(currentNewLeft);
      current.rect.width = roundLayoutNumber(currentRight - current.rect.left);
    }
  });
}

function resolveVerticalSourceHighlightCollisions(highlights: SourceHighlight[]) {
  const sorted = highlights.sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = sorted[previousIndex];
      if (current.rect.top - (previous.rect.top + previous.rect.height) > sourceHighlightGap * 3) {
        break;
      }

      if (!hasSourceRectHorizontalOverlap(previous.rect, current.rect)) {
        continue;
      }

      const previousBottom = previous.rect.top + previous.rect.height;
      if (current.rect.top >= previousBottom + sourceHighlightGap) {
        continue;
      }

      const currentBottom = current.rect.top + current.rect.height;
      const boundary = clamp(
        (previousBottom + current.rect.top) / 2,
        previous.rect.top + minSourceHighlightHeight,
        currentBottom - minSourceHighlightHeight
      );
      const previousNewBottom = boundary - sourceHighlightGap / 2;
      const currentNewTop = boundary + sourceHighlightGap / 2;

      if (
        previousNewBottom > previous.rect.top + minSourceHighlightHeight &&
        currentBottom > currentNewTop + minSourceHighlightHeight
      ) {
        previous.rect.height = roundLayoutNumber(previousNewBottom - previous.rect.top);
        current.rect.top = roundLayoutNumber(currentNewTop);
        current.rect.height = roundLayoutNumber(currentBottom - current.rect.top);
      }
    }
  }
}
