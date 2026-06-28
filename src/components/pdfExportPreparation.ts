import { shouldPreservePaperPdfSegment } from "../shared/bilingualExport";
import type {
  BilingualPdfExportMode,
  BilingualPdfExportPage,
  PdfSegmentTranslation,
  PdfTextSegment
} from "../shared/types";
import type { PageTranslationState } from "./pdfSelectionReaderUtils";

export type RenderedPdfPageImage = {
  dataUrl: string;
  // PDF point dimensions used for layout; the data URL itself may be rendered at a higher pixel scale.
  width: number;
  height: number;
};

export type PreparedBilingualExportPage = {
  page: BilingualPdfExportPage;
  sourceSegmentCount: number;
  translatedSegmentCount: number;
};

export type PdfRenderableDocument = {
  getPage(pageNumber: number): Promise<PdfRenderablePage>;
};

type PdfRenderablePage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): PdfRenderTask;
};

type PdfRenderTask = {
  promise: Promise<unknown>;
  cancel: () => void;
};

export const exportPageImageRenderTimeoutMs = 25_000;

const exportPageImageMinWidth = 1600;
const exportPageImageMaxScale = 2.6;

export async function renderPdfPageImage(
  pdfDocument: PdfRenderableDocument | null,
  pageNumber: number
): Promise<RenderedPdfPageImage | undefined> {
  if (!pdfDocument || typeof document === "undefined") {
    return undefined;
  }

  try {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = getExportPageImageScale(baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) {
      return undefined;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const renderTask = page.render({ canvasContext, viewport });
    await withTimeout(renderTask.promise, exportPageImageRenderTimeoutMs, () => {
      renderTask.cancel();
    });
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: baseViewport.width,
      height: baseViewport.height
    };
  } catch {
    return undefined;
  }
}

export function getExportPageImageScale(baseWidth: number) {
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) {
    return 1.8;
  }

  return Math.min(exportPageImageMaxScale, Math.max(1.6, exportPageImageMinWidth / baseWidth));
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      onTimeout();
      reject(new Error("PDF page image render timed out."));
    }, timeoutMs);

    promise
      .then((value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((caught) => {
        globalThis.clearTimeout(timeoutId);
        reject(caught);
      });
  });
}

export function getTranslationSegmentsForExportMode(
  segments: PdfTextSegment[],
  exportMode: BilingualPdfExportMode | undefined
) {
  if (exportMode !== "paper") {
    return segments;
  }

  return segments.filter((segment) => !shouldPreservePaperPdfSegment(segment));
}

export async function prepareBilingualExportPage({
  pageNumber,
  translationsByPage,
  readPageData,
  renderPageImage,
  exportMode
}: {
  pageNumber: number;
  translationsByPage: Record<number, PageTranslationState>;
  readPageData: (pageNumber: number) => Promise<{ segments: PdfTextSegment[] }>;
  renderPageImage: (pageNumber: number) => Promise<RenderedPdfPageImage | undefined>;
  exportMode: BilingualPdfExportMode | undefined;
}): Promise<PreparedBilingualExportPage> {
  const pageState = translationsByPage[pageNumber];
  const translationsById = new Map(
    pageState?.translations.map((translation: PdfSegmentTranslation) => [
      translation.id,
      translation
    ]) ?? []
  );
  const { segments: sourceSegments } = await readPageData(pageNumber);
  const exportSourceSegments =
    exportMode === "paper"
      ? sourceSegments
      : getTranslationSegmentsForExportMode(sourceSegments, exportMode);
  const segments = exportSourceSegments.flatMap((segment) => {
    if (exportMode === "paper" && shouldPreservePaperPdfSegment(segment)) {
      return [
        {
          id: segment.id,
          sourceText: segment.text,
          translationText: "",
          sourceBounds: segment.sourceBounds,
          sourceLineBounds: segment.sourceLineBounds
        }
      ];
    }

    const translation = translationsById.get(segment.id);
    if (!translation?.translationKo.trim()) {
      return [];
    }

    return [
      {
        id: segment.id,
        sourceText: segment.text,
        translationText: translation.translationKo,
        sourceBounds: segment.sourceBounds,
        sourceLineBounds: segment.sourceLineBounds
      }
    ];
  });
  const pageImage = await renderPageImage(pageNumber);

  return {
    page: {
      pageNumber,
      sourcePageImageDataUrl: pageImage?.dataUrl,
      sourcePageWidth: pageImage?.width,
      sourcePageHeight: pageImage?.height,
      segments
    },
    sourceSegmentCount: exportSourceSegments.length,
    translatedSegmentCount: segments.length
  };
}
