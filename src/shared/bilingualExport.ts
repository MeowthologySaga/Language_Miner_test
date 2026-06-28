import type { BilingualPdfExportInput, PdfPageRect } from "./types";
import {
  clamp,
  expandSourceHighlightRect,
  mergeSourceBounds,
  minSourceHighlightHeight,
  minSourceHighlightWidth,
  normalizeSourceRect,
  roundLayoutNumber,
  sourceHighlightHorizontalPadding,
  sourceHighlightVerticalPadding
} from "./bilingualExportGeometry";
import { getBilingualSourceHighlightsForPage } from "./bilingualExportHighlights";
import {
  getBilingualSegmentColorIndexMap,
  renderBilingualSegmentColorStyle
} from "./bilingualExportPalette";

export { getBilingualSourceHighlightsForPage } from "./bilingualExportHighlights";
export type { BilingualSourceHighlight } from "./bilingualExportHighlights";

type ExportPage = BilingualPdfExportInput["pages"][number];
type ExportSegment = ExportPage["segments"][number];
type ExportMode = NonNullable<BilingualPdfExportInput["exportMode"]>;
type SegmentBounds = NonNullable<ExportSegment["sourceBounds"]>;

type PaperPreservationCandidate = {
  sourceText?: string;
  text?: string;
  sourceBounds?: PdfPageRect;
  sourceLineBounds?: PdfPageRect[];
};

type TranslatedFlowBlock = {
  segment: ExportSegment;
  rect: SegmentBounds;
  fontSize: number;
  textIndentPt: number;
  role: "heading" | "body";
  colorIndex: number;
};

type PaperSourceSnippetBlock = {
  segment: ExportSegment;
  rect: SegmentBounds;
  sourceRect: SegmentBounds;
  colorIndex: number;
};

export type BilingualDocumentPageMapEntry = {
  kind: "cover" | "source" | "continuation";
  sourcePageNumber?: number;
};

type LayoutColumn = {
  left: number;
  right: number;
  nextTop: number;
};

const defaultSourcePageWidth = 612;
const defaultSourcePageHeight = 792;
const translatedBlockGap = 0.006;
const translatedBlockMinHeight = 0.026;
const translatedPagePadding = 0.018;
const minBodyFontSizePt = 9.4;
const paperMinBodyFontSizePt = 8.6;
const translatedBlockHorizontalPaddingPt = 9;
const translatedBlockVerticalPaddingPt = 7;
const paperTranslatedBlockHorizontalPaddingPt = 5.9;
const paperTranslatedBlockVerticalPaddingPt = 3.1;
const translatedBodyLineHeight = 1.31;
const translatedHeadingLineHeight = 1.18;
const paperTranslatedBodyLineHeight = 1.22;
const paperTranslatedHeadingLineHeight = 1.12;
const fullWidthLayoutAnchorWidth = 0.58;
const multiColumnCenterGap = 0.28;

