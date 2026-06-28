import type {
  ListeningTranscript,
  ListeningTranscriptSegment,
  ListeningVideoCandidate
} from "../shared/types";
import type {
  ListeningLoopSeed,
  ListeningLoopSegment
} from "../shared/listeningLoopSeeds";

const LISTENING_RSS_MAX_DURATION_SECONDS = 10 * 60;
export const DAILY_ROUTINE_CLIP_COUNT = 5;
export const DAILY_ROUTINE_MIN_CLIP_SECONDS = 20;
export const DAILY_ROUTINE_MAX_CLIP_SECONDS = 45;
const DAILY_ROUTINE_RESERVE_SENTENCE_COUNT = 12;

export type BatchTranscriptStatus = "pending" | "running" | "done" | "failed";

export type BatchTranscriptItem = {
  candidateId: string;
  title: string;
  channelName?: string;
  status: BatchTranscriptStatus;
  startedAt?: number;
  endedAt?: number;
  elapsedMs?: number;
  message?: string;
  segmentCount?: number;
};

export type EntranceQueueFilter = "short" | "ready" | "needsTranscript" | "all";

export type VisibleListeningCandidateOptions = {
  dateKey?: string;
  excludeReadyTranscriptsBeforeDate?: boolean;
  learnedVideoIds?: Iterable<string>;
};

export type DailyRoutineBuildInput = {
  candidates: ListeningVideoCandidate[];
  transcriptByCandidateId: Map<string, ListeningTranscript>;
  selectedCandidateIds: string[];
  targetLanguageCode: string;
  targetSentenceCount?: number;
  usePartialVideoClips?: boolean;
  dateKey?: string;
};

export type DailyRoutineBuildResult = {
  seed: ListeningLoopSeed | null;
  reserveSegments: ListeningLoopSegment[];
  readyCandidateIds: string[];
  missingCandidateIds: string[];
  selectedCandidateIds: string[];
  targetSentenceCount: number;
  preparedSentenceCount: number;
};

type DailyRoutineReadySource = {
  candidateId: string;
  candidate: ListeningVideoCandidate;
  transcript: ListeningTranscript;
  sentenceSegments: ListeningLoopSegment[];
};

type DailyRoutineClipCandidate = {
  id: string;
  sourceOrder: number;
  clipIndex: number;
  start: number;
  end: number;
  source: DailyRoutineReadySource;
  segments: ListeningLoopSegment[];
};

export function matchesLearningLanguage(languageCode: string | undefined, targetLanguageCode: string) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const normalizedTarget = normalizeLanguageCode(targetLanguageCode);
  return !normalizedLanguage || normalizedLanguage === normalizedTarget;
}

export function matchesKnownLearningLanguage(
  languageCode: string | undefined,
  targetLanguageCode: string
) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const normalizedTarget = normalizeLanguageCode(targetLanguageCode);
  return Boolean(normalizedLanguage && normalizedLanguage === normalizedTarget);
}

export function createTranscriptByCandidateId(transcripts: ListeningTranscript[]) {
  const map = new Map<string, ListeningTranscript>();
  for (const transcript of transcripts) {
    map.set(transcript.candidateId, transcript);
  }
  return map;
}

export function getVisibleListeningVideoCandidates(
  candidates: ListeningVideoCandidate[],
  transcriptByCandidateId: Map<string, ListeningTranscript>,
  targetLanguageCode: string,
  options: VisibleListeningCandidateOptions = {}
) {
  const learnedVideoIds = createLearnedListeningVideoIdSet(
    candidates,
    transcriptByCandidateId,
    options
  );

  return buildDailyCandidateQueue(candidates).filter((candidate) => {
    if (
      isLearnedListeningCandidate(candidate) ||
      learnedVideoIds.has(normalizeListeningVideoId(candidate.videoId))
    ) {
      return false;
    }
    const transcript = transcriptByCandidateId.get(candidate.id);
    const candidateMatches =
      matchesKnownLearningLanguage(candidate.languageCode, targetLanguageCode) ||
      matchesLearningLanguage(candidate.languageCode, targetLanguageCode);
    const readyTranscriptMismatch =
      transcript?.status === "ready" &&
      transcript.languageCode &&
      !matchesKnownLearningLanguage(transcript.languageCode, targetLanguageCode);
    return candidateMatches && !readyTranscriptMismatch;
  });
}

