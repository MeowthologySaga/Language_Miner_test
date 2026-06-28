import * as pdfjsLib from "pdfjs-dist";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef
} from "react";
import {
  buildTextLayerLayoutItems,
  buildTransformLayoutItems,
  getPdfTextLayerConstructor,
  pdfLayoutExtractionVersion,
  type PdfTextContent,
  type PdfTextLayer
} from "./pdfLayoutExtraction";
import type { PdfTextSegment } from "../shared/types";
import {
  attachSegmentBounds,
  buildPdfPageTextFromLayoutItems,
  segmentPdfPageText,
  type PdfLayoutTextItem
} from "../utils/pdfSegmentation";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function loadPdfDocument(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data }).promise;
}

export type PdfDocument = Awaited<ReturnType<typeof loadPdfDocument>>;

type PdfRenderTask = {
  promise: Promise<unknown>;
  cancel: () => void;
};

export type ExtractedPdfPageData = {
  text: string;
  segments: PdfTextSegment[];
  layoutVersion: string;
};

export function usePdfPageDataReader(pdfDocument: PdfDocument | null) {
  const pageDataCacheRef = useRef<Map<number, ExtractedPdfPageData>>(new Map());

  const clearPageDataCache = useCallback(() => {
    pageDataCacheRef.current.clear();
  }, []);

  useEffect(() => {
    clearPageDataCache();
  }, [clearPageDataCache, pdfDocument]);

  const readPageData = useCallback(async (pageNumber: number): Promise<ExtractedPdfPageData> => {
    if (!pdfDocument) {
      return { text: "", segments: [], layoutVersion: pdfLayoutExtractionVersion };
    }

    const cached = pageDataCacheRef.current.get(pageNumber);
    if (cached !== undefined && cached.layoutVersion === pdfLayoutExtractionVersion) {
      return cached;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const typedTextContent = textContent as PdfTextContent;
    const transformItems = buildTransformLayoutItems(typedTextContent, viewport);
    const textLayerItems =
      transformItems.length > 0
        ? undefined
        : await buildTextLayerLayoutItems(
            typedTextContent,
            viewport,
            getPdfTextLayerConstructor(pdfjsLib)
          );
    const textItems: PdfLayoutTextItem[] =
      transformItems.length > 0 ? transformItems : textLayerItems ?? [];

    const { text, layoutItems } = buildPdfPageTextFromLayoutItems(textItems);
    const segments = attachSegmentBounds({
      pageText: text,
      segments: segmentPdfPageText({ pageNumber, text }),
      layoutItems
    });
    const pageData = { text, segments, layoutVersion: pdfLayoutExtractionVersion };
    pageDataCacheRef.current.set(pageNumber, pageData);
    return pageData;
  }, [pdfDocument]);

  const readPageText = useCallback(async (pageNumber: number) => {
    const pageData = await readPageData(pageNumber);
    return pageData.text;
  }, [readPageData]);

  const readPageSegments = useCallback(async (pageNumber: number) => {
    const pageData = await readPageData(pageNumber);
    return pageData.segments;
  }, [readPageData]);

  return {
    clearPageDataCache,
    readPageData,
    readPageText,
    readPageSegments
  };
}

export function usePdfPageRenderer({
  canvasRef,
  currentPage,
  onError,
  onStatus,
  pdfDocument,
  textLayerRef
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentPage: number;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
  pdfDocument: PdfDocument | null;
  textLayerRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) {
      return;
    }

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    let textLayer: PdfTextLayer | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      const textLayerContainer = textLayerRef.current;
      if (!canvas || !pdfDocument) {
        return;
      }

      onStatus("페이지 렌더링 중...");
      try {
        const page = await pdfDocument.getPage(currentPage);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = canvas.parentElement?.clientWidth ?? 720;
        const scale = Math.min(1.35, Math.max(0.72, (availableWidth - 32) / baseViewport.width));
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("PDF 렌더링 컨텍스트를 만들 수 없습니다.");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        if (textLayerContainer) {
          textLayerContainer.innerHTML = "";
          textLayerContainer.style.width = `${Math.floor(viewport.width)}px`;
          textLayerContainer.style.height = `${Math.floor(viewport.height)}px`;
          textLayerContainer.style.setProperty("--scale-factor", String(scale));
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
        }) as PdfRenderTask;
        await renderTask.promise;

        const TextLayer = getPdfTextLayerConstructor(pdfjsLib);
        if (!cancelled && TextLayer && textLayerContainer) {
          try {
            const textContent = (await page.getTextContent()) as PdfTextContent;
            if (!cancelled) {
              textLayer = new TextLayer({
                textContentSource: textContent,
                container: textLayerContainer,
                viewport
              });
              await textLayer.render();
            }
          } catch {
            textLayerContainer.innerHTML = "";
          }
        }

        if (!cancelled) {
          onStatus("");
        }
      } catch (caught) {
        if (!cancelled && (caught as { name?: string }).name !== "RenderingCancelledException") {
          onError(caught instanceof Error ? caught.message : "PDF 페이지 렌더링에 실패했습니다.");
          onStatus("");
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [canvasRef, currentPage, onError, onStatus, pdfDocument, textLayerRef]);
}