export function buildBilingualDocumentHtml(input: BilingualPdfExportInput) {
  const documentPageSize = getDocumentPageSize(input);
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      @page {
        size: ${formatPt(documentPageSize.width * 2)} ${formatPt(documentPageSize.height)};
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #151817;
        font-family: "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
        font-size: 10.5pt;
        line-height: 1.5;
      }

      .cover {
        break-after: page;
        border-bottom: 1px solid #d7dce0;
        margin-bottom: 16px;
        padding-bottom: 12px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 22px;
        line-height: 1.25;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        color: #66707a;
      }

      .page {
        break-after: page;
        width: var(--spread-page-width);
        height: var(--source-page-height);
        min-height: 0;
        overflow: hidden;
      }

      .page:last-child {
        break-after: auto;
      }

      .page-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0 0 3mm;
        color: #6b7280;
        font-size: 9px;
        font-weight: 700;
      }

      .page-layout {
        display: grid;
        grid-template-columns: var(--source-page-width) var(--source-page-width);
        gap: 0;
        align-items: start;
        width: var(--spread-page-width);
        height: var(--source-page-height);
      }

      .source-page,
      .translated-page-column {
        min-width: 0;
        height: var(--source-page-height);
      }

      .source-page {
        background: #fff;
      }

      .translated-page-column {
        background: #fff;
      }

      .page-column-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #5f6b76;
        font-size: 9px;
        font-weight: 700;
        margin-bottom: 2mm;
        text-transform: uppercase;
      }

      .source-page-frame,
      .translated-page-frame {
        position: relative;
        width: var(--source-page-width);
        height: var(--source-page-height);
      }

      .source-page-frame.chromeless,
      .translated-page-frame.chromeless {
        margin-top: 0;
      }

      .source-page img {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        object-fit: contain;
      }

      .source-highlight {
        position: absolute;
        border: 1px solid var(--segment-color, rgba(236, 72, 153, 0.72));
        background: var(--segment-bg, rgba(236, 72, 153, 0.12));
        border-radius: 2px;
        pointer-events: none;
      }

      .translated-page-frame {
        overflow: hidden;
        border: 0;
        background: #fff;
        color: #111;
      }

      .translated-flow-layer {
        position: absolute;
        inset: 0;
      }

      .paper-source-snippet-layer {
        position: absolute;
        inset: 0;
      }

      .paper-source-snippet {
        position: absolute;
        overflow: hidden;
        border: 1pt solid var(--segment-color, rgba(15, 23, 42, 0.35));
        border-radius: 3pt;
        background: #fff;
        box-shadow: inset 0 0 0 0.75pt rgba(255, 255, 255, 0.8);
      }

      .paper-source-snippet img {
        position: absolute;
        display: block;
        max-width: none;
        width: var(--clip-page-width);
        height: var(--clip-page-height);
        left: var(--clip-left);
        top: var(--clip-top);
      }

      .translated-flow-block {
        position: absolute;
        overflow: hidden;
        background: var(--segment-bg, transparent);
        border-left: 2.5pt solid var(--segment-color, transparent);
        box-shadow: inset 0 0 0 0.75pt var(--segment-color, transparent);
        border-radius: 3pt;
        color: #111;
        line-height: 1.31;
        padding: 2pt 4pt 2.5pt 5pt;
        white-space: pre-wrap;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }

      .translated-flow-block.heading {
        color: #111;
        font-weight: 700;
        line-height: 1.18;
      }

      .page.paper-export .translated-flow-block {
        border-left-width: 2pt;
        box-shadow: inset 0 0 0 0.6pt var(--segment-color, transparent);
        border-radius: 2pt;
        line-height: 1.22;
        padding: 1.2pt 2.7pt 1.5pt 3.2pt;
      }

      .page.paper-export .translated-flow-block.heading {
        line-height: 1.12;
        padding: 1.1pt 2.6pt 1.4pt 3.1pt;
      }

      .page.with-chrome {
        width: auto;
        height: auto;
        min-height: 197mm;
        padding: 6mm;
      }

      .page.with-chrome .page-layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 6mm;
        width: auto;
        height: auto;
      }

      .page.with-chrome .source-page,
      .page.with-chrome .translated-page-column,
      .page.with-chrome .source-page-frame,
      .page.with-chrome .translated-page-frame {
        width: auto;
        height: auto;
      }

      .page.with-chrome .source-page img {
        height: auto;
        border: 1px solid #e5e7eb;
      }

      .page.with-chrome .translated-page-frame {
        border: 1px solid #e5e7eb;
      }

      .empty-translated-page,
      .empty-segment-page {
        color: #7b8792;
        font-size: 11px;
        text-align: center;
      }

      .empty-translated-page {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .empty-segment-page {
        border: 1px dashed #d7dce0;
        border-radius: 7px;
        padding: 24px;
      }

      .translated-overflow-title {
        margin: 0 0 5px;
        color: #68737d;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .continuation-page .page-layout {
        align-items: stretch;
      }

      .continuation-source-placeholder {
        display: grid;
        height: var(--source-page-height);
        min-height: 0;
        place-items: center;
        border: 1px solid transparent;
        background: #fff;
        color: #9ca3af;
        padding: 12mm;
        text-align: center;
      }

      .continuation-source-placeholder strong {
        display: block;
        margin-bottom: 4px;
        color: #303942;
        font-size: 12px;
      }

      .continuation-translations {
        display: grid;
        align-content: start;
        gap: 7px;
        height: var(--source-page-height);
        min-height: 0;
        overflow: hidden;
        border: 1px solid #e5e7eb;
        background: #fff;
        padding: 8mm;
      }

      .continuation-translations .translation-row {
        border: 1px solid #dfe4e8;
        border-radius: 6px;
        background: #fff;
        padding: 6px;
      }

      .continuation-source-placeholder.chromeless,
      .continuation-translations.chromeless {
        border-color: transparent;
        padding: 0;
      }

      .continuation-translations.chromeless {
        gap: 8px;
      }

      .continuation-translations.chromeless .translation-row {
        border: 0;
        border-left: 2.5pt solid var(--segment-color, transparent);
        border-radius: 3pt;
        background: var(--segment-bg, transparent);
        box-shadow: inset 0 0 0 0.75pt var(--segment-color, transparent);
        padding: 3pt 4pt 3pt 5pt;
      }

      .continuation-translations.chromeless .translation-row .text {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 11;
      }

      .translation-panel {
        min-width: 0;
      }

      .translation-row {
        border-bottom: 1px solid #e5e9ed;
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 7px;
        padding: 0 0 7px;
      }

      .translation-row:last-child {
        border-bottom: 0;
        margin-bottom: 0;
      }

      .translation-row.chromeless {
        border-bottom: 0;
        margin-bottom: 0;
        padding: 3pt 4pt 3pt 5pt;
        background: var(--segment-bg, transparent);
        border-left: 2.5pt solid var(--segment-color, transparent);
        box-shadow: inset 0 0 0 0.75pt var(--segment-color, transparent);
        border-radius: 3pt;
      }

      .translation-row .label {
        margin-bottom: 3px;
      }

      .source-snippet {
        color: #68737d;
        font-size: 9.5px;
        margin-bottom: 3px;
        max-height: 34px;
        overflow: hidden;
      }

      .segment {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        border: 1px solid #dfe4e8;
        border-radius: 7px;
        margin-bottom: 8px;
        page-break-inside: avoid;
        break-inside: avoid;
        padding: 8px;
      }

      .cell {
        min-width: 0;
      }

      .label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #7b8792;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0;
        margin-bottom: 4px;
        text-transform: uppercase;
      }

      .text {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .translation {
        color: #111827;
        font-size: 11.5px;
      }
    </style>
  </head>
  <body>
    ${input.includeCoverPage ? renderCoverPage(input) : ""}
    ${input.pages.map((page) => renderPage(page, input)).join("")}
  </body>
</html>`;
}

export function getBilingualDocumentStats(input: BilingualPdfExportInput) {
  return {
    pageCount: getBilingualDocumentPageMap(input).length,
    segmentCount: input.pages.reduce((sum, page) => sum + page.segments.length, 0)
  };
}

export function getBilingualDocumentPageMap(input: BilingualPdfExportInput) {
  const entries: BilingualDocumentPageMapEntry[] = [];
  if (input.includeCoverPage) {
    entries.push({ kind: "cover" });
  }

  input.pages.forEach((page) => {
    entries.push({ kind: "source", sourcePageNumber: page.pageNumber });
    if (!page.sourcePageImageDataUrl) {
      return;
    }

    const translatedLayout = createTranslatedPageLayout(page, input);
    chunkContinuationSegments(translatedLayout.overflowSegments).forEach(() => {
      entries.push({ kind: "continuation", sourcePageNumber: page.pageNumber });
    });
  });

  return entries;
}

function renderCoverPage(input: BilingualPdfExportInput) {
  const segmentCount = input.pages.reduce((sum, page) => sum + page.segments.length, 0);
  const generatedAt = new Date().toLocaleString();

  return `<section class="cover">
      <h1>${escapeHtml(input.title)}</h1>
      <div class="meta">
        <span>${escapeHtml(input.sourceLanguageLabel)} &rarr; ${escapeHtml(input.targetLanguageLabel)}</span>
        <span>${input.pages.length} pages</span>
        <span>${segmentCount} segments</span>
        <span>${escapeHtml(generatedAt)}</span>
      </div>
    </section>`;
}

function renderPage(page: BilingualPdfExportInput["pages"][number], input: BilingualPdfExportInput) {
  if (page.sourcePageImageDataUrl) {
    const translatedLayout = createTranslatedPageLayout(page, input);
    return `<section class="${renderPageClass(input)}" style="${renderPageSpreadStyle(page)}">
    ${renderPageTitle(page, input)}
    <div class="page-layout">
      <div class="source-page">
        ${renderColumnLabel(input.sourceLanguageLabel, "original", input)}
        <div class="source-page-frame${input.showPageChrome ? "" : " chromeless"}">
          ${
            input.omitSourceColumnContent
              ? ""
              : `<img src="${escapeHtml(page.sourcePageImageDataUrl)}" alt="Original page ${page.pageNumber}" />
          ${input.showSourceHighlights ? renderSourceHighlights(page) : ""}`
          }
        </div>
      </div>
      <div class="translated-page-column">
        ${renderColumnLabel(input.targetLanguageLabel, "translated layout", input)}
        <div class="translated-page-frame${input.showPageChrome ? "" : " chromeless"}" style="${renderPageAspectRatioStyle(page)}">
          ${
            translatedLayout.blocks.length || translatedLayout.sourceSnippets.length
              ? `${renderPaperSourceSnippets(translatedLayout.sourceSnippets, page)}${renderTranslatedBlocks(translatedLayout.blocks, input)}`
              : renderEmptyTranslatedPage(translatedLayout.overflowSegments.length > 0)
          }
        </div>
      </div>
    </div>
  </section>${renderContinuationPages(page, input, translatedLayout.overflowSegments)}`;
  }

  return `<section class="${renderPageClass(input)}" style="${renderPageSpreadStyle(page)}">
    ${renderPageTitle(page, input)}
    ${
      page.segments.length
        ? page.segments
            .map(
              (segment) => `<article class="segment">
      <div class="cell">
        <div class="label">
          <span>${escapeHtml(input.sourceLanguageLabel)}</span>
          <span>${escapeHtml(segment.id)}</span>
        </div>
        <div class="text">${escapeHtml(segment.sourceText)}</div>
      </div>
      <div class="cell">
        <div class="label">
          <span>${escapeHtml(input.targetLanguageLabel)}</span>
        </div>
        <div class="text translation">${escapeHtml(segment.translationText)}</div>
      </div>
    </article>`
            )
            .join("")
        : renderEmptySegmentPage()
    }
  </section>`;
}

function renderTranslationRows(
  page: BilingualPdfExportInput["pages"][number],
  input: BilingualPdfExportInput
) {
  return page.segments
    .map((segment, segmentIndex) => {
      const colorStyle = renderBilingualSegmentColorStyle(segmentIndex);
      if (!input.showPageChrome) {
        return `<article class="translation-row chromeless" style="${colorStyle}">
      <div class="text translation">${escapeHtml(segment.translationText)}</div>
    </article>`;
      }

      return `<article class="translation-row" style="${colorStyle}">
      <div class="label">
        <span>${escapeHtml(input.targetLanguageLabel)}</span>
        <span>${escapeHtml(segment.id)}</span>
      </div>
      <div class="source-snippet text">${escapeHtml(segment.sourceText)}</div>
      <div class="text translation">${escapeHtml(segment.translationText)}</div>
    </article>`;
    })
    .join("");
}

function renderPageTitle(page: ExportPage, input: BilingualPdfExportInput, suffix = "") {
  if (!input.showPageChrome) {
    return "";
  }

  return `<div class="page-title">
      <span>${escapeHtml(input.title)} - Page ${page.pageNumber}${suffix ? ` ${escapeHtml(suffix)}` : ""}</span>
      <span>${escapeHtml(input.sourceLanguageLabel)} / ${escapeHtml(input.targetLanguageLabel)}</span>
    </div>`;
}

function renderColumnLabel(label: string, role: string, input: BilingualPdfExportInput) {
  if (!input.showPageChrome) {
    return "";
  }

  return `<div class="page-column-label">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(role)}</span>
        </div>`;
}

function renderSourceHighlights(page: BilingualPdfExportInput["pages"][number]) {
  return getBilingualSourceHighlightsForPage(page)
    .map(
      (highlight) =>
        `<span class="source-highlight" title="${escapeHtml(highlight.id)}" style="${renderRectStyle(
          highlight.rect
        )};--segment-color:${highlight.border};--segment-bg:${highlight.background}"></span>`
    )
    .join("");
}

