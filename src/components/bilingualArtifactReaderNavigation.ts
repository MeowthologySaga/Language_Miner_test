import { clampScale, normalizeWheelDelta } from "./bilingualArtifactReaderUtils";

export type ReaderViewMode = "fit-width" | "fit-page" | "custom";

export type ReaderWheelNavigationState = {
  accumulatedDelta: number;
  lastNavigatedAt: number;
};

export type ReaderWheelNavigationResult = {
  handled: boolean;
  pageDelta: -1 | 0 | 1;
  state: ReaderWheelNavigationState;
};

export const VIEWER_FIT_PADDING = 48;
export const WHEEL_PAGE_DELTA_THRESHOLD = 60;
export const WHEEL_PAGE_NAVIGATION_THROTTLE_MS = 260;

const WHEEL_PAGE_NAVIGATION_RESET_MS = 450;

export function clampReaderPage(nextPage: number, pageCount: number) {
  if (!Number.isFinite(nextPage) || !Number.isFinite(pageCount) || pageCount <= 0) {
    return null;
  }

  return Math.max(1, Math.min(Math.floor(pageCount), Math.round(nextPage)));
}

export function resolveReaderScale(input: {
  viewMode: ReaderViewMode;
  customZoom: number;
  isFullscreen: boolean;
  stageWidth: number;
  stageHeight: number;
  pageWidth: number;
  pageHeight: number;
}) {
  const effectiveMode = input.isFullscreen ? "fit-page" : input.viewMode;
  if (effectiveMode === "custom") {
    return clampScale(input.customZoom);
  }

  if (
    !Number.isFinite(input.stageWidth) ||
    !Number.isFinite(input.stageHeight) ||
    !Number.isFinite(input.pageWidth) ||
    !Number.isFinite(input.pageHeight)
  ) {
    return clampScale(input.customZoom);
  }

  const fitPadding = input.isFullscreen ? 0 : VIEWER_FIT_PADDING;
  const availableWidth = Math.max(160, input.stageWidth - fitPadding);
  const availableHeight = Math.max(160, input.stageHeight - fitPadding);
  const pageWidth = Math.max(1, input.pageWidth);
  const pageHeight = Math.max(1, input.pageHeight);
  const fitWidthScale = availableWidth / pageWidth;
  const fitPageScale = Math.min(fitWidthScale, availableHeight / pageHeight);
  return clampScale(effectiveMode === "fit-page" ? fitPageScale : fitWidthScale);
}

export function resolveWheelPageNavigation(input: {
  isFullscreen: boolean;
  hasDocument: boolean;
  pageCount: number;
  deltaY: number;
  deltaMode?: number;
  timeStamp?: number;
  state: ReaderWheelNavigationState;
}): ReaderWheelNavigationResult {
  if (
    !input.isFullscreen ||
    !input.hasDocument ||
    input.pageCount <= 1 ||
    !Number.isFinite(input.deltaY) ||
    input.deltaY === 0
  ) {
    return {
      handled: false,
      pageDelta: 0,
      state: input.state
    };
  }

  const normalizedDelta = normalizeWheelDelta(input.deltaY, input.deltaMode ?? 0);
  if (Math.abs(normalizedDelta) < 1) {
    return {
      handled: false,
      pageDelta: 0,
      state: input.state
    };
  }

  const now =
    typeof input.timeStamp === "number" && Number.isFinite(input.timeStamp)
      ? input.timeStamp
      : Date.now();
  const shouldReset = now - input.state.lastNavigatedAt > WHEEL_PAGE_NAVIGATION_RESET_MS;
  const accumulatedDelta =
    (shouldReset ? 0 : input.state.accumulatedDelta) + normalizedDelta;

  if (Math.abs(accumulatedDelta) < WHEEL_PAGE_DELTA_THRESHOLD) {
    return {
      handled: true,
      pageDelta: 0,
      state: {
        ...input.state,
        accumulatedDelta
      }
    };
  }

  if (now - input.state.lastNavigatedAt < WHEEL_PAGE_NAVIGATION_THROTTLE_MS) {
    return {
      handled: true,
      pageDelta: 0,
      state: {
        ...input.state,
        accumulatedDelta
      }
    };
  }

  return {
    handled: true,
    pageDelta: accumulatedDelta > 0 ? 1 : -1,
    state: {
      accumulatedDelta: 0,
      lastNavigatedAt: now
    }
  };
}
