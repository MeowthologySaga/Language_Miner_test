import type { PdfPageRect } from "./types";

type PdfHighlightSourceSegment = {
  id: string;
  sourceBounds?: PdfPageRect;
  sourceLineBounds?: PdfPageRect[];
};

export type PdfPageHighlight = {
  id: string;
  index: number;
  bounds: PdfPageRect;
};

type HighlightRowItem = {
  id: string;
  rect: PdfPageRect;
};

type HighlightRow = {
  items: HighlightRowItem[];
  top: number;
  bottom: number;
  center: number;
  height: number;
};

type HighlightRowLayout = {
  row: HighlightRow;
  top: number;
  height: number;
};

const highlightGap = 0.003;
const horizontalMergeGap = 0.0025;
const minHighlightHeight = 0.004;
const maxHighlightHeight = 0.034;
const minHighlightWidth = 0.004;
const maxHighlightLift = 0.012;
const highlightLiftRatio = 0.55;

export function buildSafePdfPageHighlights(
  segments: PdfHighlightSourceSegment[]
): PdfPageHighlight[] {
  const rows = buildHighlightRows(
    segments
      .flatMap((segment) => {
        const rawBounds = segment.sourceLineBounds?.length
          ? segment.sourceLineBounds
          : segment.sourceBounds
            ? [segment.sourceBounds]
            : [];

        return rawBounds.flatMap((bounds) => {
          const normalized = normalizePageRect(bounds);
          return normalized ? [{ id: segment.id, rect: normalized }] : [];
        });
      })
      .sort(
        (left, right) =>
          left.rect.top - right.rect.top || left.rect.left - right.rect.left
      )
  );

  return layoutHighlightRows(rows).flatMap((layout) => {
    if (layout.height < minHighlightHeight) {
      return [];
    }

    return mergeRowItems(layout.row.items).flatMap((item, itemIndex) => {
      const left = clamp(item.left, 0, 1);
      const right = clamp(item.right, left, 1);
      if (right - left < minHighlightWidth) {
        return [];
      }

      return [
        {
          id: item.ids.join(","),
          index: itemIndex,
          bounds: {
            left: roundHighlightNumber(left),
            top: roundHighlightNumber(layout.top),
            width: roundHighlightNumber(right - left),
            height: roundHighlightNumber(layout.height)
          }
        }
      ];
    });
  });
}

function layoutHighlightRows(rows: HighlightRow[]): HighlightRowLayout[] {
  const layouts = rows
    .map((row) => {
      const height = clamp(
        Math.min(row.bottom - row.top, row.height, maxHighlightHeight),
        0,
        maxHighlightHeight
      );
      if (height < minHighlightHeight) {
        return undefined;
      }

      return {
        row,
        top: getPreferredRowTop(row, height),
        height
      };
    })
    .filter((layout): layout is HighlightRowLayout => Boolean(layout));

  for (let index = 1; index < layouts.length; index += 1) {
    const previous = layouts[index - 1];
    layouts[index].top = Math.max(layouts[index].top, previous.top + previous.height + highlightGap);
  }

  for (let index = layouts.length - 1; index >= 0; index -= 1) {
    const next = layouts[index + 1];
    const bottomLimit = next ? next.top - highlightGap : 1;
    layouts[index].top = clamp(layouts[index].top, 0, bottomLimit - layouts[index].height);
  }

  return layouts.filter((layout) => layout.top + layout.height <= 1);
}

function getPreferredRowTop(row: HighlightRow, height: number) {
  const lift = Math.min(row.height * highlightLiftRatio, maxHighlightLift);
  return clamp(row.top - lift, 0, 1 - height);
}

function buildHighlightRows(items: HighlightRowItem[]) {
  const rows: HighlightRow[] = [];

  items.forEach((item) => {
    const currentRow = rows[rows.length - 1];
    if (currentRow && areRectsOnSameHighlightRow(currentRow, item.rect)) {
      currentRow.items.push(item);
      currentRow.top = Math.min(currentRow.top, item.rect.top);
      currentRow.bottom = Math.max(currentRow.bottom, item.rect.top + item.rect.height);
      currentRow.height = Math.max(currentRow.height, item.rect.height);
      currentRow.center = currentRow.top + (currentRow.bottom - currentRow.top) / 2;
      return;
    }

    rows.push({
      items: [item],
      top: item.rect.top,
      bottom: item.rect.top + item.rect.height,
      center: item.rect.top + item.rect.height / 2,
      height: item.rect.height
    });
  });

  return rows;
}

function mergeRowItems(items: HighlightRowItem[]) {
  const merged: Array<{ left: number; right: number; ids: string[] }> = [];

  items
    .map((item) => ({
      left: item.rect.left,
      right: item.rect.left + item.rect.width,
      ids: [item.id]
    }))
    .sort((left, right) => left.left - right.left)
    .forEach((item) => {
      const previous = merged[merged.length - 1];
      if (previous && item.left <= previous.right + horizontalMergeGap) {
        previous.right = Math.max(previous.right, item.right);
        item.ids.forEach((id) => {
          if (!previous.ids.includes(id)) {
            previous.ids.push(id);
          }
        });
        return;
      }

      merged.push({ ...item });
    });

  return merged;
}

function areRectsOnSameHighlightRow(row: HighlightRow, rect: PdfPageRect) {
  const rectCenter = rect.top + rect.height / 2;
  const tolerance = Math.max(Math.min(row.height, rect.height) * 0.45, 0.006);
  return Math.abs(row.center - rectCenter) <= tolerance;
}

function normalizePageRect(rect: PdfPageRect) {
  const left = clamp(rect.left, 0, 1);
  const top = clamp(rect.top, 0, 1);
  const right = clamp(rect.left + rect.width, 0, 1);
  const bottom = clamp(rect.top + rect.height, 0, 1);
  const width = right - left;
  const height = bottom - top;

  if (
    ![left, top, width, height].every(Number.isFinite) ||
    width < minHighlightWidth ||
    height <= 0
  ) {
    return undefined;
  }

  return {
    left: roundHighlightNumber(left),
    top: roundHighlightNumber(top),
    width: roundHighlightNumber(width),
    height: roundHighlightNumber(height)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundHighlightNumber(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