function renderTranslatedBlocks(blocks: TranslatedFlowBlock[], input: BilingualPdfExportInput) {
  if (blocks.length === 0) {
    return "";
  }

  return `<div class="translated-flow-layer">${blocks
    .map((block) => {
      const debugAttributes = input.showPageChrome
        ? ` data-segment-id="${escapeHtml(block.segment.id)}" title="${escapeHtml(
            `${block.segment.id}: ${block.segment.sourceText}`
          )}"`
        : "";

      return `<div class="translated-flow-block ${block.role}"${debugAttributes} style="${renderTranslationBlockStyle(
        block
      )}">${escapeHtml(block.segment.translationText)}</div>`;
    })
    .join("")}</div>`;
}

function renderPaperSourceSnippets(snippets: PaperSourceSnippetBlock[], page: ExportPage) {
  if (snippets.length === 0 || !page.sourcePageImageDataUrl) {
    return "";
  }

  const sourcePageImageDataUrl = page.sourcePageImageDataUrl;
  return `<div class="paper-source-snippet-layer">${snippets
    .map(
      (snippet) => `<div class="paper-source-snippet" title="${escapeHtml(
        snippet.segment.id
      )}" style="${renderPaperSourceSnippetStyle(snippet)}">
        <img alt="" aria-hidden="true" src="${escapeHtml(sourcePageImageDataUrl)}" />
      </div>`
    )
    .join("")}</div>`;
}

function renderEmptyTranslatedPage(hasContinuation = false) {
  if (!hasContinuation) {
    return "";
  }

  return `<div class="empty-translated-page"></div>`;
}

function renderEmptySegmentPage() {
  return `<div class="empty-segment-page">No translated segments for this page.</div>`;
}

function renderContinuationPages(
  page: ExportPage,
  input: BilingualPdfExportInput,
  overflowSegments: ExportSegment[]
) {
  if (overflowSegments.length === 0) {
    return "";
  }

  const chunks = chunkContinuationSegments(overflowSegments);
  return chunks
    .map((segments, chunkIndex) => {
      const continuationPage = {
        ...page,
        segments
      };
      const chunkLabel =
        chunks.length > 1 ? `continuation ${chunkIndex + 1}/${chunks.length}` : "continuation";

      return `<section class="${renderPageClass(input, "continuation-page")}${
        input.showPageChrome ? "" : " chromeless"
      }" style="${renderPageSpreadStyle(page)}">
    ${renderPageTitle(page, input, chunkLabel)}
    <div class="page-layout">
      <div class="source-page">
        ${renderColumnLabel(input.sourceLanguageLabel, "original", input)}
        <div class="continuation-source-placeholder${input.showPageChrome ? "" : " chromeless"}">
          ${input.showPageChrome ? `<div>
            <strong>Page ${page.pageNumber}</strong>
            <span>Original page is shown on the previous spread.</span>
          </div>` : ""}
        </div>
      </div>
      <div class="translated-page-column">
        ${renderColumnLabel(input.targetLanguageLabel, chunkLabel, input)}
        <div class="continuation-translations${input.showPageChrome ? "" : " chromeless"}">
          ${input.showPageChrome ? `<p class="translated-overflow-title">continued translations</p>` : ""}
          ${renderTranslationRows(continuationPage, input)}
        </div>
      </div>
    </div>
  </section>`;
    })
    .join("");
}

function chunkContinuationSegments(segments: ExportSegment[]) {
  const chunks: ExportSegment[][] = [];
  let currentChunk: ExportSegment[] = [];
  let currentLength = 0;
  const maxChunkLength = 1050;

  segments.forEach((segment) => {
    const segmentLength = segment.sourceText.length + segment.translationText.length;
    if (currentChunk.length > 0 && currentLength + segmentLength > maxChunkLength) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(segment);
    currentLength += segmentLength;
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function createTranslatedPageLayout(page: ExportPage, input: BilingualPdfExportInput) {
  const blocks: TranslatedFlowBlock[] = [];
  const sourceSnippets: PaperSourceSnippetBlock[] = [];
  const overflowSegments: ExportSegment[] = [];
  const pageSize = getPageSize(page);
  const exportMode = getExportMode(input);
  const blockGap = getTranslatedBlockGap(exportMode);
  const segmentColorIndex = getBilingualSegmentColorIndexMap(page.segments);
  const translatedLayoutSegments = getTranslatedLayoutSegments(page, input);
  const paperSourceSnippetSegments = getPaperSourceSnippetSegments(page, input);
  const mappedSegments = translatedLayoutSegments
    .filter((segment): segment is ExportSegment & { sourceBounds: SegmentBounds } =>
      Boolean(segment.sourceBounds)
    )
    .map((segment) => ({ kind: "translation" as const, segment }));
  const mappedSnippetSegments = paperSourceSnippetSegments
    .filter((segment): segment is ExportSegment & { sourceBounds: SegmentBounds } =>
      Boolean(segment.sourceBounds)
    )
    .map((segment) => ({ kind: "sourceSnippet" as const, segment }));
  const mappedEntries = [...mappedSegments, ...mappedSnippetSegments].sort(
    (left, right) =>
      getSegmentAnchorRect(left.segment).top - getSegmentAnchorRect(right.segment).top ||
      getSegmentAnchorRect(left.segment).left - getSegmentAnchorRect(right.segment).left
  );
  const columns = buildLayoutColumns(mappedEntries.map((entry) => entry.segment));

  for (const entry of mappedEntries) {
    const { segment } = entry;
    const anchorRect = getSegmentAnchorRect(segment);
    const useFullWidthLayout = shouldUseFullWidthLayout(anchorRect, columns);
    const column = useFullWidthLayout
      ? getFullWidthLayoutColumn(columns)
      : findBestLayoutColumn(anchorRect, columns);
    if (entry.kind === "sourceSnippet") {
      const sourceRect = getPaperSourceSnippetSourceRect(segment);
      if (!sourceRect) {
        continue;
      }

      const snippetRect = getPaperSourceSnippetBlockRect(sourceRect, anchorRect, column);
      if (!snippetRect) {
        continue;
      }

      sourceSnippets.push({
        segment,
        rect: snippetRect,
        sourceRect,
        colorIndex: segmentColorIndex.get(segment.id) ?? 0
      });
      updateLayoutProgress(
        columns,
        column,
        snippetRect.top + snippetRect.height + blockGap,
        useFullWidthLayout
      );
      continue;
    }

    const role = getSegmentRole(segment);
    const blockRect = getTranslatedBlockRect(anchorRect, column, role);
    const top = getTranslatedBlockTop(anchorRect, column);
    const availableHeight = 1 - top - translatedPagePadding;
    const fontSize = getFittedTranslationFontSize(
      segment,
      role,
      blockRect,
      availableHeight,
      pageSize,
      exportMode
    );
    const estimatedHeight = estimateTranslationBlockHeight(
      segment,
      fontSize,
      blockRect.width,
      role,
      pageSize,
      exportMode
    );
    const desiredHeight = getDesiredTranslationBlockHeight(blockRect, estimatedHeight, role);
    const height = roundLayoutNumber(Math.min(desiredHeight, availableHeight));
    const visibleHeightRatio = availableHeight / Math.max(desiredHeight, translatedBlockMinHeight);

    if (
      height < translatedBlockMinHeight ||
      visibleHeightRatio < 0.65 ||
      estimatedHeight > height + 0.012
    ) {
      overflowSegments.push(segment);
      continue;
    }

    const rect = normalizeLayoutRect({
      ...blockRect,
      top,
      height
    });
    blocks.push({
      segment,
      rect,
      fontSize,
      textIndentPt: getTranslatedTextIndentPt(segment, role, pageSize.width, column, anchorRect),
      role,
      colorIndex: segmentColorIndex.get(segment.id) ?? 0
    });
    updateLayoutProgress(columns, column, rect.top + rect.height + blockGap, useFullWidthLayout);
  }

  overflowSegments.push(...translatedLayoutSegments.filter((segment) => !segment.sourceBounds));

  return { blocks, sourceSnippets, overflowSegments };
}

function getTranslatedLayoutSegments(page: ExportPage, input: BilingualPdfExportInput) {
  if (getExportMode(input) !== "paper") {
    return page.segments;
  }

  return page.segments.filter((segment) => !shouldPreservePaperPdfSegment(segment));
}

function getPaperSourceSnippetSegments(page: ExportPage, input: BilingualPdfExportInput) {
  if (getExportMode(input) !== "paper" || !page.sourcePageImageDataUrl) {
    return [];
  }

  return page.segments.filter((segment) => shouldPreservePaperPdfSegment(segment));
}

function getExportMode(input: BilingualPdfExportInput): ExportMode {
  return input.exportMode ?? "reading";
}

function getTranslatedBlockGap(exportMode: ExportMode) {
  return exportMode === "paper" ? 0.0035 : translatedBlockGap;
}

export function shouldPreservePaperPdfSegment(segment: PaperPreservationCandidate) {
  const text = (segment.sourceText ?? segment.text ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 8) {
    return false;
  }

  const wordTokens = text.match(/[\p{L}\p{N}][\p{L}\p{N}.'%/-]*/gu) ?? [];
  const numberTokens = text.match(/\b\d+(?:[.,:/-]\d+)*(?:%|[a-z])?\b/gi) ?? [];
  const operatorTokens = text.match(/[=<>±×÷∑∫√≤≥≈→←↑↓|{}[\]()_]/g) ?? [];
  const tokenCount = Math.max(1, wordTokens.length);
  const numberRatio = numberTokens.length / tokenCount;
  const operatorRatio = operatorTokens.length / Math.max(1, text.length);
  const lineCount = segment.sourceLineBounds?.length ?? 0;
  const bounds = segment.sourceBounds;
  const proseSignals =
    text.match(/\b(?:as|but|by|compared|for|from|is|it|of|that|the|to|we|which|with)\b/gi)
      ?.length ?? 0;
  const isSentenceLikeProse = wordTokens.length >= 16 && /[.!?]/.test(text) && proseSignals >= 4;
  const isNarrativeFigureCaption =
    wordTokens.length >= 10 && /(?:^|\b)figure\s+\d+\b/i.test(text);
  const hasTableMarker = /^(?:table|tab\.)\s+[a-z]?\d+/i.test(text);
  const hasMetricTerms =
    /\b(?:acc(?:uracy)?|bleu|cid(er)?|diversity|f1|fid|flops?|iou|latency|lpips|mm-?dist|params?|precision|psnr|r-?precision|recall|rouge|runtime|ssim|top-?\d|training time)\b/i.test(
      text
    );
  const hasDatasetOrModelTerms =
    /\b(?:baseline|dataset|method|model|ours|result|score|split|train|test|validation|vq-?vae)\b/i.test(
      text
    );
  const looksWideAndDense = bounds
    ? bounds.width >= 0.42 &&
      bounds.height <= 0.24 &&
      tokenCount >= 12 &&
      numberRatio >= 0.16
    : false;
  const looksLikeMultiLineTable = lineCount >= 4 && tokenCount >= 16 && numberRatio >= 0.14;
  const looksNumericTable =
    numberTokens.length >= 6 &&
    numberRatio >= 0.16 &&
    (hasTableMarker || hasMetricTerms || hasDatasetOrModelTerms || looksWideAndDense || looksLikeMultiLineTable);
  const looksFormulaLike =
    operatorTokens.length >= 8 &&
    operatorRatio >= 0.035 &&
    (numberTokens.length >= 2 || /(?:arg\s*min|loss|log|softmax|sqrt|sum|where|with)\b/i.test(text));
  const isCaptionOnly =
    hasTableMarker && text.length <= 220 && numberTokens.length <= 2 && !hasMetricTerms && !looksFormulaLike;

  if (isCaptionOnly || isNarrativeFigureCaption) {
    return false;
  }

  return (looksNumericTable || looksFormulaLike) && !isSentenceLikeProse;
}

function renderRectStyle(rect: SegmentBounds) {
  return [
    `left:${formatPercent(rect.left)}`,
    `top:${formatPercent(rect.top)}`,
    `width:${formatPercent(rect.width)}`,
    `height:${formatPercent(rect.height)}`
  ].join(";");
}

function renderTranslationBlockStyle(block: TranslatedFlowBlock) {
  const styleParts = [
    renderRectStyle(block.rect),
    renderBilingualSegmentColorStyle(block.colorIndex),
    `font-size:${formatPt(block.fontSize)}`
  ];

  if (block.textIndentPt > 0) {
    styleParts.push(`text-indent:${formatPt(block.textIndentPt)}`);
  }

  return styleParts.join(";");
}

function renderPaperSourceSnippetStyle(snippet: PaperSourceSnippetBlock) {
  return [
    renderRectStyle(snippet.rect),
    renderBilingualSegmentColorStyle(snippet.colorIndex),
    `--clip-page-width:${formatUnboundedPercent(1 / snippet.sourceRect.width)}`,
    `--clip-page-height:${formatUnboundedPercent(1 / snippet.sourceRect.height)}`,
    `--clip-left:${formatUnboundedPercent(-snippet.sourceRect.left / snippet.sourceRect.width)}`,
    `--clip-top:${formatUnboundedPercent(-snippet.sourceRect.top / snippet.sourceRect.height)}`
  ].join(";");
}

function renderPageAspectRatioStyle(page: BilingualPdfExportInput["pages"][number]) {
  return renderPageAspectRatioStyleFromSize(getPageSize(page));
}

function renderPageAspectRatioStyleFromSize(pageSize: { width: number; height: number }) {
  return `aspect-ratio:${pageSize.width} / ${pageSize.height};`;
}

function renderPageClass(input: BilingualPdfExportInput, extraClass = "") {
  return [
    "page",
    getExportMode(input) === "paper" ? "paper-export" : "",
    extraClass,
    input.showPageChrome ? "with-chrome" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function renderPageSpreadStyle(page: ExportPage) {
  const pageSize = getPageSize(page);
  return [
    `--source-page-width:${formatPt(pageSize.width)}`,
    `--source-page-height:${formatPt(pageSize.height)}`,
    `--spread-page-width:${formatPt(pageSize.width * 2)}`
  ].join(";");
}

function getDocumentPageSize(input: BilingualPdfExportInput) {
  const imagePage = input.pages.find((page) => page.sourcePageWidth && page.sourcePageHeight);
  return getPageSize(imagePage);
}

function getPageSize(page?: Pick<ExportPage, "sourcePageWidth" | "sourcePageHeight">) {
  const width = page?.sourcePageWidth && page.sourcePageWidth > 0 ? page.sourcePageWidth : defaultSourcePageWidth;
  const height =
    page?.sourcePageHeight && page.sourcePageHeight > 0
      ? page.sourcePageHeight
      : defaultSourcePageHeight;

  return {
    width: roundLayoutNumber(width),
    height: roundLayoutNumber(height)
  };
}

function getSegmentAnchorRect(segment: ExportSegment & { sourceBounds: SegmentBounds }) {
  const lineBounds = segment.sourceLineBounds?.length
    ? mergeBounds(segment.sourceLineBounds)
    : undefined;
  return normalizeLayoutRect(lineBounds ?? segment.sourceBounds);
}

function buildLayoutColumns(segments: Array<ExportSegment & { sourceBounds: SegmentBounds }>) {
  const columns: LayoutColumn[] = [];
  const allAnchors = segments
    .map(getSegmentAnchorRect)
    .sort((left, right) => left.left - right.left || left.top - right.top);
  const anchors = getColumnDetectionAnchors(allAnchors);

  anchors.forEach((anchor) => {
    const matchingColumn = columns.find((column) =>
      hasColumnOverlap(anchor, column)
    );
    if (matchingColumn) {
      matchingColumn.left = roundLayoutNumber(Math.min(matchingColumn.left, anchor.left));
      matchingColumn.right = roundLayoutNumber(
        Math.max(matchingColumn.right, anchor.left + anchor.width)
      );
      return;
    }

    columns.push({
      left: anchor.left,
      right: anchor.left + anchor.width,
      nextTop: translatedPagePadding
    });
  });

  if (columns.length === 0) {
    return [
      {
        left: 0.1,
        right: 0.9,
        nextTop: translatedPagePadding
      }
    ];
  }

  return columns
    .map((column) => ({
      left: roundLayoutNumber(clamp(column.left, translatedPagePadding, 0.92)),
      right: roundLayoutNumber(clamp(column.right, column.left + 0.08, 1 - translatedPagePadding)),
      nextTop: translatedPagePadding
    }))
    .sort((left, right) => left.left - right.left);
}

function findBestLayoutColumn(anchor: SegmentBounds, columns: LayoutColumn[]) {
  return columns.reduce((best, column) => {
    const bestDistance = Math.abs(getRectCenter(anchor) - getColumnCenter(best));
    const distance = Math.abs(getRectCenter(anchor) - getColumnCenter(column));
    return distance < bestDistance ? column : best;
  }, columns[0]);
}

function getColumnDetectionAnchors(anchors: SegmentBounds[]) {
  const narrowAnchors = anchors.filter((anchor) => anchor.width < fullWidthLayoutAnchorWidth);
  if (!hasMultiColumnEvidence(narrowAnchors)) {
    return anchors;
  }

  return narrowAnchors;
}

function hasMultiColumnEvidence(anchors: SegmentBounds[]) {
  if (anchors.length < 3) {
    return false;
  }

  const centers = anchors.map(getRectCenter);
  const minCenter = Math.min(...centers);
  const maxCenter = Math.max(...centers);
  return minCenter < 0.46 && maxCenter > 0.54 && maxCenter - minCenter > multiColumnCenterGap;
}

function shouldUseFullWidthLayout(anchor: SegmentBounds, columns: LayoutColumn[]) {
  if (columns.length < 2 || anchor.width < fullWidthLayoutAnchorWidth) {
    return false;
  }

  const fullColumn = getFullWidthLayoutColumn(columns);
  const anchorRight = anchor.left + anchor.width;
  const layoutCenter = getColumnCenter(fullColumn);
  const spansCenter = anchor.left < layoutCenter && anchorRight > layoutCenter;
  const consumesColumnSpan = anchor.width >= (fullColumn.right - fullColumn.left) * 0.58;
  return spansCenter && consumesColumnSpan;
}

function getFullWidthLayoutColumn(columns: LayoutColumn[]): LayoutColumn {
  const left = Math.min(...columns.map((column) => column.left));
  const right = Math.max(...columns.map((column) => column.right));
  const nextTop = Math.max(...columns.map((column) => column.nextTop));
  return {
    left: roundLayoutNumber(left),
    right: roundLayoutNumber(right),
    nextTop: roundLayoutNumber(nextTop)
  };
}

function updateLayoutProgress(
  columns: LayoutColumn[],
  activeColumn: LayoutColumn,
  nextTop: number,
  useFullWidthLayout: boolean
) {
  const normalizedNextTop = roundLayoutNumber(nextTop);
  if (useFullWidthLayout) {
    columns.forEach((column) => {
      column.nextTop = roundLayoutNumber(Math.max(column.nextTop, normalizedNextTop));
    });
    return;
  }

  activeColumn.nextTop = roundLayoutNumber(Math.max(activeColumn.nextTop, normalizedNextTop));
}

function getTranslatedBlockRect(
  anchor: SegmentBounds,
  column: LayoutColumn,
  role: TranslatedFlowBlock["role"]
): SegmentBounds {
  if (role === "heading") {
    const headingWidth = clamp(anchor.width, 0.12, Math.max(0.12, column.right - column.left));
    return normalizeLayoutRect({
      left: clamp(anchor.left, column.left, Math.max(column.left, column.right - headingWidth)),
      top: anchor.top,
      width: headingWidth,
      height: Math.max(anchor.height, translatedBlockMinHeight)
    });
  }

  return normalizeLayoutRect({
    left: column.left,
    top: anchor.top,
    width: column.right - column.left,
    height: Math.max(anchor.height, translatedBlockMinHeight)
  });
}

function getPaperSourceSnippetSourceRect(segment: ExportSegment & { sourceBounds: SegmentBounds }) {
  const rawRect = segment.sourceLineBounds?.length
    ? mergeSourceBounds(segment.sourceLineBounds)
    : normalizeSourceRect(segment.sourceBounds);
  if (!rawRect) {
    return undefined;
  }

  return expandSourceHighlightRect(rawRect, sourceHighlightHorizontalPadding, sourceHighlightVerticalPadding);
}

function getPaperSourceSnippetBlockRect(
  sourceRect: SegmentBounds,
  anchorRect: SegmentBounds,
  column: LayoutColumn
) {
  const columnWidth = Math.max(0.02, column.right - column.left);
  let scale = Math.min(1, columnWidth / Math.max(sourceRect.width, minSourceHighlightWidth));
  let top = getTranslatedBlockTop(anchorRect, column);
  let availableHeight = 1 - top - translatedPagePadding;

  if (availableHeight < translatedBlockMinHeight) {
    top = roundLayoutNumber(
      clamp(
        1 - translatedPagePadding - sourceRect.height * scale,
        translatedPagePadding,
        1 - translatedPagePadding - translatedBlockMinHeight
      )
    );
    availableHeight = 1 - top - translatedPagePadding;
  }

  scale = Math.min(scale, availableHeight / Math.max(sourceRect.height, minSourceHighlightHeight));
  const width = roundLayoutNumber(sourceRect.width * scale);
  const height = roundLayoutNumber(sourceRect.height * scale);
  if (width < minSourceHighlightWidth || height < minSourceHighlightHeight) {
    return undefined;
  }

  return normalizePaperSourceSnippetRect({
    left: clamp(anchorRect.left, column.left, Math.max(column.left, column.right - width)),
    top,
    width,
    height
  });
}

function normalizePaperSourceSnippetRect(rect: SegmentBounds): SegmentBounds | undefined {
  const left = clamp(rect.left, translatedPagePadding, 1 - translatedPagePadding);
  const top = clamp(rect.top, translatedPagePadding, 1 - translatedPagePadding);
  const right = clamp(rect.left + rect.width, left + minSourceHighlightWidth, 1 - translatedPagePadding);
  const bottom = clamp(rect.top + rect.height, top + minSourceHighlightHeight, 1 - translatedPagePadding);
  const width = right - left;
  const height = bottom - top;

  if (
    ![left, top, width, height].every(Number.isFinite) ||
    width < minSourceHighlightWidth ||
    height < minSourceHighlightHeight
  ) {
    return undefined;
  }

  return {
    left: roundLayoutNumber(left),
    top: roundLayoutNumber(top),
    width: roundLayoutNumber(width),
    height: roundLayoutNumber(height)
  };
}

function getSegmentRole(segment: ExportSegment) {
  return isLikelyHeadingSegment(segment.sourceText) ? "heading" : "body";
}

function isLikelyHeadingSegment(sourceText: string) {
  const text = sourceText.replace(/\s+/g, " ").trim();
  if (!text || text.length > 90 || /[.!?;:。！？；：]/.test(text)) {
    return false;
  }

  const letters = text.match(/\p{L}/gu) ?? [];
  const digits = text.match(/\p{N}/gu) ?? [];
  if (letters.length === 0 || digits.length > letters.length) {
    return false;
  }

  if (/^\p{Ll}/u.test(text)) {
    return false;
  }

  const words = text.match(/\p{L}[\p{L}'’.-]*/gu) ?? [];
  if (words.length === 0 || words.length > 10) {
    return false;
  }

  if (/^chapter\s+(?:\d+|[ivxlcdm]+)$/i.test(text)) {
    return true;
  }

  if (/^(?:[A-Z]\.\s*){1,4}[A-Z][A-Za-z'’.-]+$/.test(text)) {
    return true;
  }

  if (isMostlyUppercaseHeading(text, letters.length)) {
    return true;
  }

  return isTitleCaseHeading(words);
}

function isMostlyUppercaseHeading(text: string, letterCount: number) {
  const uppercaseLetters = text.match(/\p{Lu}/gu)?.length ?? 0;
  return letterCount > 0 && uppercaseLetters / letterCount >= 0.72;
}

function isTitleCaseHeading(words: string[]) {
  const lowercaseAllowed = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to"
  ]);
  return words.every((word, index) => {
    const normalized = word.toLowerCase();
    if (index > 0 && lowercaseAllowed.has(normalized)) {
      return true;
    }

    return /^\p{Lu}/u.test(word);
  });
}

function getTranslatedBlockTop(anchor: SegmentBounds, column: LayoutColumn) {
  const anchoredTop = Math.max(anchor.top, column.nextTop);
  const maxTop = 1 - translatedPagePadding - translatedBlockMinHeight;
  return roundLayoutNumber(clamp(anchoredTop, translatedPagePadding, maxTop));
}

function getDesiredTranslationBlockHeight(
  blockRect: SegmentBounds,
  estimatedHeight: number,
  role: TranslatedFlowBlock["role"]
) {
  if (role === "heading") {
    return Math.max(blockRect.height, estimatedHeight, translatedBlockMinHeight);
  }

  return Math.max(estimatedHeight, translatedBlockMinHeight);
}

function getFittedTranslationFontSize(
  segment: ExportSegment,
  role: TranslatedFlowBlock["role"],
  blockRect: SegmentBounds,
  availableHeight: number,
  pageSize: { width: number; height: number },
  exportMode: ExportMode
) {
  let fontSize = getTranslationBlockFontSize(segment, role);
  if (role === "heading") {
    return fontSize;
  }

  const maxUsefulHeight = Math.max(
    translatedBlockMinHeight,
    Math.min(availableHeight, blockRect.height * 1.12)
  );
  while (
    fontSize > getMinBodyFontSize(exportMode) &&
    estimateTranslationBlockHeight(segment, fontSize, blockRect.width, role, pageSize, exportMode) >
      maxUsefulHeight
  ) {
    fontSize = roundLayoutNumber(Math.max(getMinBodyFontSize(exportMode), fontSize - 0.4));
  }

  return fontSize;
}

function getMinBodyFontSize(exportMode: ExportMode) {
  return exportMode === "paper" ? paperMinBodyFontSizePt : minBodyFontSizePt;
}

function getTranslationBlockFontSize(segment: ExportSegment, role: TranslatedFlowBlock["role"]) {
  if (role === "heading") {
    return segment.translationText.length > 60 ? 15.2 : 20.2;
  }

  const height = segment.sourceBounds?.height ?? 0.04;
  const textLength = segment.translationText.length;
  if (height < 0.025 || textLength > 360) {
    return 12.2;
  }
  if (height < 0.045 || textLength > 240) {
    return 13.2;
  }
  if (height < 0.075 || textLength > 120) {
    return 13.8;
  }
  return 14.2;
}

function estimateTranslationBlockHeight(
  segment: ExportSegment,
  fontSize: number,
  width: number,
  role: TranslatedFlowBlock["role"],
  pageSize: { width: number; height: number },
  exportMode: ExportMode
) {
  const normalizedText = segment.translationText.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return translatedBlockMinHeight;
  }

  const metrics = getTranslationBlockMetrics(exportMode, role);
  const widthPt = Math.max(1, width * pageSize.width);
  const contentWidthPt = Math.max(1, widthPt - metrics.horizontalPaddingPt);
  const averageGlyphWidth = containsCjk(normalizedText) ? 0.92 : 0.56;
  const charsPerLine = Math.max(4, Math.floor(contentWidthPt / (fontSize * averageGlyphWidth)));
  const lineCount = Math.ceil(normalizedText.length / charsPerLine);
  const lineHeightPt = fontSize * metrics.lineHeight;
  return roundLayoutNumber(
    ((lineCount * lineHeightPt) + metrics.verticalPaddingPt) / pageSize.height +
      metrics.paragraphPadding
  );
}

function getTranslationBlockMetrics(exportMode: ExportMode, role: TranslatedFlowBlock["role"]) {
  const isPaper = exportMode === "paper";
  return {
    horizontalPaddingPt: isPaper
      ? paperTranslatedBlockHorizontalPaddingPt
      : translatedBlockHorizontalPaddingPt,
    verticalPaddingPt: isPaper
      ? paperTranslatedBlockVerticalPaddingPt
      : translatedBlockVerticalPaddingPt,
    lineHeight: role === "heading"
      ? isPaper
        ? paperTranslatedHeadingLineHeight
        : translatedHeadingLineHeight
      : isPaper
        ? paperTranslatedBodyLineHeight
        : translatedBodyLineHeight,
    paragraphPadding: role === "heading" ? (isPaper ? 0.0015 : 0.003) : isPaper ? 0.0025 : 0.006
  };
}

function getTranslatedTextIndentPt(
  segment: ExportSegment,
  role: TranslatedFlowBlock["role"],
  pageWidth: number,
  column?: LayoutColumn,
  anchorRect?: SegmentBounds
) {
  if (role !== "body") {
    return 0;
  }

  let firstLineIndent = 0;
  if (segment.sourceLineBounds && segment.sourceLineBounds.length >= 2) {
    const sortedLines = [...segment.sourceLineBounds].sort(
      (left, right) => left.top - right.top || left.left - right.left
    );
    const minLeft = Math.min(...sortedLines.map((line) => line.left));
    firstLineIndent = Math.max(0, sortedLines[0].left - minLeft);
  } else if (column && anchorRect) {
    firstLineIndent = Math.max(0, anchorRect.left - column.left);
  }

  if (firstLineIndent <= 0.012) {
    return 0;
  }

  return roundLayoutNumber(clamp(firstLineIndent * pageWidth, 0, pageWidth * 0.08));
}

function containsCjk(text: string) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]/.test(text);
}

function normalizeLayoutRect(rect: SegmentBounds): SegmentBounds {
  const left = clamp(rect.left, 0, 0.98);
  const top = clamp(rect.top, 0, 0.98);
  const right = clamp(rect.left + rect.width, left + 0.02, 1);
  const bottom = clamp(rect.top + rect.height, top + translatedBlockMinHeight, 1);
  return {
    left: roundLayoutNumber(left),
    top: roundLayoutNumber(top),
    width: roundLayoutNumber(right - left),
    height: roundLayoutNumber(bottom - top)
  };
}

function mergeBounds(bounds: SegmentBounds[]) {
  if (bounds.length === 0) {
    return undefined;
  }

  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const right = Math.max(...bounds.map((bound) => bound.left + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.top + bound.height));

  return normalizeLayoutRect({
    left,
    top,
    width: right - left,
    height: bottom - top
  });
}

function hasColumnOverlap(rect: SegmentBounds, column: LayoutColumn) {
  const rectRight = rect.left + rect.width;
  const overlap = Math.min(rectRight, column.right) - Math.max(rect.left, column.left);
  const minWidth = Math.min(rect.width, column.right - column.left);
  return overlap > Math.max(0.035, minWidth * 0.28);
}

function getRectCenter(rect: SegmentBounds) {
  return rect.left + rect.width / 2;
}

function getColumnCenter(column: LayoutColumn) {
  return column.left + (column.right - column.left) / 2;
}

function formatPercent(value: number) {
  return `${roundLayoutNumber(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatUnboundedPercent(value: number) {
  return `${roundLayoutNumber(value * 100)}%`;
}

function formatPt(value: number) {
  return `${roundLayoutNumber(Math.max(0, value))}pt`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
