import type { PdfPageRect, PdfTextSegment } from "../shared/types";

const defaultMaxSegmentLength = 900;

export function segmentPdfPageText(input: {
  pageNumber: number;
  text: string;
  maxSegmentLength?: number;
}): PdfTextSegment[] {
  const normalizedText = normalizePdfPageText(input.text);
  if (!normalizedText) {
    return [];
  }

  const maxSegmentLength = input.maxSegmentLength ?? defaultMaxSegmentLength;
  const segmentTexts = splitIntoSegmentTexts(normalizedText, maxSegmentLength);

  return segmentTexts.map((text, index) => ({
    id: `p${input.pageNumber}-s${String(index + 1).padStart(3, "0")}-${hashText(text).slice(0, 6)}`,
    pageNumber: input.pageNumber,
    index,
    text
  }));
}

export type PdfSegmentLayoutItem = {
  startOffset: number;
  endOffset: number;
  bounds: PdfPageRect;
};

export type PdfLayoutTextItem = {
  text: string;
  bounds: PdfPageRect;
};

export function buildPdfPageTextFromLayoutItems(items: PdfLayoutTextItem[]) {
  const layoutItems: PdfSegmentLayoutItem[] = [];
  let text = "";
  let previous: PdfLayoutTextItem | undefined;
  let currentLineLeft: number | undefined;

  items.forEach((rawItem) => {
    const itemText = rawItem.text.replace(/\s+/g, " ").trim();
    const bounds = normalizeRect(rawItem.bounds);
    if (!itemText || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const item = { text: itemText, bounds };
    const sameLine = previous ? areItemsOnSameLine(previous.bounds, item.bounds) : false;
    const separator = getTextItemSeparator(previous, item, currentLineLeft);
    if (separator === "dehyphenate") {
      text = text.replace(/-\s*$/, "");
      const lastLayoutItem = layoutItems[layoutItems.length - 1];
      if (lastLayoutItem) {
        lastLayoutItem.endOffset = Math.min(lastLayoutItem.endOffset, text.length);
      }
    } else {
      text += separator;
    }

    const startOffset = text.length;
    text += item.text;
    layoutItems.push({
      startOffset,
      endOffset: text.length,
      bounds: item.bounds
    });
    if (!previous || !sameLine) {
      currentLineLeft = item.bounds.left;
    } else {
      currentLineLeft = Math.min(currentLineLeft ?? item.bounds.left, item.bounds.left);
    }
    previous = item;
  });

  return {
    text,
    layoutItems
  };
}

export function attachSegmentBounds(input: {
  pageText: string;
  segments: PdfTextSegment[];
  layoutItems: PdfSegmentLayoutItem[];
}): PdfTextSegment[] {
  let searchStart = 0;

  return input.segments.map((segment) => {
    const segmentStart = input.pageText.indexOf(segment.text, searchStart);
    if (segmentStart < 0) {
      return segment;
    }

    const segmentEnd = segmentStart + segment.text.length;
    searchStart = segmentEnd;
    const overlappingBounds = input.layoutItems.flatMap((item) => {
      const bounds = getSegmentItemOverlapBounds(item, segmentStart, segmentEnd);
      return bounds ? [bounds] : [];
    });
    const sourceBounds = mergeBounds(overlappingBounds);
    const sourceLineBounds = mergeBoundsByLine(overlappingBounds);

    return sourceBounds ? { ...segment, sourceBounds, sourceLineBounds } : segment;
  });
}

function getSegmentItemOverlapBounds(
  item: PdfSegmentLayoutItem,
  segmentStart: number,
  segmentEnd: number
) {
  const overlapStart = Math.max(item.startOffset, segmentStart);
  const overlapEnd = Math.min(item.endOffset, segmentEnd);
  if (overlapStart >= overlapEnd) {
    return undefined;
  }

  const itemLength = item.endOffset - item.startOffset;
  if (itemLength <= 0) {
    return undefined;
  }

  const startRatio = clamp((overlapStart - item.startOffset) / itemLength, 0, 1);
  const endRatio = clamp((overlapEnd - item.startOffset) / itemLength, startRatio, 1);
  return normalizeRect({
    left: item.bounds.left + item.bounds.width * startRatio,
    top: item.bounds.top,
    width: item.bounds.width * (endRatio - startRatio),
    height: item.bounds.height
  });
}

function mergeBounds(bounds: PdfPageRect[]) {
  if (bounds.length === 0) {
    return undefined;
  }

  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const right = Math.max(...bounds.map((bound) => bound.left + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.top + bound.height));

  return normalizeRect({
    left,
    top,
    width: right - left,
    height: bottom - top
  });
}

function mergeBoundsByLine(bounds: PdfPageRect[]) {
  if (bounds.length === 0) {
    return undefined;
  }

  const sortedBounds = [...bounds].sort((left, right) => {
    const lineDelta = left.top - right.top;
    return Math.abs(lineDelta) > 0.004 ? lineDelta : left.left - right.left;
  });
  const lines: PdfPageRect[][] = [];

  sortedBounds.forEach((bound) => {
    const currentLine = lines[lines.length - 1];
    const previousBound = currentLine?.[currentLine.length - 1];
    if (currentLine && previousBound && areItemsOnSameLine(previousBound, bound)) {
      currentLine.push(bound);
      return;
    }

    lines.push([bound]);
  });

  return lines.flatMap((line) => {
    const merged = mergeBounds(line);
    return merged ? [merged] : [];
  });
}

function normalizeRect(rect: PdfPageRect): PdfPageRect {
  const left = clamp(rect.left, 0, 1);
  const top = clamp(rect.top, 0, 1);
  const right = clamp(rect.left + rect.width, 0, 1);
  const bottom = clamp(rect.top + rect.height, 0, 1);

  return {
    left: roundRectNumber(left),
    top: roundRectNumber(top),
    width: roundRectNumber(Math.max(0, right - left)),
    height: roundRectNumber(Math.max(0, bottom - top))
  };
}

function normalizePdfPageText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/-\n\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitIntoSegmentTexts(text: string, maxSegmentLength: number) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs.flatMap((paragraph) =>
      groupTextUnits(splitLongParagraph(paragraph, maxSegmentLength), maxSegmentLength)
    );
  }

  return groupTextUnits(
    splitLongParagraph(text.replace(/\s+/g, " ").trim(), maxSegmentLength),
    maxSegmentLength
  );
}

