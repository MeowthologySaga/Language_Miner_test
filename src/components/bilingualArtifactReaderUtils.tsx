import type { ReactNode } from "react";
import type { HighlightColorKey } from "../shared/types";

export const MIN_READER_SCALE = 0.25;
export const MAX_READER_SCALE = 3;

const POPOVER_WIDTH = 208;
const SENTENCE_POPOVER_WIDTH = 460;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function arrayBufferFromPdfFileData(data: Uint8Array) {
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return bytes.buffer;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function replaceSourceSentenceInContext(
  normalizedFullText: string,
  previousSourceSentence: string,
  editedSentence: string,
  beforeSentence?: string,
  afterSentence?: string
) {
  if (!normalizedFullText) {
    return editedSentence;
  }

  const previous = normalizeWhitespace(previousSourceSentence);
  if (previous && normalizedFullText.includes(previous)) {
    return normalizedFullText.replace(previous, editedSentence);
  }

  return [beforeSentence, editedSentence, afterSentence]
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean)
    .join(" ");
}

export function pdfTextItemsToString(items: unknown[]) {
  return items
    .map((item) => (isPdfTextItem(item) ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPdfTextItem(item: unknown): item is { str: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string"
  );
}

const sentenceTermColors: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

export function renderSentenceTerms(sourceSentence: string, selectedTerms: string[]) {
  const matches = findSentenceTermMatches(sourceSentence, selectedTerms);
  if (matches.length === 0) {
    return sourceSentence;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(sourceSentence.slice(cursor, match.start));
    }

    parts.push(
      <mark
        className={`highlight highlight-${match.colorKey}`}
        key={`${match.start}-${match.end}-${index}`}
      >
        {sourceSentence.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  });

  if (cursor < sourceSentence.length) {
    parts.push(sourceSentence.slice(cursor));
  }

  return parts;
}

export function findSentenceTermMatches(sourceSentence: string, selectedTerms: string[]) {
  const matches: Array<{
    start: number;
    end: number;
    colorKey: HighlightColorKey;
  }> = [];

  selectedTerms.forEach((term, termIndex) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      return;
    }

    const colorKey = sentenceTermColors[termIndex % sentenceTermColors.length];
    const regex = new RegExp(escapeRegExp(trimmedTerm), "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceSentence)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        colorKey
      });

      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
  });

  return matches
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<typeof matches>((accepted, match) => {
      const overlaps = accepted.some(
        (existing) => match.start < existing.end && match.end > existing.start
      );
      return overlaps ? accepted : [...accepted, match];
    }, []);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function clampScale(value: number) {
  return Math.min(MAX_READER_SCALE, Math.max(MIN_READER_SCALE, value));
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number) {
  if (deltaMode === DOM_DELTA_LINE) {
    return deltaY * 32;
  }
  if (deltaMode === DOM_DELTA_PAGE) {
    return deltaY * 600;
  }
  return deltaY;
}

export function getRangeRect(range: Range): SelectionRect | null {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  }

  const clientRect = Array.from(range.getClientRects()).find(
    (candidate) => candidate.width > 0 || candidate.height > 0
  );
  if (!clientRect) {
    return null;
  }
  return {
    top: clientRect.top,
    left: clientRect.left,
    width: clientRect.width,
    height: clientRect.height
  };
}

export function positionPopover(rect: SelectionRect) {
  const maxLeft = Math.max(12, window.innerWidth - POPOVER_WIDTH - 12);
  return {
    top: Math.max(12, rect.top - 132),
    left: Math.min(maxLeft, Math.max(16, rect.left + rect.width / 2 - POPOVER_WIDTH / 2))
  };
}

export function positionSentencePopover(rect?: SelectionRect) {
  const maxLeft = Math.max(12, window.innerWidth - SENTENCE_POPOVER_WIDTH - 12);
  const maxTop = Math.max(12, window.innerHeight - 320);
  if (!rect) {
    return {
      top: 96,
      left: Math.min(maxLeft, Math.max(16, (window.innerWidth - SENTENCE_POPOVER_WIDTH) / 2))
    };
  }

  return {
    top: Math.min(maxTop, Math.max(12, rect.top + rect.height + 12)),
    left: Math.min(
      maxLeft,
      Math.max(16, rect.left + rect.width / 2 - SENTENCE_POPOVER_WIDTH / 2)
    )
  };
}

export function isPageNavigationShortcut(event: KeyboardEvent) {
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  return key === "arrowleft" || key === "arrowright" || key === "a" || key === "d";
}

export function getPageNavigationDelta(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  return key === "arrowleft" || key === "a" ? -1 : 1;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const normalized = shortcut.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const expectsCtrl = parts.includes("ctrl") || parts.includes("control");
  const expectsShift = parts.includes("shift");
  const expectsAlt = parts.includes("alt");
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();

  return (
    event.ctrlKey === expectsCtrl &&
    event.shiftKey === expectsShift &&
    event.altKey === expectsAlt &&
    eventKey === key
  );
}

export function isEditableTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const maybeElement = target as { tagName?: unknown; isContentEditable?: unknown };
  const tagName = typeof maybeElement.tagName === "string" ? maybeElement.tagName.toLowerCase() : "";
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    maybeElement.isContentEditable === true
  );
}
