import type { ListeningTranscriptSegment } from "./types";

export const EMBEDDED_SUBTITLE_SENTENCE_MODEL = "embedded-subtitle-sentences";
export const LEGACY_EMBEDDED_SUBTITLE_MODEL = "embedded-subtitle";

type SentenceMergeOptions = {
  idPrefix?: string;
  maxMergedChars?: number;
  maxMergedDurationSeconds?: number;
  maxCueGapSeconds?: number;
};

export function mergeSubtitleSegmentsIntoSentences(
  segments: ListeningTranscriptSegment[],
  options: SentenceMergeOptions = {}
): ListeningTranscriptSegment[] {
  const idPrefix = options.idPrefix ?? "subtitle-sentence";
  const maxMergedChars = options.maxMergedChars ?? 260;
  const maxMergedDurationSeconds = options.maxMergedDurationSeconds ?? 18;
  const maxCueGapSeconds = options.maxCueGapSeconds ?? 1.6;
  const result: ListeningTranscriptSegment[] = [];
  let buffer: ListeningTranscriptSegment | null = null;

  const cueParts = segments
    .filter((segment) => segment.text.trim() && segment.end > segment.start)
    .sort((left, right) => left.start - right.start)
    .flatMap(splitCueIntoSentenceParts);

  const flush = () => {
    if (!buffer?.text.trim()) {
      buffer = null;
      return;
    }
    result.push({
      ...buffer,
      id: `${idPrefix}-${result.length + 1}`,
      text: normalizeSubtitleText(buffer.text)
    });
    buffer = null;
  };

  for (const part of cueParts) {
    if (!buffer) {
      buffer = { ...part };
    } else {
      const current: ListeningTranscriptSegment = buffer;
      const cueGap = part.start - current.end;
      if (cueGap > maxCueGapSeconds) {
        flush();
        buffer = { ...part };
      } else {
        buffer = {
          ...current,
          end: Math.max(current.end, part.end),
          text: joinSubtitleText(current.text, part.text)
        };
      }
    }

    if (!buffer) {
      continue;
    }
    const duration = buffer.end - buffer.start;
    if (
      isSentenceComplete(buffer.text) ||
      buffer.text.length >= maxMergedChars ||
      duration >= maxMergedDurationSeconds
    ) {
      flush();
    }
  }

  flush();
  return result;
}

export function usesLegacyEmbeddedSubtitleSegments(modelName?: string) {
  return modelName === LEGACY_EMBEDDED_SUBTITLE_MODEL;
}

function splitCueIntoSentenceParts(
  segment: ListeningTranscriptSegment
): ListeningTranscriptSegment[] {
  const text = normalizeSubtitleText(segment.text);
  const parts = text
    .split(/(?<=[.!?\u3002\uff01\uff1f])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return [{ ...segment, text }];
  }

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const duration = segment.end - segment.start;
  let cursor = segment.start;
  return parts.map((part, index) => {
    const isLast = index === parts.length - 1;
    const nextEnd = isLast
      ? segment.end
      : cursor + duration * Math.max(0.05, part.length / Math.max(1, totalLength));
    const nextSegment: ListeningTranscriptSegment = {
      ...segment,
      id: "",
      start: cursor,
      end: Math.min(segment.end, nextEnd),
      text: part
    };
    cursor = nextSegment.end;
    return nextSegment;
  });
}

function normalizeSubtitleText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function joinSubtitleText(left: string, right: string) {
  const normalizedLeft = normalizeSubtitleText(left);
  const normalizedRight = normalizeSubtitleText(right);
  if (!normalizedLeft) {
    return normalizedRight;
  }
  if (!normalizedRight) {
    return normalizedLeft;
  }
  return `${normalizedLeft} ${normalizedRight}`;
}

function isSentenceComplete(text: string) {
  return /[.!?\u3002\uff01\uff1f]+(?:["'\u201d\u2019)\]]+)?$/.test(text.trim());
}