export function createLearnedListeningVideoIdSet(
  candidates: ListeningVideoCandidate[],
  transcriptByCandidateId: Map<string, ListeningTranscript>,
  options: VisibleListeningCandidateOptions = {}
) {
  const learnedVideoIds = new Set<string>();
  for (const videoId of options.learnedVideoIds ?? []) {
    const normalizedVideoId = normalizeListeningVideoId(videoId);
    if (normalizedVideoId) {
      learnedVideoIds.add(normalizedVideoId);
    }
  }

  for (const candidate of candidates) {
    if (isLearnedListeningCandidate(candidate)) {
      const normalizedVideoId = normalizeListeningVideoId(candidate.videoId);
      if (normalizedVideoId) {
        learnedVideoIds.add(normalizedVideoId);
      }
    }
  }

  if (options.excludeReadyTranscriptsBeforeDate) {
    const dateKey = options.dateKey ?? getLocalDateKey();
    for (const transcript of transcriptByCandidateId.values()) {
      if (isReadyTranscriptBeforeDate(transcript, dateKey)) {
        const normalizedVideoId = normalizeListeningVideoId(transcript.videoId);
        if (normalizedVideoId) {
          learnedVideoIds.add(normalizedVideoId);
        }
      }
    }
  }

  return learnedVideoIds;
}

export function isLearnedListeningCandidate(candidate: ListeningVideoCandidate) {
  return Boolean(candidate.metadata?.learned || candidate.metadata?.learnedAt);
}

export function isLearnedRssCandidate(candidate: ListeningVideoCandidate) {
  if (candidate.sourceType !== "youtube_rss") {
    return false;
  }
  return isLearnedListeningCandidate(candidate);
}

function isReadyTranscriptBeforeDate(transcript: ListeningTranscript, dateKey: string) {
  if (transcript.status !== "ready" || transcript.segments.length === 0) {
    return false;
  }
  const transcriptDateKey = getDateKeyFromIsoLikeText(transcript.createdAt || transcript.updatedAt);
  return Boolean(transcriptDateKey && transcriptDateKey < dateKey);
}

function getDateKeyFromIsoLikeText(value: string | undefined) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeListeningVideoId(videoId: string | undefined) {
  return String(videoId ?? "").trim();
}

export function getListeningSourceKey(seed: ListeningLoopSeed, segment: ListeningLoopSegment) {
  return `listening:${getListeningSegmentVideoId(seed, segment)}:${segment.id}`;
}

export function getListeningSegmentVideoId(
  seed: ListeningLoopSeed,
  segment: ListeningLoopSegment
) {
  return segment.sourceVideoId || seed.videoId;
}

export function getListeningSegmentTitle(seed: ListeningLoopSeed, segment: ListeningLoopSegment) {
  return segment.sourceTitle || seed.title;
}

export function getListeningSegmentChannelName(
  seed: ListeningLoopSeed,
  segment: ListeningLoopSegment
) {
  return segment.sourceChannelName || seed.channelName;
}

export function getSeedDurationSeconds(seed: ListeningLoopSeed) {
  if (seed.segments.length === 0) {
    return 0;
  }
  return Math.ceil(
    seed.segments.reduce(
      (total, segment) => total + Math.max(0, segment.end - segment.start),
      0
    )
  );
}

export function getDailyRoutineClipCount(seed: ListeningLoopSeed) {
  const clipIds = new Set(
    seed.segments.map((segment) => segment.routineClipId).filter(Boolean)
  );
  return clipIds.size || seed.segments.length;
}

