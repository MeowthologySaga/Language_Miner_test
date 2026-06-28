import type { CSSProperties } from "react";
import type { PdfPageRect, PdfTextSegment } from "../shared/types";
import type { PdfLayoutTextItem } from "../utils/pdfSegmentation";

export const pdfLayoutExtractionVersion = "transform-bounds-v1";

const segmentHighlightPalette = [
  "236 72 153",
  "14 165 233",
  "34 197 94",
  "245 158 11",
  "168 85 247",
  "20 184 166",
  "99 102 241",
  "244 114 182",
  "132 204 22",
  "249 115 22"
];

type SegmentHighlightStyle = CSSProperties & {
  "--pdf-segment-color": string;
  "--pdf-segment-fill": string;
};

export type PdfTextContentItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

export type PdfTextStyle = {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
};

export type PdfPageViewport = {
  width: number;
  height: number;
  transform: number[];
};

export type PdfTextContent = {
  items: unknown[];
  styles: Record<string, PdfTextStyle>;
};

export type PdfTextLayer = {
  render: () => Promise<unknown>;
  cancel: () => void;
  textDivs: HTMLElement[];
  textContentItemsStr: string[];
};

export type PdfTextLayerConstructor = new (options: {
  textContentSource: PdfTextContent;
  container: HTMLElement;
  viewport: PdfPageViewport;
}) => PdfTextLayer;

export function getSegmentHighlightStyle(segmentIndex: number): SegmentHighlightStyle {
  const color = segmentHighlightPalette[segmentIndex % segmentHighlightPalette.length];
  return {
    "--pdf-segment-color": color,
    "--pdf-segment-fill": color
  };
}

export function getDebugHighlightBounds(bounds: PdfPageRect): PdfPageRect {
  const verticalPad = Math.min(0.0035, Math.max(0.0012, bounds.height * 0.25));
  const horizontalPad = Math.min(0.0025, Math.max(0.0007, bounds.height * 0.1));
  const left = clampPageRatio(bounds.left - horizontalPad);
  const top = clampPageRatio(bounds.top - verticalPad);
  const right = clampPageRatio(bounds.left + bounds.width + horizontalPad);
  const bottom = clampPageRatio(bounds.top + bounds.height + verticalPad * 0.35);

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

export function getDebugSegmentHighlightBounds(segment: PdfTextSegment) {
  const rawBounds = segment.sourceLineBounds?.length
    ? segment.sourceLineBounds
    : segment.sourceBounds
      ? [segment.sourceBounds]
      : [];

  return rawBounds
    .map(getDebugHighlightBounds)
    .filter((bounds) => bounds.width > 0.001 && bounds.height > 0.001);
}

export function clampPageRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function isPdfTextContentItem(item: unknown): item is PdfTextContentItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string" &&
    "transform" in item &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

export function getTextItemBounds(
  item: PdfTextContentItem,
  viewport: PdfPageViewport,
  style?: PdfTextStyle
): PdfPageRect | undefined {
  const transformed = transformPdfMatrix(viewport.transform, item.transform);
  const rawWidth = Math.abs(item.width) || Math.abs(transformed[0]) || 1;
  const fontHeight = Math.hypot(transformed[2], transformed[3]) || Math.abs(item.height) || 1;
  const rawHeight = getTextItemVisualHeight(fontHeight, style);
  const left = transformed[4] / viewport.width;
  const top = getTextItemTop(transformed[5], fontHeight, rawHeight, style) / viewport.height;
  const width = rawWidth / viewport.width;
  const height = rawHeight / viewport.height;

  if (![left, top, width, height].every(Number.isFinite)) {
    return undefined;
  }

  return {
    left: Math.max(0, Math.min(1, left)),
    top: Math.max(0, Math.min(1, top)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height))
  };
}

export function getTextItemTop(
  baselineY: number,
  fontHeight: number,
  visualHeight: number,
  style?: PdfTextStyle
) {
  if (style?.vertical) {
    return baselineY - visualHeight;
  }

  if (isFiniteNumber(style?.ascent)) {
    return baselineY - fontHeight * style.ascent;
  }

  if (isFiniteNumber(style?.descent)) {
    return baselineY - fontHeight * (1 + style.descent);
  }

  return baselineY - visualHeight;
}

export function getTextItemVisualHeight(fontHeight: number, style?: PdfTextStyle) {
  if (style?.vertical) {
    return fontHeight;
  }

  if (isFiniteNumber(style?.ascent) && isFiniteNumber(style?.descent)) {
    return fontHeight * Math.max(0.55, Math.min(1.25, style.ascent - style.descent));
  }

  return fontHeight;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildTransformLayoutItems(
  textContent: PdfTextContent,
  viewport: PdfPageViewport
) {
  const textItems: PdfLayoutTextItem[] = [];

  textContent.items.forEach((item) => {
    if (!isPdfTextContentItem(item)) {
      return;
    }

    const itemText = item.str.replace(/\s+/g, " ").trim();
    const bounds = getTextItemBounds(
      item,
      viewport,
      item.fontName ? textContent.styles[item.fontName] : undefined
    );
    if (!itemText || !bounds) {
      return;
    }

    textItems.push({
      text: itemText,
      bounds
    });
  });

  return textItems;
}

export async function buildTextLayerLayoutItems(
  textContent: PdfTextContent,
  viewport: PdfPageViewport,
  TextLayer: PdfTextLayerConstructor | undefined
): Promise<PdfLayoutTextItem[] | undefined> {
  if (!TextLayer || typeof document === "undefined") {
    return undefined;
  }

  const container = document.createElement("div");
  container.className = "textLayer";
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.style.setProperty("--scale-factor", "1");

  let textLayer: PdfTextLayer | undefined;
  try {
    document.body.appendChild(container);
    textLayer = new TextLayer({
      textContentSource: textContent,
      container,
      viewport
    });
    await textLayer.render();

    const containerRect = container.getBoundingClientRect();
    const layoutItems = textLayer.textDivs.flatMap((textDiv, index) => {
      const itemText = textLayer?.textContentItemsStr[index]?.replace(/\s+/g, " ").trim();
      const rect = textDiv.getBoundingClientRect();
      if (
        !itemText ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        containerRect.width <= 0 ||
        containerRect.height <= 0
      ) {
        return [];
      }

      return [
        {
          text: itemText,
          bounds: {
            left: (rect.left - containerRect.left) / containerRect.width,
            top: (rect.top - containerRect.top) / containerRect.height,
            width: rect.width / containerRect.width,
            height: rect.height / containerRect.height
          }
        }
      ];
    });

    return layoutItems.length ? layoutItems : undefined;
  } catch {
    return undefined;
  } finally {
    textLayer?.cancel();
    container.remove();
  }
}

export function getPdfTextLayerConstructor(source: unknown) {
  const candidate = (source as { TextLayer?: PdfTextLayerConstructor } | undefined)?.TextLayer;
  return typeof candidate === "function" ? candidate : undefined;
}

function transformPdfMatrix(left: number[], right: number[]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}