function splitLongParagraph(text: string, maxSegmentLength: number) {
  if (text.length <= maxSegmentLength) {
    return [text];
  }

  return text
    .split(/(?<=[.!?。！？])\s+(?=["“‘'(\[]?[A-Z0-9가-힣])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function groupTextUnits(units: string[], maxSegmentLength: number) {
  const segments: string[] = [];
  let current = "";

  units.forEach((unit) => {
    if (!current) {
      current = unit;
      return;
    }

    if (`${current} ${unit}`.length <= maxSegmentLength) {
      current = `${current} ${unit}`;
      return;
    }

    segments.push(current);
    current = unit;
  });

  if (current) {
    segments.push(current);
  }

  return segments.flatMap((segment) => splitOversizedSegment(segment, maxSegmentLength));
}

function splitOversizedSegment(segment: string, maxSegmentLength: number) {
  if (segment.length <= maxSegmentLength) {
    return [segment];
  }

  const chunks: string[] = [];
  for (let start = 0; start < segment.length; start += maxSegmentLength) {
    chunks.push(segment.slice(start, start + maxSegmentLength).trim());
  }
  return chunks.filter(Boolean);
}

function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundRectNumber(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getTextItemSeparator(
  previous: PdfLayoutTextItem | undefined,
  current: PdfLayoutTextItem,
  previousLineLeft: number | undefined
) {
  if (!previous) {
    return "";
  }

  if (areItemsOnSameLine(previous.bounds, current.bounds)) {
    return shouldInsertTextSpace(previous.text, current.text) ? " " : "";
  }

  if (shouldDehyphenateLineBreak(previous.text, current.text)) {
    return "dehyphenate";
  }

  return isParagraphBreak(previous, current, previousLineLeft) ? "\n\n" : " ";
}

function areItemsOnSameLine(previous: PdfPageRect, current: PdfPageRect) {
  const previousCenter = previous.top + previous.height / 2;
  const currentCenter = current.top + current.height / 2;
  const tolerance = Math.max((previous.height + current.height) * 0.35, 0.006);
  return Math.abs(previousCenter - currentCenter) <= tolerance;
}

function isParagraphBreak(
  previous: PdfLayoutTextItem,
  current: PdfLayoutTextItem,
  previousLineLeft: number | undefined
) {
  const verticalDelta = current.bounds.top - previous.bounds.top;
  if (verticalDelta < -0.04) {
    return true;
  }

  if (verticalDelta > Math.max(previous.bounds.height * 1.8, 0.026)) {
    return true;
  }

  return isIndentedParagraphStart(previous, current, previousLineLeft);
}

function isIndentedParagraphStart(
  previous: PdfLayoutTextItem,
  current: PdfLayoutTextItem,
  previousLineLeft: number | undefined
) {
  if (previousLineLeft === undefined || !endsLikeParagraph(previous.text)) {
    return false;
  }

  const lineHeight = Math.max(previous.bounds.height, current.bounds.height);
  const verticalDelta = current.bounds.top - previous.bounds.top;
  if (verticalDelta < lineHeight * 0.55 || verticalDelta > lineHeight * 1.9) {
    return false;
  }

  return current.bounds.left - previousLineLeft > Math.max(0.018, lineHeight * 0.55);
}

function endsLikeParagraph(text: string) {
  return /[.!?。！？:;)"'”’]$/.test(text.trim());
}

function shouldDehyphenateLineBreak(previousText: string, currentText: string) {
  return /[A-Za-z]-$/.test(previousText) && /^[A-Za-z]/.test(currentText);
}

function shouldInsertTextSpace(previousText: string, currentText: string) {
  return !/^[,.;:!?)]/.test(currentText) && !/[(]$/.test(previousText);
}