export function getEntranceStats(
  candidates: ListeningVideoCandidate[],
  transcriptByCandidateId: Map<string, ListeningTranscript>
) {
  let underTenMinutes = 0;
  let unknownDurationCount = 0;
  let readyCount = 0;

  for (const candidate of candidates) {
    const transcript = transcriptByCandidateId.get(candidate.id);
    const duration = getCandidateDuration(candidate, transcript);
    if (!duration) {
      unknownDurationCount += 1;
    } else if (duration.seconds <= LISTENING_RSS_MAX_DURATION_SECONDS) {
      underTenMinutes += 1;
    }
    if (transcript?.status === "ready" && transcript.segments.length > 0) {
      readyCount += 1;
    }
  }

  return {
    candidateCount: candidates.length,
    underTenMinutes,
    readyCount,
    unknownDurationCount
  };
}

export function matchesEntranceQueueFilter(
  candidate: ListeningVideoCandidate,
  transcript: ListeningTranscript | undefined,
  filter: EntranceQueueFilter
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "ready") {
    return Boolean(transcript?.status === "ready" && transcript.segments.length > 0);
  }
  if (filter === "needsTranscript") {
    return !(transcript?.status === "ready" && transcript.segments.length > 0);
  }
  const duration = getCandidateDuration(candidate, transcript);
  return Boolean(duration && duration.seconds <= LISTENING_RSS_MAX_DURATION_SECONDS);
}

export function getEntranceFilterLabel(filter: EntranceQueueFilter) {
  if (filter === "short") {
    return "10분 이하";
  }
  if (filter === "ready") {
    return "루프 준비";
  }
  if (filter === "needsTranscript") {
    return "전사 전";
  }
  return "전체";
}

export function transcriptsToSeeds(transcripts: ListeningTranscript[]): ListeningLoopSeed[] {
  return transcripts
    .filter((transcript) => transcript.status === "ready" && transcript.segments.length > 0)
    .map((transcript) => ({
      id: getTranscriptSeedId(transcript),
      title: transcript.title,
      channelName: transcript.channelName || "YouTube",
      videoId: transcript.videoId,
      languageCode: transcript.languageCode,
      levelLabel: "Whisper",
      topicLabel: "자동 자막",
      recommendedReason: `${transcript.segments.length}개 문장 구간`,
      segments: transcript.segments
        .filter((segment) => segment.text.trim() && segment.end > segment.start)
        .slice()
        .sort((left, right) => left.start - right.start)
        .flatMap((segment, segmentIndex) =>
          splitTranscriptSegmentIntoListeningSegments({
            segment,
            segmentIndex,
            sourceVideoId: transcript.videoId,
            sourceTitle: transcript.title,
            sourceChannelName: transcript.channelName || "YouTube",
            sourceLanguageCode: transcript.languageCode
          })
        )
    }));
}

