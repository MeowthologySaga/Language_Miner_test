import type { PdfPageRect } from "./types";

export type BilingualLayoutRect = PdfPageRect;

export const sourceHighlightGap = 0.0012;
export const sourceHighlightHorizontalPadding = 0.0035;
export const sourceHighlightVerticalPadding = 0.003;
export const sourceHighlightLineVerticalPadding = 0.0012;
export const minSourceHighlightHeight = 0.004;
export const minSourceHighlightWidth = 0.004;

export function expandSourceHighlightRect(
  rect: BilingualLayoutRect,
  horizontalPadding: number,
  verticalPadding: number
): BilingualLayoutRect {
  const left = clamp(rect.left - horizontalPadding, 0, 1);
  const top = clamp(rect.top - verticalPadding, 0, 1);
  const right = clamp(rect.left + rect.width + horizontalPadding, left, 1);
  const bottom = clamp(rect.top + rect.height + verticalPadding, top, 1);

  return {
    left: roundLayoutNumber(left),
    top: roundLayoutNumber(top),
    width: roundLayoutNumber(right - left),
    height: roundLayoutNumber(bottom - top)
  };
}

export function normalizeSourceRect(rect: BilingualLayoutRect): BilingualLayoutRect | undefined {
  const left = clamp(rect.left, 0, 1);
  const top = clamp(rect.top, 0, 1);
  const right = clamp(rect.left + rect.width, 0, 1);
  const bottom = clamp(rect.top + rect.height, 0, 1);
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

export function mergeSourceBounds(bounds: BilingualLayoutRect[]) {
  if (bounds.length === 0) {
    return undefined;
  }

  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const right = Math.max(...bounds.map((bound) => bound.left + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.top + bound.height));

  return normalizeSourceRect({
    left,
    top,
    width: right - left,
    height: bottom - top
  });
}

export function areRectsOnSameSourceLine(left: BilingualLayoutRect, right: BilingualLayoutRect) {
  const leftCenter = left.top + left.height / 2;
  const rightCenter = right.top + right.height / 2;
  const tolerance = Math.max(Math.min(left.height, right.height) * 0.55, 0.004);
  return Math.abs(leftCenter - rightCenter) <= tolerance;
}

export function hasSourceRectHorizontalOverlap(left: BilingualLayoutRect, right: BilingualLayoutRect) {
  const overlap =
    Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left);
  const minWidth = Math.min(left.width, right.width);
  return overlap > Math.max(0.006, minWidth * 0.08);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundLayoutNumber(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