export function buildDailyRoutineSeed(input: DailyRoutineBuildInput): DailyRoutineBuildResult {
  const dateKey = input.dateKey ?? getLocalDateKey();
  const targetSentenceCount = normalizeRoutineSentenceCount(input.targetSentenceCount);
  const selectedCandidateIds = uniqueStrings(input.selectedCandidateIds);
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const readyCandidateIds: string[] = [];
  const missingCandidateIds: string[] = [];
  const readySources: DailyRoutineReadySource[] = [];

  selectedCandidateIds.forEach((candidateId) => {
    const candidate = candidateById.get(candidateId);
    const transcript = input.transcriptByCandidateId.get(candidateId);
    if (!candidate || !matchesLearningLanguage(candidate.languageCode, input.targetLanguageCode)) {
      missingCandidateIds.push(candidateId);
      return;
    }

    const readyTranscript =
      transcript?.status === "ready" && transcript.segments.length > 0 ? transcript : null;
    if (
      readyTranscript?.languageCode &&
      !matchesLearningLanguage(readyTranscript.languageCode, input.targetLanguageCode)
    ) {
      missingCandidateIds.push(candidateId);
      return;
    }

    if (!readyTranscript) {
      missingCandidateIds.push(candidateId);
      return;
    }

    const sentenceSegments = transcriptToListeningSegments(readyTranscript, candidate);
    if (sentenceSegments.length === 0) {
      missingCandidateIds.push(candidateId);
      return;
    }

    readyCandidateIds.push(candidateId);
    readySources.push({
      candidateId,
      candidate,
      transcript: readyTranscript,
      sentenceSegments
    });
  });

  const clipCandidates = readySources.flatMap((source, sourceOrder) =>
    input.usePartialVideoClips
      ? buildDailyRoutineClipCandidates(source, sourceOrder)
      : buildDailyRoutineFullVideoCandidate(source, sourceOrder)
  );
  const selectedClips = pickDailyRoutineClips(
    clipCandidates,
    targetSentenceCount,
    input.usePartialVideoClips ? DAILY_ROUTINE_CLIP_COUNT : undefined
  );
  const selectedClipIds = new Set(selectedClips.map((clip) => clip.id));
  const allSelectedSegments = selectedClips.flatMap((clip, clipOrder) =>
    copyRoutineClipSegments(clip, dateKey, clipOrder + 1)
  );
  const segments = allSelectedSegments.slice(0, targetSentenceCount);
  const reserveSegments = clipCandidates
    .filter((clip) => !selectedClipIds.has(clip.id))
    .flatMap((clip, clipOrder) =>
      copyRoutineClipSegments(clip, dateKey, selectedClips.length + clipOrder + 1)
    )
    .concat(allSelectedSegments.slice(targetSentenceCount))
    .slice(0, DAILY_ROUTINE_RESERVE_SENTENCE_COUNT);
  const firstSegment = segments[0];
  const seed =
    firstSegment && segments.length > 0
      ? {
          id: `daily-routine:${dateKey}:${normalizeLanguageCode(input.targetLanguageCode) || "unknown"}`,
          title: "오늘 듣기 루틴",
          channelName:
            selectedClips.length > 1
              ? `${selectedClips.length}개 영상 클립`
              : firstSegment.sourceChannelName || "YouTube",
          videoId: firstSegment.sourceVideoId || "",
          languageCode: normalizeLanguageCode(input.targetLanguageCode),
          levelLabel: "Daily",
          topicLabel: "영상 클립",
          recommendedReason: input.usePartialVideoClips
            ? `${selectedClips.length}개 영상 클립 · ${segments.length}/${targetSentenceCount}개 문장`
            : `${selectedClips.length}개 선택 영상 · ${segments.length}/${targetSentenceCount}개 문장`,
          segments
        }
      : null;

  return {
    seed,
    reserveSegments,
    readyCandidateIds,
    missingCandidateIds,
    selectedCandidateIds,
    targetSentenceCount,
    preparedSentenceCount: segments.length
  };
}

export function getTranscriptSeedId(transcript: ListeningTranscript) {
  return `transcript:${transcript.id}`;
}

export function getCandidateSourceLabel(candidate: ListeningVideoCandidate) {
  if (candidate.sourceType === "youtube_extension") {
    return "시청 기반";
  }
  if (candidate.sourceType === "youtube_rss") {
    return "RSS 추천";
  }
  if (candidate.sourceType === "manual") {
    return "직접 추가";
  }
  return "기본 추천";
}

export function getCandidateThumbnailUrl(candidate: ListeningVideoCandidate) {
  return candidate.thumbnailUrl || getYouTubeThumbnailUrl(candidate.videoId);
}

export function getYouTubeWatchUrl(videoId: string, startSeconds = 0) {
  const start = Math.max(0, Math.floor(startSeconds));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${start > 0 ? `&t=${start}s` : ""}`;
}

export function getYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

export function getCandidateTranscriptLabel(
  transcript: ListeningTranscript | undefined,
  isTranscribing: boolean
) {
  if (isTranscribing || transcript?.status === "processing") {
    return "Whisper 생성 중";
  }
  if (transcript?.status === "ready" && transcript.segments.length > 0) {
    return `${transcript.segments.length}문장 루프 열기`;
  }
  if (transcript?.status === "failed") {
    return "다시 만들기";
  }
  return "Whisper 자막 만들기";
}

export function getCandidateDurationInfo(
  candidate: ListeningVideoCandidate,
  transcript: ListeningTranscript | undefined
) {
  const duration = getCandidateDuration(candidate, transcript);
  if (!duration) {
    return {
      label: "시간 미확인",
      tone: "unknown",
      title: "전사 없이 영상 길이를 조회하지 못한 후보입니다. RSS 갱신 때 다시 확인합니다."
    };
  }
  return {
    label: formatVideoDuration(duration.seconds),
    tone: getCandidateDurationTone(duration.seconds),
    title: getCandidateDurationTitle(duration.seconds, duration.source)
  };
}

export function getCandidateDuration(
  candidate: ListeningVideoCandidate,
  transcript: ListeningTranscript | undefined
) {
  const videoDuration =
    normalizeDurationSeconds(candidate.durationSeconds) ??
    normalizeDurationSeconds(candidate.metadata?.durationSeconds) ??
    normalizeDurationSeconds(candidate.metadata?.duration);
  if (videoDuration !== undefined) {
    return { seconds: videoDuration, source: "video" as const };
  }
  const transcriptDuration = getTranscriptDurationSeconds(transcript);
  if (transcriptDuration !== undefined) {
    return { seconds: transcriptDuration, source: "transcript" as const };
  }
  return null;
}

export function getTranscriptDurationSeconds(transcript: ListeningTranscript | undefined) {
  if (!transcript || transcript.status !== "ready" || transcript.segments.length === 0) {
    return undefined;
  }

  let latestEnd = 0;
  for (const segment of transcript.segments) {
    const end = normalizeDurationSeconds(segment.end);
    if (end !== undefined) {
      latestEnd = Math.max(latestEnd, end);
    }
  }
  return normalizeDurationSeconds(latestEnd);
}

export function normalizeDurationSeconds(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return normalizeDurationSeconds(Number(trimmed));
    }
    const hmsMatch = trimmed.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
    if (hmsMatch) {
      const first = Number(hmsMatch[1]);
      const second = Number(hmsMatch[2]);
      const third = hmsMatch[3] ? Number(hmsMatch[3]) : undefined;
      return third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
    }
  }
  return undefined;
}

export function getCandidateDurationTone(seconds: number) {
  if (seconds <= 6 * 60) {
    return "short";
  }
  if (seconds <= 15 * 60) {
    return "medium";
  }
  return "long";
}

export function getCandidateDurationTitle(seconds: number, source: "video" | "transcript") {
  const sourceLabel = source === "video" ? "전사 전 영상 길이 기준" : "자막 길이 기준";
  if (seconds <= 6 * 60) {
    return `${sourceLabel}: 짧은 영상`;
  }
  if (seconds <= 15 * 60) {
    return `${sourceLabel}: 보통 길이`;
  }
  return `${sourceLabel}: 긴 영상은 전체 재생보다 문장 루프로 나눠 듣는 편이 좋습니다.`;
}

export function getBatchTranscriptCandidates(
  candidates: ListeningVideoCandidate[],
  transcriptByCandidateId: Map<string, ListeningTranscript>
) {
  return candidates.filter((candidate) => {
    const transcript = transcriptByCandidateId.get(candidate.id);
    return !(transcript?.status === "ready" && transcript.segments.length > 0);
  });
}

export function getBatchSummary(items: BatchTranscriptItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.status] += 1;
      return summary;
    },
    { done: 0, failed: 0, pending: 0, running: 0 }
  );
}

export function upsertTranscript(transcripts: ListeningTranscript[], transcript: ListeningTranscript) {
  return [
    transcript,
    ...transcripts.filter((item) => item.candidateId !== transcript.candidateId)
  ];
}

export function getBatchStatusLabel(item: BatchTranscriptItem) {
  if (item.status === "done") {
    return "완료";
  }
  if (item.status === "failed") {
    return "실패";
  }
  if (item.status === "running") {
    return "진행 중";
  }
  return "대기";
}

export function getBatchElapsedLabel(item: BatchTranscriptItem, now: number) {
  if (item.elapsedMs !== undefined) {
    return formatDuration(item.elapsedMs);
  }
  if (item.startedAt !== undefined) {
    return formatDuration(now - item.startedAt);
  }
  return "--";
}

export function getCandidateWatchLabel(candidate: ListeningVideoCandidate) {
  if (candidate.watchedSeconds && candidate.watchedSeconds >= 1) {
    return `${Math.round(candidate.watchedSeconds)}초 시청`;
  }
  if (candidate.progressRatio && candidate.progressRatio > 0) {
    return `${Math.round(candidate.progressRatio * 100)}% 지점`;
  }
  return `${candidate.watchCount}회 수집`;
}

export function buildDailyCandidateQueue(candidates: ListeningVideoCandidate[]) {
  const dateKey = getLocalDateKey();
  const byDailyScore = (left: ListeningVideoCandidate, right: ListeningVideoCandidate) =>
    getDailyCandidateScore(dateKey, left) - getDailyCandidateScore(dateKey, right);
  const watched = candidates
    .filter((candidate) => candidate.sourceType === "youtube_extension")
    .sort(byDailyScore);
  const rss = candidates
    .filter(
      (candidate) =>
        candidate.sourceType === "youtube_rss" && isListeningRssCandidateWithinDurationLimit(candidate)
    )
    .sort(byDailyScore);
  const rest = candidates
    .filter(
      (candidate) =>
        candidate.sourceType !== "youtube_extension" && candidate.sourceType !== "youtube_rss"
    )
    .sort(byDailyScore);
  const mixed: ListeningVideoCandidate[] = [];
  const maxLength = Math.max(watched.length, rss.length, rest.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (watched[index]) {
      mixed.push(watched[index]);
    }
    if (rss[index]) {
      mixed.push(rss[index]);
    }
    if (rest[index]) {
      mixed.push(rest[index]);
    }
  }
  return mixed;
}

export function isListeningRssCandidateWithinDurationLimit(candidate: ListeningVideoCandidate) {
  if (candidate.sourceType !== "youtube_rss") {
    return true;
  }
  const durationSeconds =
    normalizeDurationSeconds(candidate.durationSeconds) ??
    normalizeDurationSeconds(candidate.metadata?.durationSeconds) ??
    normalizeDurationSeconds(candidate.metadata?.duration);
  return durationSeconds === undefined || durationSeconds <= LISTENING_RSS_MAX_DURATION_SECONDS;
}

export function hasCandidateVideoDuration(candidate: ListeningVideoCandidate) {
  return (
    normalizeDurationSeconds(candidate.durationSeconds) !== undefined ||
    normalizeDurationSeconds(candidate.metadata?.durationSeconds) !== undefined ||
    normalizeDurationSeconds(candidate.metadata?.duration) !== undefined
  );
}

export function getLocalDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function transcriptToListeningSegments(
  transcript: ListeningTranscript,
  candidate?: ListeningVideoCandidate
) {
  return transcript.segments
    .filter((segment) => segment.text.trim() && segment.end > segment.start)
    .slice()
    .sort((left, right) => left.start - right.start)
    .flatMap((segment, segmentIndex) =>
      splitTranscriptSegmentIntoListeningSegments({
        segment,
        segmentIndex,
        sourceVideoId: transcript.videoId || candidate?.videoId || "",
        sourceTitle: transcript.title || candidate?.title || "YouTube",
        sourceChannelName: transcript.channelName || candidate?.channelName || "YouTube",
        sourceLanguageCode: transcript.languageCode || candidate?.languageCode
      })
    );
}

function buildDailyRoutineClipCandidates(
  source: DailyRoutineReadySource,
  sourceOrder: number
): DailyRoutineClipCandidate[] {
  const sentenceSegments = source.sentenceSegments;
  const firstSentence = sentenceSegments[0];
  const lastSentence = sentenceSegments[sentenceSegments.length - 1];
  if (!firstSentence || !lastSentence) {
    return [];
  }

  const transcriptStart = Math.max(0, firstSentence.start);
  const transcriptEnd = Math.max(...sentenceSegments.map((segment) => segment.end));
  const transcriptDuration = Math.max(0, transcriptEnd - transcriptStart);
  if (transcriptDuration <= 0) {
    return [];
  }

  const clipCount =
    transcriptDuration <= DAILY_ROUTINE_MAX_CLIP_SECONDS
      ? 1
      : Math.min(
          DAILY_ROUTINE_CLIP_COUNT,
          Math.max(1, Math.floor(transcriptDuration / DAILY_ROUTINE_MIN_CLIP_SECONDS))
        );
  const clipLength =
    transcriptDuration <= DAILY_ROUTINE_MAX_CLIP_SECONDS
      ? transcriptDuration
      : clamp(
          transcriptDuration / clipCount,
          DAILY_ROUTINE_MIN_CLIP_SECONDS,
          DAILY_ROUTINE_MAX_CLIP_SECONDS
        );
  const maxStart = Math.max(transcriptStart, transcriptEnd - clipLength);

  return Array.from({ length: clipCount }, (_, clipIndex) => {
    const start =
      clipCount === 1
        ? transcriptStart
        : transcriptStart + ((maxStart - transcriptStart) * clipIndex) / (clipCount - 1);
    const end = Math.min(transcriptEnd, start + clipLength);
    const roundedStart = roundSeconds(start);
    const roundedEnd = roundSeconds(end);
    return {
      id: `${source.candidateId}:clip:${clipIndex + 1}`,
      sourceOrder,
      clipIndex,
      start: roundedStart,
      end: roundedEnd,
      source,
      segments: getSegmentsInRoutineClipWindow(
        sentenceSegments,
        roundedStart,
        roundedEnd,
        clipIndex === clipCount - 1
      )
    };
  }).filter((clip) => clip.segments.length > 0);
}

function buildDailyRoutineFullVideoCandidate(
  source: DailyRoutineReadySource,
  sourceOrder: number
): DailyRoutineClipCandidate[] {
  const firstSentence = source.sentenceSegments[0];
  const lastSentence = source.sentenceSegments[source.sentenceSegments.length - 1];
  if (!firstSentence || !lastSentence) {
    return [];
  }

  return [
    {
      id: `${source.candidateId}:full`,
      sourceOrder,
      clipIndex: 0,
      start: Math.max(0, firstSentence.start),
      end: lastSentence.end,
      source,
      segments: source.sentenceSegments
    }
  ];
}

function getSegmentsInRoutineClipWindow(
  segments: ListeningLoopSegment[],
  start: number,
  end: number,
  includeEnd: boolean
) {
  const matches = segments.filter((segment) => {
    const midpoint = (segment.start + segment.end) / 2;
    return midpoint >= start && (midpoint < end || (includeEnd && midpoint <= end));
  });
  if (matches.length > 0) {
    return matches;
  }

  const center = (start + end) / 2;
  const nearest = segments
    .slice()
    .sort(
      (left, right) =>
        Math.abs((left.start + left.end) / 2 - center) -
        Math.abs((right.start + right.end) / 2 - center)
    )[0];
  return nearest ? [nearest] : [];
}

function pickDailyRoutineClips(
  candidates: DailyRoutineClipCandidate[],
  targetSentenceCount: number,
  maxClipCount?: number
) {
  const usedSegmentKeys = new Set<string>();
  const picked: DailyRoutineClipCandidate[] = [];
  let pickedSentenceCount = 0;
  const sortedCandidates = candidates.slice().sort((left, right) => {
    if (left.clipIndex !== right.clipIndex) {
      return left.clipIndex - right.clipIndex;
    }
    if (left.sourceOrder !== right.sourceOrder) {
      return left.sourceOrder - right.sourceOrder;
    }
    return left.start - right.start;
  });

  for (const candidate of sortedCandidates) {
    const freshSegments = candidate.segments.filter((segment) => {
      const key = getRoutineSegmentKey(segment);
      return !usedSegmentKeys.has(key);
    });
    if (freshSegments.length === 0) {
      continue;
    }
    picked.push({ ...candidate, segments: freshSegments });
    for (const segment of freshSegments) {
      usedSegmentKeys.add(getRoutineSegmentKey(segment));
    }
    pickedSentenceCount += freshSegments.length;
    if (
      pickedSentenceCount >= targetSentenceCount ||
      (maxClipCount !== undefined && picked.length >= maxClipCount)
    ) {
      break;
    }
  }

  return picked;
}

function copyRoutineClipSegments(
  clip: DailyRoutineClipCandidate,
  dateKey: string,
  clipOrder: number
) {
  const routineClipId = `routine-${dateKey}-clip-${clipOrder}-${clip.source.candidateId}`;
  return clip.segments.map((segment, sentenceIndex) => ({
    ...segment,
    id: `${routineClipId}-sentence-${sentenceIndex + 1}-${segment.id}`,
    routineClipId,
    routineClipIndex: clipOrder,
    routineClipStart: clip.start,
    routineClipEnd: clip.end
  }));
}

function getRoutineSegmentKey(segment: ListeningLoopSegment) {
  return `${segment.sourceVideoId || ""}:${segment.id}:${segment.start}:${segment.end}`;
}

function roundSeconds(value: number) {
  return Number(value.toFixed(2));
}

function splitTranscriptSegmentIntoListeningSegments(input: {
  segment: ListeningTranscriptSegment;
  segmentIndex: number;
  sourceVideoId: string;
  sourceTitle: string;
  sourceChannelName: string;
  sourceLanguageCode?: string;
}): ListeningLoopSegment[] {
  const { segment } = input;
  const sentenceParts = splitSentenceParts(segment.text);
  if (sentenceParts.length === 0) {
    return [];
  }
  const translationParts = splitSentenceParts(segment.translationKo ?? "");
  const noteParts = splitSentenceParts(segment.noteKo ?? "");
  const totalWeight = sentenceParts.reduce((sum, part) => sum + part.weight, 0) || 1;
  const segmentDuration = segment.end - segment.start;
  let cursor = segment.start;

  return sentenceParts.map((part, sentenceIndex) => {
    const isLast = sentenceIndex === sentenceParts.length - 1;
    const start = cursor;
    const duration = isLast
      ? segment.end - start
      : segmentDuration * (part.weight / totalWeight);
    const end = isLast ? segment.end : Math.min(segment.end, start + duration);
    const safeStart = Number(start.toFixed(2));
    const safeEnd = Number(Math.min(segment.end, Math.max(end, start + 0.5)).toFixed(2));
    cursor = safeEnd;
    const translationKo =
      translationParts.length === sentenceParts.length
        ? translationParts[sentenceIndex]?.text ?? ""
        : sentenceParts.length === 1
          ? segment.translationKo?.trim() ?? ""
          : "";
    const noteKo =
      noteParts.length === sentenceParts.length
        ? noteParts[sentenceIndex]?.text
        : sentenceParts.length === 1
          ? segment.noteKo?.trim()
          : undefined;

    return {
      id:
        sentenceParts.length === 1
          ? segment.id
          : `${segment.id || `segment-${input.segmentIndex + 1}`}:sentence:${sentenceIndex + 1}`,
      speaker: segment.speaker || "Speaker",
      start: safeStart,
      end: safeEnd,
      text: part.text,
      translationKo,
      noteKo: noteKo || undefined,
      sourceVideoId: input.sourceVideoId,
      sourceTitle: input.sourceTitle,
      sourceChannelName: input.sourceChannelName,
      sourceLanguageCode: input.sourceLanguageCode
    };
  });
}

function splitSentenceParts(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const matches = normalized.match(/[^.!?。？！]+[.!?。？！]+["')\]」』）】]*|[^.!?。？！]+$/gu);
  const parts = (matches && matches.length > 0 ? matches : [normalized])
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((part) => ({
    text: part,
    weight: Math.max(1, [...part.replace(/\s+/g, "")].length)
  }));
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const next = value.trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

function normalizeRoutineSentenceCount(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 30;
  }
  return clamp(Math.round(Number(value)), 5, 100);
}

function normalizeLanguageCode(languageCode: string | undefined) {
  return languageCode?.trim().toLowerCase().split("-")[0];
}

function getDailyCandidateScore(dateKey: string, candidate: ListeningVideoCandidate) {
  const value = `${dateKey}:${candidate.sourceType}:${candidate.videoId}:${candidate.title}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function formatVideoDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`;
  }
  return `${minutes}:${rest}`;
}

export function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function formatDuration(milliseconds: number) {
  const safeSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

export function formatStatusSnippet(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) {
    return normalized;
  }
  return `${normalized.slice(0, 42)}...`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
