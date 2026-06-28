import {
  AlertTriangle,
  BookmarkPlus,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Headphones,
  Highlighter,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Save,
  Wand2,
  X,
  Youtube
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HighlightedText } from "../components/HighlightedText";
import type { LocalEnglishMinerApi } from "../data/api";
import { randomId } from "../shared/ids";
import {
  listeningLoopSeeds,
  type ListeningLoopSeed,
  type ListeningLoopSegment
} from "../shared/listeningLoopSeeds";
import {
  DAILY_ROUTINE_CLIP_COUNT,
  buildDailyRoutineSeed,
  clamp,
  createTranscriptByCandidateId,
  formatDuration,
  formatStatusSnippet,
  formatTime,
  formatVideoDuration,
  getBatchElapsedLabel,
  getBatchStatusLabel,
  getBatchSummary,
  getBatchTranscriptCandidates,
  getCandidateDuration,
  getCandidateDurationInfo,
  getCandidateSourceLabel,
  getCandidateThumbnailUrl,
  getCandidateTranscriptLabel,
  getCandidateWatchLabel,
  getDailyRoutineClipCount,
  getErrorMessage,
  getListeningSourceKey,
  getListeningSegmentChannelName,
  getListeningSegmentTitle,
  getListeningSegmentVideoId,
  getLocalDateKey,
  getSeedDurationSeconds,
  getTranscriptSeedId,
  getVisibleListeningVideoCandidates,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  hasCandidateVideoDuration,
  matchesKnownLearningLanguage,
  transcriptsToSeeds,
  upsertTranscript,
  type BatchTranscriptItem
} from "./listeningLoopUtils";
import {
  createListeningYouTubePlayerBridge,
  getYouTubePlayerErrorMessage,
  getYouTubePlayerErrorTitle,
  suppressYouTubeCaptions,
  type YouTubePlayer
} from "./listeningLoopPlayerBridge";
import {
  getSelectedListeningHighlightText,
  isEditableShortcutTarget,
  normalizeHighlightLookupKey,
  readStoredString,
  writeStoredString
} from "./listeningLoopSelection";
import { createInitialSrs } from "../shared/srs";
import type {
  HighlightMapping,
  InputLanguageCode,
  ListeningTranscript,
  ListeningVideoCandidate,
  AppSettings,
  ProfileId,
  StudyCard
} from "../shared/types";

type ListeningLoopPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  onMissionProgressChanged?: () => Promise<void>;
  onOpenWebReaderUrl: (url: string, label?: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
  profileId: ProfileId;
  settings: AppSettings;
};

const AUTO_TRANSCRIBE_LAST_RUN_KEY = "lem:listeningLoop:autoTranscribeLastRunDate";
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const LISTENING_HIGHLIGHT_LIMIT = 8;

const ROUTINE_STORAGE_PREFIX = "lem:listeningLoop:dailyRoutine";
const ROUTINE_SENTENCE_TARGET_PREFIX = "lem:listeningLoop:dailySentenceTarget";
const LISTENING_HEARD_SENTENCES_PREFIX = "lem:listeningLoop:heardSentences";
const DAILY_ROUTINE_STORAGE_VERSION = 6;
const DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET = 30;
const DAILY_ROUTINE_MIN_SENTENCE_TARGET = 5;
const DAILY_ROUTINE_MAX_SENTENCE_TARGET = 100;

type DailyRoutineState = {
  version: number;
  dateKey: string;
  targetLanguageCode: string;
  partialVideoClipsEnabled: boolean;
  sentenceTargetCount: number;
  seed: ListeningLoopSeed;
  reserveSegments: ListeningLoopSegment[];
  selectedCandidateIds: string[];
  createdAt: string;
};

type PendingShortfallRoutine = {
  state: DailyRoutineState;
  selectedCandidateIds: string[];
  preparedSentenceCount: number;
  targetSentenceCount: number;
};

export function ListeningLoopPage({
  api,
  cards,
  onCardsChanged,
  onMissionProgressChanged,
  onOpenWebReaderUrl,
  onSettingsChange,
  profileId,
  settings
}: ListeningLoopPageProps) {
  const [showEntrance, setShowEntrance] = useState(true);
  const [activeSeedId, setActiveSeedId] = useState(listeningLoopSeeds[0].id);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [videoCovered, setVideoCovered] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [savedSessionKeys, setSavedSessionKeys] = useState<Set<string>>(() => new Set());
  const [heardSentenceKeysToday, setHeardSentenceKeysToday] = useState<Set<string>>(
    () => new Set()
  );
  const [segmentHighlightsBySourceKey, setSegmentHighlightsBySourceKey] = useState<
    Record<string, HighlightMapping[]>
  >({});
  const [saveStatus, setSaveStatus] = useState("");
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [videoCandidates, setVideoCandidates] = useState<ListeningVideoCandidate[]>([]);
  const [transcripts, setTranscripts] = useState<ListeningTranscript[]>([]);
  const [candidateStatus, setCandidateStatus] = useState("");
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [transcribingCandidateId, setTranscribingCandidateId] = useState("");
  const [autoTranscribeLastRunDate, setAutoTranscribeLastRunDate] = useState(() =>
    readStoredString(AUTO_TRANSCRIBE_LAST_RUN_KEY)
  );
  const [dailyRoutineState, setDailyRoutineState] = useState<DailyRoutineState | null>(null);
  const [routineBuilderOpen, setRoutineBuilderOpen] = useState(false);
  const [selectedRoutineCandidateIds, setSelectedRoutineCandidateIds] = useState<string[]>([]);
  const [routineSentenceTarget, setRoutineSentenceTarget] = useState(
    DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET
  );
  const [routineSentenceTargetInput, setRoutineSentenceTargetInput] = useState(
    String(DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET)
  );
  const [isBuildingRoutine, setIsBuildingRoutine] = useState(false);
  const [routineStatus, setRoutineStatus] = useState("");
  const [pendingShortfallRoutine, setPendingShortfallRoutine] =
    useState<PendingShortfallRoutine | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [isBatchTranscribing, setIsBatchTranscribing] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchTranscriptItem[]>([]);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [batchFinishedAt, setBatchFinishedAt] = useState<number | null>(null);
  const [batchNow, setBatchNow] = useState(Date.now());
  const playerHostRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef("");
  const subtitleSourceRef = useRef<HTMLParagraphElement | null>(null);
  const heardSentenceKeysTodayRef = useRef<Set<string>>(new Set());
  const targetLanguageCode = settings.learningProfile.targetLanguage.code;
  const normalizedTargetLanguageCode = normalizeListeningLanguageCode(targetLanguageCode);
  const nativeLanguageCode = settings.learningProfile.nativeLanguage.code;
  const autoTranscribeEnabled = settings.listeningLoopBackgroundPrebuildEnabled;
  const partialVideoClipsEnabled = settings.listeningLoopLongVideoPartialClipsEnabled;
  const dailyRoutineSeed = dailyRoutineState?.seed ?? null;
  const dailyRoutineReserveSegments = dailyRoutineState?.reserveSegments ?? [];
  const generatedSeeds = useMemo(
    () =>
      transcriptsToSeeds(transcripts).filter((seed) =>
        matchesKnownLearningLanguage(seed.languageCode, targetLanguageCode)
      ),
    [targetLanguageCode, transcripts]
  );
  const builtInSeeds = useMemo(
    () =>
      listeningLoopSeeds.filter((seed) =>
        matchesKnownLearningLanguage(seed.languageCode, targetLanguageCode)
      ),
    [targetLanguageCode]
  );
  const allSeeds = useMemo(
    () => [
      ...(dailyRoutineSeed ? [dailyRoutineSeed] : []),
      ...generatedSeeds,
      ...builtInSeeds
    ],
    [builtInSeeds, dailyRoutineSeed, generatedSeeds]
  );
  const activeSeed = useMemo(
    () =>
      allSeeds.find((seed) => seed.id === activeSeedId) ??
      allSeeds[0] ??
      createEmptyListeningSeed(normalizedTargetLanguageCode),
    [activeSeedId, allSeeds, normalizedTargetLanguageCode]
  );
  const hasActiveSeed = allSeeds.length > 0 && activeSeed.segments.length > 0;
  const activeSeedIndex = useMemo(
    () => Math.max(0, allSeeds.findIndex((seed) => seed.id === activeSeed.id)),
    [activeSeed.id, allSeeds]
  );
  const currentSegment =
    activeSeed.segments[segmentIndex] ?? activeSeed.segments[0] ?? createEmptyListeningSegment();
  const currentSegmentVideoId = getListeningSegmentVideoId(activeSeed, currentSegment);
  const currentSegmentTitle = getListeningSegmentTitle(activeSeed, currentSegment);
  const currentSegmentChannelName = getListeningSegmentChannelName(activeSeed, currentSegment);
  const activeUnitLabel = "문장";
  const savedCardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const card of cards) {
      if (card.deckType === "input-listening" && card.targetText?.startsWith("listening:")) {
        keys.add(card.targetText);
      }
    }
    return keys;
  }, [cards]);
  const currentSourceKey = getListeningSourceKey(activeSeed, currentSegment);
  const todayHeardSentenceCount = heardSentenceKeysToday.size;
  const learnedListeningVideoIds = useMemo(
    () =>
      readStoredListeningLearnedVideoIds(
        profileId,
        normalizedTargetLanguageCode,
        cards,
        heardSentenceKeysToday
      ),
    [cards, heardSentenceKeysToday, normalizedTargetLanguageCode, profileId]
  );
  const currentHighlightMappings = segmentHighlightsBySourceKey[currentSourceKey] ?? [];
  const isCurrentSaved =
    savedCardKeys.has(currentSourceKey) || savedSessionKeys.has(currentSourceKey);
  const transcriptByCandidateId = useMemo(() => {
    return createTranscriptByCandidateId(transcripts);
  }, [transcripts]);
  const getVisibleCandidatesForCurrentProfile = useCallback(
    (
      candidates: ListeningVideoCandidate[],
      transcriptMap: Map<string, ListeningTranscript>
    ) =>
      getVisibleListeningVideoCandidates(candidates, transcriptMap, targetLanguageCode, {
        dateKey: getLocalDateKey(),
        excludeReadyTranscriptsBeforeDate: true,
        learnedVideoIds: learnedListeningVideoIds
      }),
    [learnedListeningVideoIds, targetLanguageCode]
  );
  const visibleVideoCandidates = useMemo(
    () => getVisibleCandidatesForCurrentProfile(videoCandidates, transcriptByCandidateId),
    [getVisibleCandidatesForCurrentProfile, transcriptByCandidateId, videoCandidates]
  );
  const batchCandidates = useMemo(
    () => getBatchTranscriptCandidates(visibleVideoCandidates, transcriptByCandidateId),
    [transcriptByCandidateId, visibleVideoCandidates]
  );
  const batchSummary = useMemo(() => getBatchSummary(batchItems), [batchItems]);
  const dailyRoutineQueueCandidates = useMemo(() => {
    const candidateById = new Map(videoCandidates.map((candidate) => [candidate.id, candidate]));
    return (dailyRoutineState?.selectedCandidateIds ?? [])
      .map((candidateId) => candidateById.get(candidateId))
      .filter((candidate): candidate is ListeningVideoCandidate => Boolean(candidate));
  }, [dailyRoutineState?.selectedCandidateIds, videoCandidates]);
  const dailyRoutineReadyCandidateCount = useMemo(
    () =>
      dailyRoutineQueueCandidates.filter((candidate) => {
        const transcript = transcriptByCandidateId.get(candidate.id);
        return transcript?.status === "ready" && transcript.segments.length > 0;
      }).length,
    [dailyRoutineQueueCandidates, transcriptByCandidateId]
  );
  const sideQueueCandidates = dailyRoutineSeed ? dailyRoutineQueueCandidates : visibleVideoCandidates;

  const loadVideoCandidates = useCallback(
    async (options: { fetchRss?: boolean } = {}) => {
      setIsLoadingCandidates(true);
      setCandidateStatus(options.fetchRss ? "RSS 후보를 가져오는 중..." : "");
      try {
        let fetchedCandidates: ListeningVideoCandidate[] = [];
        if (options.fetchRss) {
          fetchedCandidates = await api.listening.fetchRssCandidates(targetLanguageCode);
        }
        const nextCandidates = await api.listening.listVideoCandidates();
        const nextTranscripts = await api.listening.listTranscripts();
        const nextTranscriptByCandidateId = createTranscriptByCandidateId(nextTranscripts);
        const nextVisibleCandidates = getVisibleCandidatesForCurrentProfile(
          nextCandidates,
          nextTranscriptByCandidateId
        );
        setVideoCandidates(nextCandidates);
        setTranscripts(nextTranscripts);
        setCandidateStatus(
          options.fetchRss
            ? fetchedCandidates.length > 0
              ? `${settings.learningProfile.targetLanguage.nameKo} RSS 후보 ${fetchedCandidates.length}개 갱신`
              : `${settings.learningProfile.targetLanguage.nameKo} RSS 후보를 가져오지 못했습니다.`
            : nextVisibleCandidates.length > 0
              ? `${settings.learningProfile.targetLanguage.nameKo} 후보 ${nextVisibleCandidates.length}개`
              : ""
        );
        const missingDurationCandidates = nextVisibleCandidates.filter(
          (candidate) => !hasCandidateVideoDuration(candidate)
        );
        if (missingDurationCandidates.length > 0) {
          setCandidateStatus(`영상 시간 확인 중... (${missingDurationCandidates.length}개)`);
          const refreshedCandidates = await api.listening.refreshVideoCandidateMetadata(
            missingDurationCandidates.map((candidate) => candidate.id)
          );
          setVideoCandidates(refreshedCandidates);
          const refreshedVisibleCandidates = getVisibleCandidatesForCurrentProfile(
            refreshedCandidates,
            nextTranscriptByCandidateId
          );
          const resolvedCount = missingDurationCandidates.filter((candidate) => {
            const refreshed = refreshedCandidates.find((item) => item.id === candidate.id);
            return Boolean(refreshed && hasCandidateVideoDuration(refreshed));
          }).length;
          const unresolvedCount = Math.max(0, missingDurationCandidates.length - resolvedCount);
          setCandidateStatus(
            options.fetchRss
              ? `${settings.learningProfile.targetLanguage.nameKo} RSS 후보 ${refreshedVisibleCandidates.length}개 · 시간 확인 ${resolvedCount}개${unresolvedCount ? ` · 미확인 ${unresolvedCount}개` : ""}`
              : unresolvedCount === 0
                ? `영상 시간 ${resolvedCount}개 확인`
                : `영상 시간 ${resolvedCount}개 확인 · ${unresolvedCount}개 미확인`
          );
        }
      } catch (caught) {
        setCandidateStatus(
          caught instanceof Error ? caught.message : "후보를 가져오지 못했습니다."
        );
      } finally {
        setIsLoadingCandidates(false);
      }
    },
    [
      api,
      getVisibleCandidatesForCurrentProfile,
      settings.learningProfile.targetLanguage.nameKo,
      targetLanguageCode
    ]
  );

  const loadCurrentSegment = useCallback(() => {
    if (!hasActiveSeed || !currentSegmentVideoId || !currentSegment.text) {
      return;
    }
    const player = playerRef.current;
    if (!player) {
      return;
    }
    setPlayerErrorCode(null);
    if (loadedVideoIdRef.current !== currentSegmentVideoId) {
      player.loadVideoById({
        videoId: currentSegmentVideoId,
        startSeconds: currentSegment.start,
        endSeconds: currentSegment.end
      });
      loadedVideoIdRef.current = currentSegmentVideoId;
    } else {
      player.seekTo(currentSegment.start, true);
    }
    player.setLoopRange?.({
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      enabled: isLooping
    });
    suppressYouTubeCaptions(player);
    player.playVideo();
    setIsVideoPlaying(true);
  }, [
    currentSegment.end,
    currentSegment.start,
    currentSegment.text,
    currentSegmentVideoId,
    hasActiveSeed,
    isLooping
  ]);

  const startBatchTranscription = useCallback(
    async (source: "manual" | "auto" = "manual") => {
      if (isBatchTranscribing) {
        setBatchModalOpen(true);
        return;
      }

      const targets = getBatchTranscriptCandidates(visibleVideoCandidates, transcriptByCandidateId);
      const startedAt = Date.now();
      setBatchStartedAt(startedAt);
      setBatchFinishedAt(null);
      setBatchNow(startedAt);
      setBatchItems(
        targets.map((candidate) => ({
          candidateId: candidate.id,
          title: candidate.title,
          channelName: candidate.channelName,
          status: "pending"
        }))
      );
      setBatchModalOpen(true);

      if (source === "auto") {
        const dateKey = getLocalDateKey();
        setAutoTranscribeLastRunDate(dateKey);
        writeStoredString(AUTO_TRANSCRIBE_LAST_RUN_KEY, dateKey);
      }

      if (targets.length === 0) {
        setBatchFinishedAt(Date.now());
        setCandidateStatus("큐에 새로 전사할 영상이 없습니다.");
        return;
      }

      setIsBatchTranscribing(true);
      setCandidateStatus(
        source === "auto"
          ? `자동 전사 시작: ${targets.length}개 후보`
          : `큐 자막 일괄 생성 시작: ${targets.length}개 후보`
      );

      let doneCount = 0;
      let failedCount = 0;

      for (const candidate of targets) {
        const itemStartedAt = Date.now();
        setTranscribingCandidateId(candidate.id);
        setBatchItems((items) =>
          items.map((item) =>
            item.candidateId === candidate.id
              ? { ...item, status: "running", startedAt: itemStartedAt, message: "Whisper 전사 중" }
              : item
          )
        );

        try {
          const result = await api.listening.generateTranscript(candidate.id);
          const itemEndedAt = Date.now();
          const transcript = result.transcript;
          if (transcript) {
            setTranscripts((previous) => upsertTranscript(previous, transcript));
          }

          const ok = Boolean(result.ok && transcript?.status === "ready" && transcript.segments.length > 0);
          if (ok) {
            doneCount += 1;
          } else {
            failedCount += 1;
          }

          setBatchItems((items) =>
            items.map((item) =>
              item.candidateId === candidate.id
                ? {
                    ...item,
                    status: ok ? "done" : "failed",
                    endedAt: itemEndedAt,
                    elapsedMs: itemEndedAt - itemStartedAt,
                    message: result.message,
                    segmentCount: transcript?.segments.length
                  }
                : item
            )
          );
        } catch (caught) {
          failedCount += 1;
          const itemEndedAt = Date.now();
          setBatchItems((items) =>
            items.map((item) =>
              item.candidateId === candidate.id
                ? {
                    ...item,
                    status: "failed",
                    endedAt: itemEndedAt,
                    elapsedMs: itemEndedAt - itemStartedAt,
                    message:
                      caught instanceof Error ? caught.message : "Whisper 전사 생성에 실패했습니다."
                  }
                : item
            )
          );
        }
      }

      setTranscribingCandidateId("");
      setIsBatchTranscribing(false);
      setBatchFinishedAt(Date.now());
      const nextTranscripts = await api.listening.listTranscripts();
      setTranscripts(nextTranscripts);
      setCandidateStatus(`큐 자막 생성 완료: 성공 ${doneCount}개 · 실패 ${failedCount}개`);
    },
    [api, isBatchTranscribing, transcriptByCandidateId, visibleVideoCandidates]
  );

  useEffect(() => {
    void loadVideoCandidates();
  }, [loadVideoCandidates]);

  useEffect(() => {
    const storedTarget = readStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode);
    setRoutineSentenceTarget(storedTarget);
    setRoutineSentenceTargetInput(String(storedTarget));
    setPendingShortfallRoutine(null);
  }, [normalizedTargetLanguageCode, profileId]);

  useEffect(() => {
    const nextKeys = readStoredListeningHeardSentenceKeys(
      profileId,
      normalizedTargetLanguageCode,
      getLocalDateKey()
    );
    heardSentenceKeysTodayRef.current = nextKeys;
    setHeardSentenceKeysToday(nextKeys);
  }, [normalizedTargetLanguageCode, profileId]);

  useEffect(() => {
    const storedRoutine = readStoredDailyRoutineState(
      profileId,
      normalizedTargetLanguageCode,
      partialVideoClipsEnabled
    );
    setDailyRoutineState(storedRoutine);
    if (storedRoutine?.seed) {
      setActiveSeedId(storedRoutine.seed.id);
      setSegmentIndex(0);
      setSubtitleVisible(false);
    }
  }, [normalizedTargetLanguageCode, partialVideoClipsEnabled, profileId]);

  useEffect(() => {
    const visibleIds = new Set(visibleVideoCandidates.map((candidate) => candidate.id));
    setSelectedRoutineCandidateIds((previous) => {
      const kept = previous.filter((candidateId) => visibleIds.has(candidateId));
      if (kept.length > 0) {
        return kept;
      }
      return visibleVideoCandidates.slice(0, 1).map((candidate) => candidate.id);
    });
  }, [visibleVideoCandidates]);

  useEffect(() => {
    if (allSeeds.length === 0) {
      setSegmentIndex(0);
      return;
    }
    if (!allSeeds.some((seed) => seed.id === activeSeedId)) {
      setActiveSeedId(allSeeds[0].id);
      setSegmentIndex(0);
      setSubtitleVisible(false);
    }
  }, [activeSeedId, allSeeds]);

  useEffect(() => {
    if (!isBatchTranscribing) {
      return;
    }

    const timer = window.setInterval(() => {
      setBatchNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [isBatchTranscribing]);

  useEffect(() => {
    if (!autoTranscribeEnabled || isLoadingCandidates || isBatchTranscribing) {
      return;
    }

    const today = getLocalDateKey();
    if (autoTranscribeLastRunDate === today || batchCandidates.length === 0) {
      return;
    }

    void startBatchTranscription("auto");
  }, [
    autoTranscribeEnabled,
    autoTranscribeLastRunDate,
    batchCandidates.length,
    isBatchTranscribing,
    isLoadingCandidates,
    startBatchTranscription
  ]);

  useEffect(() => {
    if (!batchModalOpen || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBatchModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [batchModalOpen]);

  useEffect(() => {
    if (showEntrance || !hasActiveSeed || !currentSegmentVideoId || !playerHostRef.current) {
      return;
    }

    playerRef.current = createListeningYouTubePlayerBridge(playerHostRef.current, {
      videoId: currentSegmentVideoId,
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      loopEnabled: isLooping,
      onReady: () => {
        suppressYouTubeCaptions(playerRef.current);
        setIsPlayerReady(true);
      },
      onStateChange: (state) => {
        setIsVideoPlaying(state === YOUTUBE_PLAYER_STATE_PLAYING);
      },
      onError: (code) => {
        setIsVideoPlaying(false);
        setPlayerErrorCode(code);
      }
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedVideoIdRef.current = "";
      setIsPlayerReady(false);
    };
  }, [currentSegmentVideoId, hasActiveSeed, showEntrance]);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }
    setSubtitleVisible(false);
    setSaveStatus("");
    loadCurrentSegment();
  }, [activeSeed.id, currentSegment.id, isPlayerReady, loadCurrentSegment]);

  useEffect(() => {
    if (!isPlayerReady || !isLooping || !isVideoPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      const currentTime = player.getCurrentTime();
      if (
        currentTime >= currentSegment.end - 0.12 ||
        currentTime < currentSegment.start - 0.5
      ) {
        player.seekTo(currentSegment.start, true);
        player.playVideo();
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [currentSegment.end, currentSegment.start, isLooping, isPlayerReady, isVideoPlaying]);

  useEffect(() => {
    if (!isPlayerReady || isLooping || !isVideoPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      if (player.getCurrentTime() < currentSegment.end - 0.12) {
        return;
      }
      if (segmentIndex < activeSeed.segments.length - 1) {
        setSegmentIndex((index) => Math.min(index + 1, activeSeed.segments.length - 1));
        setSubtitleVisible(false);
        return;
      }
      player.pauseVideo();
      setIsVideoPlaying(false);
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    activeSeed.segments.length,
    currentSegment.end,
    isLooping,
    isPlayerReady,
    isVideoPlaying,
    segmentIndex
  ]);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }
    playerRef.current?.setLoopRange?.({
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      enabled: isLooping
    });
  }, [currentSegment.end, currentSegment.start, isLooping, isPlayerReady]);

  function selectSeed(seed: ListeningLoopSeed) {
    setActiveSeedId(seed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
  }

  function moveVideo(step: number) {
    const nextSeed = allSeeds[clamp(activeSeedIndex + step, 0, Math.max(0, allSeeds.length - 1))];
    if (!nextSeed || nextSeed.id === activeSeed.id) {
      return;
    }
    selectSeed(nextSeed);
    setSaveStatus("");
  }

  async function handleCandidateAction(candidate: ListeningVideoCandidate) {
    const transcript = transcriptByCandidateId.get(candidate.id);
    if (transcript?.status === "ready" && transcript.segments.length > 0) {
      await markListeningCandidatesLearned([candidate.id]);
      setActiveSeedId(getTranscriptSeedId(transcript));
      setSegmentIndex(0);
      setSubtitleVisible(false);
      setCandidateStatus(`${transcript.segments.length}개 문장 루프를 열었습니다.`);
      return;
    }

    setTranscribingCandidateId(candidate.id);
    setCandidateStatus("Whisper 자막을 만드는 중입니다. 영상 길이에 따라 시간이 걸릴 수 있습니다.");
    try {
      const result = await api.listening.generateTranscript(candidate.id);
      const nextTranscripts = await api.listening.listTranscripts();
      setTranscripts(nextTranscripts);
      if (result.transcript?.status === "ready" && result.transcript.segments.length > 0) {
        await markListeningCandidatesLearned([candidate.id]);
        setActiveSeedId(getTranscriptSeedId(result.transcript));
        setSegmentIndex(0);
        setSubtitleVisible(false);
      }
      setCandidateStatus(result.message);
    } catch (caught) {
      setCandidateStatus(
        caught instanceof Error ? caught.message : "Whisper 자막 생성에 실패했습니다."
      );
    } finally {
      setTranscribingCandidateId("");
    }
  }

  async function markListeningCandidatesLearned(candidateIds: string[]) {
    const uniqueIds = [...new Set(candidateIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }
    try {
      const nextCandidates = await api.listening.markVideoCandidatesLearned(uniqueIds);
      setVideoCandidates(nextCandidates);
    } catch {
      // Learning completion is a queue hygiene marker; playback should not fail if it cannot be written.
    }
  }

  async function openRoutineBuilder(options: { refreshRss?: boolean } = { refreshRss: true }) {
    setRoutineBuilderOpen(true);
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds((previous) => {
      const visibleIds = new Set(visibleVideoCandidates.map((candidate) => candidate.id));
      const kept = previous.filter((candidateId) => visibleIds.has(candidateId));
      if (kept.length > 0) {
        return kept;
      }
      return visibleVideoCandidates.slice(0, 1).map((candidate) => candidate.id);
    });
    if (!options.refreshRss || isLoadingCandidates) {
      setRoutineStatus("");
      return;
    }
    setRoutineStatus(`${settings.learningProfile.targetLanguage.nameKo} 추천 후보를 갱신하는 중...`);
    await loadVideoCandidates({ fetchRss: true });
    setRoutineStatus("흥미 가는 영상을 고르면 오늘 들을 문장을 준비해드려요.");
  }

  function toggleRoutineCandidate(candidateId: string) {
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds((previous) => {
      if (previous.includes(candidateId)) {
        return previous.filter((id) => id !== candidateId);
      }
      return [...previous, candidateId];
    });
  }

  function clearRoutineCandidateSelection() {
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds([]);
    setRoutineStatus("선택을 모두 해제했습니다.");
  }

  function autoSelectRoutineCandidates() {
    const candidates = visibleVideoCandidates
      .map((candidate, index) => {
        const transcript = transcriptByCandidateId.get(candidate.id);
        const duration = getCandidateDuration(candidate, transcript);
        const readyScore = transcript?.status === "ready" && transcript.segments.length > 0 ? 100 : 0;
        const durationScore = duration
          ? duration.seconds <= 6 * 60
            ? 40
            : duration.seconds <= 15 * 60
              ? 20
              : 0
          : 10;
        return {
          candidate,
          score: readyScore + durationScore - index
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, DAILY_ROUTINE_CLIP_COUNT)
      .map((item) => item.candidate.id);

    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds(candidates);
    setRoutineStatus(
      candidates.length > 0
        ? `${candidates.length}개 영상을 자동으로 골랐습니다.`
        : "자동으로 고를 추천 영상이 없습니다."
    );
  }

  function updateRoutineSentenceTargetInput(value: string) {
    const nextInput = value.replace(/[^\d]/g, "").slice(0, 3);
    setRoutineSentenceTargetInput(nextInput);
    setPendingShortfallRoutine(null);
    if (!nextInput) {
      return;
    }
    const numericTarget = Number(nextInput);
    if (!Number.isFinite(numericTarget)) {
      return;
    }
    setRoutineSentenceTarget(numericTarget);
    if (
      numericTarget >= DAILY_ROUTINE_MIN_SENTENCE_TARGET &&
      numericTarget <= DAILY_ROUTINE_MAX_SENTENCE_TARGET
    ) {
      writeStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode, numericTarget);
    }
  }

  function commitRoutineSentenceTargetInput() {
    const nextTarget = normalizeRoutineSentenceTarget(routineSentenceTargetInput);
    setRoutineSentenceTarget(nextTarget);
    setRoutineSentenceTargetInput(String(nextTarget));
    setPendingShortfallRoutine(null);
    writeStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode, nextTarget);
    return nextTarget;
  }

  function startDailyRoutineFromEntrance() {
    if (!dailyRoutineSeed) {
      void openRoutineBuilder();
      return;
    }
    setActiveSeedId(dailyRoutineSeed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
    setShowEntrance(false);
  }

  function openDirectYouTubePicker() {
    onOpenWebReaderUrl(
      getListeningYouTubePickerUrl(
        normalizedTargetLanguageCode,
        settings.learningProfile.targetLanguage.nameKo
      ),
      "YouTube 직접 영상 고르기"
    );
  }

  async function buildRoutineFromSelectedCandidates() {
    if (isBuildingRoutine) {
      return;
    }
    const selectedIds = selectedRoutineCandidateIds.filter((candidateId) =>
      visibleVideoCandidates.some((candidate) => candidate.id === candidateId)
    );
    if (selectedIds.length === 0) {
      setRoutineStatus("오늘 루틴에 쓸 추천 영상을 하나 이상 선택하세요.");
      setRoutineBuilderOpen(true);
      return;
    }
    const targetSentenceCount = commitRoutineSentenceTargetInput();

    setIsBuildingRoutine(true);
    setRoutineStatus("선택한 영상의 자막을 준비하는 중...");
    setCandidateStatus("오늘 듣기 루틴 생성 중...");

    const transcriptMap = new Map(transcriptByCandidateId);
    let failedCount = 0;

    try {
      for (const candidateId of selectedIds) {
        const candidate = visibleVideoCandidates.find((item) => item.id === candidateId);
        const existingTranscript = transcriptMap.get(candidateId);
        if (
          !candidate ||
          (existingTranscript?.status === "ready" && existingTranscript.segments.length > 0)
        ) {
          continue;
        }

        setTranscribingCandidateId(candidateId);
        setRoutineStatus(`자막 생성 중: ${candidate.title}`);
        try {
          const result = await api.listening.generateTranscript(candidateId);
          if (result.transcript) {
            transcriptMap.set(candidateId, result.transcript);
            setTranscripts((previous) => upsertTranscript(previous, result.transcript as ListeningTranscript));
          }
          if (!result.ok || !result.transcript?.segments.length) {
            failedCount += 1;
          }
        } catch (caught) {
          failedCount += 1;
          setRoutineStatus(`일부 후보 전사 실패: ${getErrorMessage(caught)}`);
        }
      }

      const nextTranscripts = await api.listening.listTranscripts();
      const nextTranscriptMap = createTranscriptByCandidateId(nextTranscripts);
      setTranscripts(nextTranscripts);

      const result = buildDailyRoutineSeed({
        candidates: visibleVideoCandidates,
        transcriptByCandidateId: nextTranscriptMap,
        selectedCandidateIds: selectedIds,
        targetLanguageCode,
        targetSentenceCount,
        usePartialVideoClips: partialVideoClipsEnabled,
        dateKey: getLocalDateKey()
      });

      if (!result.seed || result.missingCandidateIds.length > 0) {
        setRoutineStatus(
          failedCount > 0
            ? "전사에 실패한 후보가 있어 오늘 루틴을 만들지 못했습니다. 다른 후보를 선택하세요."
            : "선택한 영상에서 문장 루프를 만들 수 있는 전사가 없습니다. 다른 후보를 선택하세요."
        );
        setCandidateStatus("");
        return;
      }

      const nextState: DailyRoutineState = {
        version: DAILY_ROUTINE_STORAGE_VERSION,
        dateKey: getLocalDateKey(),
        targetLanguageCode: normalizedTargetLanguageCode,
        partialVideoClipsEnabled,
        sentenceTargetCount: targetSentenceCount,
        seed: result.seed,
        reserveSegments: result.reserveSegments,
        selectedCandidateIds: result.selectedCandidateIds,
        createdAt: new Date().toISOString()
      };
      if (result.preparedSentenceCount < result.targetSentenceCount) {
        setPendingShortfallRoutine({
          state: nextState,
          selectedCandidateIds: selectedIds,
          preparedSentenceCount: result.preparedSentenceCount,
          targetSentenceCount: result.targetSentenceCount
        });
        setRoutineBuilderOpen(true);
        setRoutineStatus(
          `듣기 문장이 부족합니다. 현재 ${result.preparedSentenceCount}/${result.targetSentenceCount}문장 준비됨. 영상을 더 고르시겠습니까?`
        );
        setCandidateStatus("");
        return;
      }

      await startPreparedDailyRoutine(nextState, selectedIds);
    } finally {
      setTranscribingCandidateId("");
      setIsBuildingRoutine(false);
    }
  }

  async function startPendingShortfallRoutine() {
    if (!pendingShortfallRoutine || isBuildingRoutine) {
      return;
    }
    setIsBuildingRoutine(true);
    try {
      await startPreparedDailyRoutine(
        pendingShortfallRoutine.state,
        pendingShortfallRoutine.selectedCandidateIds
      );
      setPendingShortfallRoutine(null);
    } finally {
      setIsBuildingRoutine(false);
    }
  }

  async function startPreparedDailyRoutine(
    nextState: DailyRoutineState,
    selectedIds: string[]
  ) {
    setDailyRoutineState(nextState);
    writeStoredDailyRoutineState(profileId, normalizedTargetLanguageCode, nextState);
    await markListeningCandidatesLearned(selectedIds);
    setActiveSeedId(nextState.seed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
    setRoutineBuilderOpen(false);
    setRoutineStatus(
      `오늘 루틴 ${getDailyRoutineClipCount(nextState.seed)}개 ${partialVideoClipsEnabled ? "클립" : "영상"} · ${nextState.seed.segments.length}/${nextState.sentenceTargetCount}문장 생성 완료${
        nextState.reserveSegments.length > 0 ? ` · 예비 ${nextState.reserveSegments.length}개` : ""
      }`
    );
    setCandidateStatus(
      `${settings.learningProfile.targetLanguage.nameKo} 오늘 루틴 ${nextState.seed.segments.length}개 문장 생성`
    );
    setShowEntrance(false);
  }

  async function recordCurrentSentenceHeard() {
    if (!hasActiveSeed || !currentSegment.text.trim() || !currentSourceKey) {
      return;
    }

    const dateKey = getLocalDateKey();
    const sourceKey = currentSourceKey;
    if (heardSentenceKeysTodayRef.current.has(sourceKey)) {
      return;
    }

    const nextKeys = new Set(heardSentenceKeysTodayRef.current);
    nextKeys.add(sourceKey);
    heardSentenceKeysTodayRef.current = nextKeys;
    setHeardSentenceKeysToday(nextKeys);
    writeStoredListeningHeardSentenceKeys(
      profileId,
      normalizedTargetLanguageCode,
      dateKey,
      nextKeys
    );

    try {
      await api.missions.recordEvent({
        type: "listening_sentence_completed",
        amount: 1,
        metadata: {
          sourceKey,
          seedId: activeSeed.id,
          segmentId: currentSegment.id,
          videoId: currentSegmentVideoId,
          languageCode: normalizedTargetLanguageCode
        }
      });
      await onMissionProgressChanged?.();
    } catch {
      const rollbackKeys = new Set(heardSentenceKeysTodayRef.current);
      rollbackKeys.delete(sourceKey);
      heardSentenceKeysTodayRef.current = rollbackKeys;
      setHeardSentenceKeysToday(rollbackKeys);
      writeStoredListeningHeardSentenceKeys(
        profileId,
        normalizedTargetLanguageCode,
        dateKey,
        rollbackKeys
      );
      setSaveStatus("오늘 들은 문장 기록에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  function moveSegment(step: number) {
    const nextIndex = clamp(segmentIndex + step, 0, Math.max(0, activeSeed.segments.length - 1));
    if (nextIndex === segmentIndex) {
      return;
    }
    if (step > 0) {
      void recordCurrentSentenceHeard();
    }
    setSegmentIndex(nextIndex);
    setSubtitleVisible(false);
  }

  function replaySegment() {
    playerRef.current?.seekTo(currentSegment.start, true);
    playerRef.current?.playVideo();
    setIsVideoPlaying(true);
  }

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const isPlaying = isVideoPlaying || player.getPlayerState() === YOUTUBE_PLAYER_STATE_PLAYING;
    if (isPlaying) {
      player.pauseVideo();
      setIsVideoPlaying(false);
      return;
    }

    player.playVideo();
    setIsVideoPlaying(true);
  }

  function toggleLooping() {
    setIsLooping((value) => !value);
  }

  function applySelectionHighlight() {
    const selectedText = getSelectedListeningHighlightText(
      subtitleSourceRef.current,
      currentSegment.text
    );
    if (!selectedText) {
      setSubtitleVisible(true);
      setSaveStatus("형광펜 표시할 영어 부분을 드래그한 뒤 F를 누르세요.");
      return;
    }

    const normalizedSelectionKey = normalizeHighlightLookupKey(selectedText);
    if (
      currentHighlightMappings.some(
        (mapping) => normalizeHighlightLookupKey(mapping.sourceText) === normalizedSelectionKey
      )
    ) {
      removeHighlightMapping(selectedText);
      window.getSelection()?.removeAllRanges();
      return;
    }

    if (currentHighlightMappings.length >= LISTENING_HIGHLIGHT_LIMIT) {
      setSaveStatus(`형광펜은 문장당 ${LISTENING_HIGHLIGHT_LIMIT}개까지 표시할 수 있습니다.`);
      return;
    }

    const nextMapping: HighlightMapping = {
      sourceText: selectedText,
      colorKey: "yellow"
    };
    setSegmentHighlightsBySourceKey((previous) => ({
      ...previous,
      [currentSourceKey]: [...(previous[currentSourceKey] ?? []), nextMapping]
    }));
    setSaveStatus(`형광펜 표시: ${formatStatusSnippet(selectedText)}`);
    window.getSelection()?.removeAllRanges();
  }

  function removeHighlightMapping(sourceText: string) {
    setSegmentHighlightsBySourceKey((previous) => {
      const nextMappings = (previous[currentSourceKey] ?? []).filter(
        (mapping) => mapping.sourceText !== sourceText
      );
      const next = { ...previous };
      if (nextMappings.length === 0) {
        delete next[currentSourceKey];
      } else {
        next[currentSourceKey] = nextMappings;
      }
      return next;
    });
    setSaveStatus(`형광펜 제거: ${formatStatusSnippet(sourceText)}`);
  }

  async function saveCurrentSegment() {
    if (isSavingSegment) {
      return;
    }
    if (!hasActiveSeed || !currentSegment.text.trim()) {
      setSaveStatus(`${settings.learningProfile.targetLanguage.nameKo} 듣기 루프 문장을 먼저 준비하세요.`);
      return;
    }
    if (isCurrentSaved) {
      setSaveStatus("이미 인풋-리스닝 덱에 저장된 문장입니다.");
      return;
    }

    const now = new Date();
    const youtubeUrl = `https://www.youtube.com/watch?v=${currentSegmentVideoId}&t=${Math.floor(
      currentSegment.start
    )}s`;
    const card: StudyCard = {
      id: randomId(),
      profileId,
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      languageMetadata: {
        profileTargetLanguageCode: normalizedTargetLanguageCode,
        profileNativeLanguageCode: normalizeListeningLanguageCode(nativeLanguageCode),
        detectedSourceLanguageCode: toInputLanguageCode(
          activeSeed.languageCode || normalizedTargetLanguageCode
        ),
        actualSourceLanguageCode:
          normalizeListeningLanguageCode(activeSeed.languageCode) || normalizedTargetLanguageCode,
        confidence: 1,
        policyStatus: "match",
        sourceKind: "original"
      },
      sourceSentence: currentSegment.text,
      targetText: currentSourceKey,
      frontText: currentSegment.text,
      literalTranslationKo: currentSegment.translationKo,
      naturalTranslationKo: currentSegment.noteKo ?? currentSegment.translationKo,
      highlightMappings: currentHighlightMappings,
      vocabularyItems: [],
      structureNote: [
        `영상: ${currentSegmentTitle}`,
        `채널: ${currentSegmentChannelName}`,
        `화자: ${currentSegment.speaker}`,
        `구간: ${formatTime(currentSegment.start)} - ${formatTime(currentSegment.end)}`,
        `YouTube: ${youtubeUrl}`,
        currentHighlightMappings.length > 0
          ? `형광펜: ${currentHighlightMappings.map((mapping) => mapping.sourceText).join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join("\n"),
      pumpPrompts: [
        {
          type: "question_answer",
          promptKo: "방금 들은 문장을 소리 내어 따라 말해보세요.",
          requiredTerms: []
        }
      ],
      srs: createInitialSrs(now),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    setSaveStatus("저장 중...");
    setIsSavingSegment(true);
    try {
      await api.cards.save(card, profileId);
      setSavedSessionKeys((previous) => {
        const next = new Set(previous);
        next.add(currentSourceKey);
        return next;
      });
      setSaveStatus(`인풋-리스닝에 저장됨: ${formatStatusSnippet(currentSegment.text)}`);
      try {
        await onCardsChanged();
      } catch (caught) {
        setSaveStatus(
          `저장됨. 카드 목록 갱신은 다시 열 때 반영됩니다: ${getErrorMessage(caught)}`
        );
      }
    } catch (caught) {
      setSaveStatus(`카드 저장 실패: ${getErrorMessage(caught)}`);
    } finally {
      setIsSavingSegment(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (showEntrance) {
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "a") {
        event.preventDefault();
        moveVideo(-1);
        return;
      }

      if (event.shiftKey && key === "d") {
        event.preventDefault();
        moveVideo(1);
        return;
      }

      if (key === "s") {
        event.preventDefault();
        if (!event.repeat) {
          togglePlayback();
        }
        return;
      }

      if (key === "q") {
        event.preventDefault();
        if (!event.repeat) {
          toggleLooping();
        }
        return;
      }

      if (key === "f") {
        event.preventDefault();
        if (!event.repeat) {
          applySelectionHighlight();
        }
        return;
      }

      if (key === "a") {
        event.preventDefault();
        moveSegment(-1);
        return;
      }

      if (key === "d") {
        event.preventDefault();
        moveSegment(1);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          setSubtitleVisible((value) => !value);
        }
        return;
      }

      if (key === "r") {
        event.preventDefault();
        if (!event.repeat) {
          void saveCurrentSegment();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  if (showEntrance) {
    const routineCandidates = visibleVideoCandidates;

    if (routineBuilderOpen) {
      return (
        <div
          className="listening-loop-page listening-loop-entrance-page listening-routine-picker-page"
          data-qa="listening-loop-entrance"
        >
          <section className="panel listening-entrance-main listening-routine-picker-main">
            <div className="listening-entrance-hero">
              <div>
                <span className="section-kicker">
                  <Youtube size={16} />
                  영상 고르기
                </span>
                <h2>듣기 연습할 흥미 가는 영상을 골라보세요.</h2>
                <p>
                  {routineStatus ||
                    `${settings.learningProfile.targetLanguage.nameKo} 후보 ${routineCandidates.length}개`}
                </p>
              </div>
              <div className="listening-entrance-hero-actions">
                <button
                  className="button secondary"
                  data-qa="listening-auto-select-routine"
                  type="button"
                  disabled={isLoadingCandidates || isBuildingRoutine || routineCandidates.length === 0}
                  onClick={autoSelectRoutineCandidates}
                >
                  <Wand2 size={16} />
                  자동으로 고르기
                </button>
                <button
                  className="button ghost small"
                  data-qa="listening-clear-routine-selection"
                  type="button"
                  disabled={isBuildingRoutine || selectedRoutineCandidateIds.length === 0}
                  onClick={clearRoutineCandidateSelection}
                >
                  <X size={14} />
                  선택 해제
                </button>
                <button
                  className="button primary"
                  data-qa="listening-build-routine"
                  type="button"
                  disabled={isBuildingRoutine || selectedRoutineCandidateIds.length === 0}
                  onClick={() => void buildRoutineFromSelectedCandidates()}
                >
                  {isBuildingRoutine ? <Loader2 className="spin-icon" size={16} /> : <Wand2 size={16} />}
                  {isBuildingRoutine
                    ? "루틴 생성 중"
                    : `${routineSentenceTarget}문장 루틴 만들기`}
                </button>
                <button
                  className="button ghost small"
                  data-qa="listening-entrance-refresh"
                  type="button"
                  disabled={isLoadingCandidates}
                  onClick={() => void loadVideoCandidates({ fetchRss: true })}
                >
                  <RefreshCw size={14} />
                  후보 갱신
                </button>
                <button
                  className="button ghost small"
                  type="button"
                  disabled={isBuildingRoutine}
                  onClick={() => setRoutineBuilderOpen(false)}
                >
                  홈으로
                </button>
              </div>
            </div>

            <section className="listening-routine-target-panel">
              <div>
                <strong>오늘 들을 문장 수</strong>
                <small>목표 문장 수는 프로필별로 저장됩니다.</small>
              </div>
              <input
                className="text-input listening-routine-target-input"
                data-qa="listening-routine-sentence-target"
                inputMode="numeric"
                maxLength={3}
                pattern="[0-9]*"
                type="text"
                value={routineSentenceTargetInput}
                onBlur={() => commitRoutineSentenceTargetInput()}
                onChange={(event) => updateRoutineSentenceTargetInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </section>

            {pendingShortfallRoutine ? (
              <section className="listening-routine-shortfall" data-qa="listening-routine-shortfall">
                <div>
                  <strong>듣기 문장이 부족합니다.</strong>
                  <small>
                    현재 {pendingShortfallRoutine.preparedSentenceCount}/
                    {pendingShortfallRoutine.targetSentenceCount}문장 준비됨. 영상을 더 고르시겠습니까?
                  </small>
                </div>
                <div className="listening-routine-shortfall-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBuildingRoutine}
                    onClick={() =>
                      setRoutineStatus("후보를 더 선택한 뒤 다시 루틴 만들기를 누르세요.")
                    }
                  >
                    영상 더 고르기
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={isBuildingRoutine}
                    onClick={() => void startPendingShortfallRoutine()}
                  >
                    {pendingShortfallRoutine.preparedSentenceCount}문장으로 시작
                  </button>
                </div>
              </section>
            ) : null}

            <section
              className="listening-routine-builder listening-routine-builder-scene"
              data-qa="listening-routine-builder"
            >
              <div className="listening-entrance-section-head">
                <div>
                  <h3>추천 영상</h3>
                  <p>
                    {partialVideoClipsEnabled
                      ? "첫 선택 영상을 우선으로 20-45초 클립을 만듭니다."
                      : "흥미 가는 영상을 고르면 오늘 들을 문장을 준비해드려요."}
                  </p>
                </div>
                <span>{selectedRoutineCandidateIds.length}개 선택</span>
              </div>
              <div className="listening-routine-source-list">
                {routineCandidates.length > 0 ? (
                  routineCandidates.map((candidate) => {
                    const transcript = transcriptByCandidateId.get(candidate.id);
                    const duration = getCandidateDuration(candidate, transcript);
                    const durationInfo = getCandidateDurationInfo(candidate, transcript);
                    const selectedOrder = selectedRoutineCandidateIds.indexOf(candidate.id) + 1;
                    return (
                      <button
                        className={
                          selectedOrder > 0
                            ? "listening-routine-source selected"
                            : "listening-routine-source"
                        }
                        data-qa="listening-routine-source"
                        data-video-id={candidate.videoId}
                        key={candidate.id}
                        type="button"
                        onClick={() => toggleRoutineCandidate(candidate.id)}
                      >
                        <img alt="" loading="lazy" src={getCandidateThumbnailUrl(candidate)} />
                        <div>
                          <span className="listening-source-order">
                            {selectedOrder > 0 ? `${selectedOrder}순위` : getCandidateSourceLabel(candidate)}
                          </span>
                          <strong>{candidate.title}</strong>
                          <small>
                            {candidate.channelName || "YouTube"} ·{" "}
                            {duration ? formatVideoDuration(duration.seconds) : durationInfo.label} ·{" "}
                            {getCandidateTranscriptLabel(
                              transcript,
                              transcribingCandidateId === candidate.id
                            )}
                          </small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="listening-candidate-empty">
                    {isLoadingCandidates
                      ? `${settings.learningProfile.targetLanguage.nameKo} 추천 후보를 불러오는 중입니다.`
                      : "추천 후보가 없습니다. 후보 갱신을 눌러 현재 프로필 언어의 RSS를 가져오세요."}
                  </div>
                )}
              </div>
            </section>
          </section>
        </div>
      );
    }

    return (
      <div
        className="listening-loop-page listening-loop-entrance-page listening-loop-home-page"
        data-qa="listening-loop-entrance"
      >
        <section className="panel listening-entrance-main listening-home-main">
          <div className="listening-entrance-hero listening-home-hero">
            <div>
              <span className="section-kicker">
                <Headphones size={16} />
                듣기 루프
              </span>
              <h2>오늘 들을 영상을 고르세요.</h2>
              <p>
                추천 영상으로 루틴을 만들거나, YouTube에서 직접 흥미 가는 영상을 고를 수 있습니다.
              </p>
            </div>
          </div>

          <div className="listening-home-action-grid">
            <button
              className="listening-home-action-card primary"
              data-qa="listening-create-routine"
              disabled={isBuildingRoutine}
              type="button"
              onClick={() => void openRoutineBuilder()}
            >
              <span className="listening-home-action-icon">
                <Wand2 size={24} />
              </span>
              <span>
                <strong>오늘 루틴 만들기</strong>
                <small>
                  {settings.learningProfile.targetLanguage.nameKo} 추천 영상에서 오늘 들을 문장을 준비합니다.
                </small>
              </span>
            </button>

            <button
              className="listening-home-action-card"
              data-qa="listening-direct-youtube"
              type="button"
              onClick={openDirectYouTubePicker}
            >
              <span className="listening-home-action-icon">
                <Youtube size={24} />
              </span>
              <span>
                <strong>직접 영상 고르기</strong>
                <small>YouTube를 열고 마음에 드는 영상을 직접 선택합니다.</small>
              </span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="listening-loop-page">
      <section className="panel listening-loop-main">
        <div className="listening-loop-header">
          <div>
            <span className="section-kicker">
              <Headphones size={16} />
              듣기 루프
            </span>
            <h2>{activeSeed.title}</h2>
            <p>
              {currentSegmentTitle} · {currentSegmentChannelName} · {activeSeed.topicLabel}
            </p>
          </div>
          <div className="listening-loop-header-actions">
            <button
              className="button ghost small"
              data-qa="listening-open-entrance"
              type="button"
              onClick={() => setShowEntrance(true)}
            >
              입구
            </button>
            <span className="listening-loop-counter">
              {segmentIndex + 1} / {activeSeed.segments.length}
            </span>
            <span className="listening-loop-counter">
              오늘 들은 문장 {todayHeardSentenceCount}
            </span>
            <span
              className={
                isLooping
                  ? "listening-loop-mode-pill active"
                  : "listening-loop-mode-pill inactive"
              }
            >
              반복 {isLooping ? "ON" : "OFF"}
            </span>
          </div>
        </div>

        <div className="listening-player-shell">
          <iframe
            ref={playerHostRef}
            className="listening-player-frame"
            title="YouTube listening player"
            allow="autoplay; encrypted-media; picture-in-picture"
          />
          {playerErrorCode !== null ? (
            <div className="listening-player-error" data-qa="listening-player-error">
              <AlertTriangle size={28} />
              <strong>{getYouTubePlayerErrorTitle(playerErrorCode)}</strong>
              <span>{getYouTubePlayerErrorMessage(playerErrorCode)}</span>
              <button
                className="button secondary small"
                type="button"
                onClick={() => window.open(getYouTubeWatchUrl(currentSegmentVideoId, currentSegment.start), "_blank")}
              >
                <Youtube size={15} />
                YouTube에서 보기
              </button>
            </div>
          ) : null}
          {videoCovered ? (
            <button
              className="listening-video-cover"
              type="button"
              onClick={() => setVideoCovered(false)}
            >
              <EyeOff size={26} />
              <strong>영상 가림</strong>
              <span>내장 자막이 보이면 이 상태로 듣고, 클릭하면 다시 영상이 보입니다.</span>
            </button>
          ) : null}
        </div>

        <div className="listening-loop-controls">
          <div className="listening-video-controls" aria-label="영상 조작" role="group">
            <button
              className="button secondary"
              data-qa="listening-prev-video"
              type="button"
              disabled={activeSeedIndex === 0}
              onClick={() => moveVideo(-1)}
            >
              <ChevronLeft size={17} />
              이전 영상
              <kbd>Shift+A</kbd>
            </button>
            <button
              className="button primary"
              data-qa="listening-play-toggle"
              type="button"
              disabled={!isPlayerReady}
              onClick={togglePlayback}
            >
              {isVideoPlaying ? <Pause size={17} /> : <Play size={17} />}
              {isVideoPlaying ? "멈춤" : "재생"}
              <kbd>S</kbd>
            </button>
            <button
              className="button secondary"
              data-qa="listening-next-video"
              type="button"
              disabled={activeSeedIndex >= allSeeds.length - 1}
              onClick={() => moveVideo(1)}
            >
              다음 영상
              <ChevronRight size={17} />
              <kbd>Shift+D</kbd>
            </button>
          </div>

          <div className="listening-sentence-controls" aria-label={`${activeUnitLabel} 조작`} role="group">
            <button
              className="button secondary small"
              type="button"
              disabled={segmentIndex === 0}
              onClick={() => moveSegment(-1)}
            >
              <ChevronLeft size={15} />
              이전 {activeUnitLabel}
              <kbd>A</kbd>
            </button>
            <button
              className="button secondary small"
              data-qa="listening-replay-button"
              type="button"
              onClick={replaySegment}
            >
              <RotateCcw size={15} />
              다시 듣기
            </button>
            <button
              className="button secondary small"
              data-qa="listening-subtitle-toggle"
              type="button"
              onClick={() => setSubtitleVisible((value) => !value)}
            >
              {subtitleVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              {subtitleVisible ? "가리기" : "보기"}
              <kbd>Space</kbd>
            </button>
            <button
              aria-pressed={isLooping}
              className={
                isLooping
                  ? "button secondary small listening-loop-toggle active"
                  : "button secondary small listening-loop-toggle inactive"
              }
              data-qa="listening-loop-toggle"
              title={isLooping ? "현재 문장을 반복 재생합니다." : "문장이 끝나면 다음 문장으로 넘어갑니다."}
              type="button"
              onClick={toggleLooping}
            >
              <Repeat2 size={15} />
              반복 {isLooping ? "ON" : "OFF"}
              <kbd>Q</kbd>
            </button>
            <button
              className="button secondary small"
              data-qa="listening-next-segment"
              type="button"
              disabled={segmentIndex >= activeSeed.segments.length - 1}
              onClick={() => moveSegment(1)}
            >
              다음 {activeUnitLabel}
              <ChevronRight size={15} />
              <kbd>D</kbd>
            </button>
          </div>

          <button
            className="button ghost small listening-cover-control"
            data-qa="listening-cover-toggle"
            type="button"
            onClick={() => setVideoCovered((value) => !value)}
          >
            {videoCovered ? <Eye size={15} /> : <EyeOff size={15} />}
            {videoCovered ? "영상 보기" : "영상 가리기"}
          </button>
        </div>

        <section className="listening-subtitle-card">
          <div className="listening-subtitle-head">
            <div>
              <span>
                <Captions size={16} />
                {currentSegment.speaker}
              </span>
              <small>
                {formatTime(currentSegment.start)} - {formatTime(currentSegment.end)}
              </small>
            </div>
            <div className="listening-subtitle-actions">
              <button
                className="button ghost small"
                data-qa="listening-highlight-selection"
                type="button"
                onClick={applySelectionHighlight}
              >
                <Highlighter size={15} />
                형광펜
                <kbd>F</kbd>
              </button>
              <button
                className="button ghost small"
                data-qa="listening-subtitle-toggle"
                type="button"
                onClick={() => setSubtitleVisible((value) => !value)}
              >
                {subtitleVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                {subtitleVisible ? `${activeUnitLabel} 가리기` : `${activeUnitLabel} 보기`}
              </button>
            </div>
          </div>
          {subtitleVisible ? (
            <div className="listening-subtitle-visible">
              <p
                ref={subtitleSourceRef}
                className="listening-subtitle-source"
                data-qa="listening-subtitle-source"
              >
                <HighlightedText
                  text={currentSegment.text}
                  mappings={currentHighlightMappings}
                  target="source"
                />
              </p>
              <small>{currentSegment.translationKo}</small>
              {currentSegment.noteKo ? <em>{currentSegment.noteKo}</em> : null}
            </div>
          ) : (
            <button
              className="listening-subtitle-hidden"
              type="button"
              onClick={() => setSubtitleVisible(true)}
            >
              {activeUnitLabel} 가림
            </button>
          )}
          <div className="listening-save-row">
            <button
              className="button success"
              data-qa="listening-save-segment"
              type="button"
              disabled={isCurrentSaved || isSavingSegment}
              onClick={() => void saveCurrentSegment()}
            >
              {isCurrentSaved ? <BookmarkPlus size={16} /> : <Save size={16} />}
              {isSavingSegment ? "저장 중" : isCurrentSaved ? "저장됨" : "문장 저장"}
            </button>
            <span>{saveStatus || "저장 위치: 인풋-리스닝"}</span>
          </div>
        </section>
      </section>

      <aside className="panel listening-loop-side">
        <div className="listening-candidate-panel">
          <div className="listening-candidate-head">
            <div>
              <strong>오늘 큐</strong>
              <small>
                {dailyRoutineSeed
                  ? `선택 영상 ${dailyRoutineQueueCandidates.length}개 · 전사 ${dailyRoutineReadyCandidateCount}/${dailyRoutineQueueCandidates.length}`
                  : "시청 기록 + RSS 추천"}
              </small>
            </div>
            <button
              className="button ghost small"
              data-qa="listening-refresh-candidates"
              type="button"
              disabled={isLoadingCandidates}
              onClick={() => void loadVideoCandidates({ fetchRss: true })}
            >
              <RefreshCw size={14} />
              갱신
            </button>
          </div>
          {candidateStatus ? <p className="listening-candidate-status">{candidateStatus}</p> : null}
          {!dailyRoutineSeed ? (
            <>
          <div className="listening-batch-actions">
            <button
              className="button primary small"
              data-qa="listening-batch-transcribe"
              type="button"
              disabled={!isBatchTranscribing && batchCandidates.length === 0}
              onClick={() =>
                isBatchTranscribing
                  ? setBatchModalOpen(true)
                  : void startBatchTranscription("manual")
              }
            >
              {isBatchTranscribing ? <Loader2 className="spin-icon" size={14} /> : <Wand2 size={14} />}
              {isBatchTranscribing ? "진행 보기" : "큐 자막 일괄 생성"}
            </button>
            <span>
              남은 후보 {batchCandidates.length}개
              {batchStartedAt ? ` · 최근 ${formatDuration((batchFinishedAt ?? batchNow) - batchStartedAt)}` : ""}
            </span>
          </div>
          <label className="listening-auto-transcribe-toggle">
            <input
              type="checkbox"
              checked={autoTranscribeEnabled}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                onSettingsChange({
                  ...settings,
                  listeningLoopBackgroundPrebuildEnabled: enabled
                });
              }}
            />
            <span>
              백그라운드로 오늘 루틴 미리 준비
              <small>
                {autoTranscribeLastRunDate
                  ? `마지막 자동 실행: ${autoTranscribeLastRunDate}`
                  : "설정이 켜져 있으면 후보 큐가 준비될 때 하루 한 번 자막을 미리 만듭니다."}
              </small>
            </span>
          </label>
            </>
          ) : null}
          <div className="listening-candidate-list">
            {sideQueueCandidates.map((candidate) => {
              const thumbnailUrl = getCandidateThumbnailUrl(candidate);
              const transcript = transcriptByCandidateId.get(candidate.id);
              const duration = getCandidateDuration(candidate, transcript);
              const durationInfo = getCandidateDurationInfo(candidate, transcript);
              return (
                <button
                  className="listening-video-card"
                  key={candidate.id}
                  data-qa="listening-video-card"
                  data-video-id={candidate.videoId}
                  data-candidate-source={candidate.sourceType}
                  data-duration-seconds={duration?.seconds ?? ""}
                  type="button"
                  disabled={transcribingCandidateId === candidate.id}
                  onClick={() => void handleCandidateAction(candidate)}
                >
                  <img alt="" loading="lazy" src={thumbnailUrl} />
                  <div className="listening-video-card-body">
                    <div className="listening-video-card-badges">
                      <span>{getCandidateSourceLabel(candidate)}</span>
                      <span
                        className={`listening-duration-chip ${durationInfo.tone}`}
                        data-qa="listening-duration-chip"
                        data-duration-seconds={duration?.seconds ?? ""}
                        title={durationInfo.title}
                      >
                        <Clock size={11} />
                        {durationInfo.label}
                      </span>
                    </div>
                    <strong>{candidate.title}</strong>
                    <small>
                      {candidate.channelName || "YouTube"} · {getCandidateWatchLabel(candidate)}
                    </small>
                    <em>
                      {getCandidateTranscriptLabel(
                        transcript,
                        transcribingCandidateId === candidate.id
                      )}
                    </em>
                  </div>
                </button>
              );
            })}
            {sideQueueCandidates.length === 0 ? (
              <div className="listening-candidate-empty">
                YouTube를 보거나 갱신을 눌러 후보를 가져오세요.
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel-heading">
          <Youtube size={18} />
          <h2>추천 영상</h2>
        </div>
        <div className="listening-seed-list">
          {builtInSeeds.map((seed) => (
            <button
              className={
                activeSeed.id === seed.id ? "listening-video-card active" : "listening-video-card"
              }
              key={seed.id}
              type="button"
              onClick={() => selectSeed(seed)}
            >
              <img alt="" loading="lazy" src={getYouTubeThumbnailUrl(seed.videoId)} />
              <div className="listening-video-card-body">
                <strong>{seed.title}</strong>
                <small>
                  {seed.channelName} · {seed.levelLabel} · {seed.segments.length}문장
                </small>
                <span>{seed.recommendedReason}</span>
              </div>
            </button>
          ))}
          {builtInSeeds.length === 0 ? (
            <div className="listening-candidate-empty">
              {settings.learningProfile.targetLanguage.nameKo} 기본 추천 영상은 아직 없습니다. RSS 갱신이나
              YouTube 수동 추가로 후보를 준비하세요.
            </div>
          ) : null}
        </div>
      </aside>
      {batchModalOpen ? (
        <div
          className="listening-batch-modal-backdrop"
          role="presentation"
          onMouseDown={() => setBatchModalOpen(false)}
        >
          <section
            aria-modal="true"
            className="listening-batch-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="listening-batch-modal-head">
              <div>
                <span>
                  <Wand2 size={16} />
                  큐 자막 생성
                </span>
                <h2>{isBatchTranscribing ? "Whisper 전사 진행 중" : "전사 결과"}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="닫기"
                onClick={() => setBatchModalOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="listening-batch-summary">
              <div>
                <strong>{batchSummary.done}</strong>
                <span>완료</span>
              </div>
              <div>
                <strong>{batchSummary.running}</strong>
                <span>진행</span>
              </div>
              <div>
                <strong>{batchSummary.failed}</strong>
                <span>실패</span>
              </div>
              <div>
                <strong>{batchItems.length}</strong>
                <span>전체</span>
              </div>
            </div>

            <div className="listening-batch-list">
              {batchItems.length > 0 ? (
                batchItems.map((item, index) => (
                  <div className={`listening-batch-item ${item.status}`} key={item.candidateId}>
                    <div className="listening-batch-item-icon">
                      {item.status === "done" ? <CheckCircle2 size={17} /> : null}
                      {item.status === "failed" ? <AlertTriangle size={17} /> : null}
                      {item.status === "running" ? <Loader2 className="spin-icon" size={17} /> : null}
                      {item.status === "pending" ? <Clock size={17} /> : null}
                    </div>
                    <div>
                      <strong>
                        {index + 1}. {item.title}
                      </strong>
                      <small>
                        {item.channelName || "YouTube"} · {getBatchStatusLabel(item)}
                        {" · "}
                        {getBatchElapsedLabel(item, batchNow)}
                        {typeof item.segmentCount === "number" ? ` · ${item.segmentCount}문장` : ""}
                      </small>
                      {item.message ? <p>{item.message}</p> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="listening-batch-empty">큐에 새로 전사할 후보가 없습니다.</div>
              )}
            </div>

            <div className="listening-batch-footer">
              <span>
                {isBatchTranscribing
                  ? "닫아도 전사는 계속 진행됩니다."
                  : batchStartedAt
                    ? `총 소요 ${formatDuration((batchFinishedAt ?? Date.now()) - batchStartedAt)}`
                    : "대기 중"}
              </span>
              <button
                className="button secondary"
                type="button"
                onClick={() => setBatchModalOpen(false)}
              >
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function getDailyRoutineStorageKey(profileId: ProfileId, targetLanguageCode: string) {
  return `${ROUTINE_STORAGE_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}`;
}

function getRoutineSentenceTargetStorageKey(profileId: ProfileId, targetLanguageCode: string) {
  return `${ROUTINE_SENTENCE_TARGET_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}`;
}

function getListeningHeardSentencesStorageKey(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string
) {
  return `${LISTENING_HEARD_SENTENCES_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}:${dateKey}`;
}

function readStoredListeningHeardSentenceKeys(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string
) {
  if (typeof localStorage === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = localStorage.getItem(
      getListeningHeardSentencesStorageKey(profileId, targetLanguageCode, dateKey)
    );
    if (!raw) {
      return new Set<string>();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeStoredListeningHeardSentenceKeys(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string,
  sentenceKeys: Set<string>
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getListeningHeardSentencesStorageKey(profileId, targetLanguageCode, dateKey),
    JSON.stringify([...sentenceKeys].slice(-500))
  );
}

function readStoredListeningLearnedVideoIds(
  profileId: ProfileId,
  targetLanguageCode: string,
  cards: StudyCard[],
  todaySentenceKeys: Set<string>
) {
  const learnedVideoIds = new Set<string>();
  for (const card of cards) {
    addListeningVideoIdFromSourceKey(learnedVideoIds, card.targetText);
  }
  for (const sourceKey of todaySentenceKeys) {
    addListeningVideoIdFromSourceKey(learnedVideoIds, sourceKey);
  }

  if (typeof localStorage === "undefined") {
    return learnedVideoIds;
  }

  const storagePrefix = `${LISTENING_HEARD_SENTENCES_PREFIX}:${profileId}:${
    targetLanguageCode || "unknown"
  }:`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(storagePrefix)) {
      continue;
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const sourceKey of parsed) {
        if (typeof sourceKey === "string") {
          addListeningVideoIdFromSourceKey(learnedVideoIds, sourceKey);
        }
      }
    } catch {
      // Ignore old or malformed localStorage entries.
    }
  }

  return learnedVideoIds;
}

function addListeningVideoIdFromSourceKey(videoIds: Set<string>, sourceKey: string | undefined) {
  if (!sourceKey?.startsWith("listening:")) {
    return;
  }
  const withoutPrefix = sourceKey.slice("listening:".length);
  const separatorIndex = withoutPrefix.indexOf(":");
  const videoId = (
    separatorIndex >= 0 ? withoutPrefix.slice(0, separatorIndex) : withoutPrefix
  ).trim();
  if (videoId) {
    videoIds.add(videoId);
  }
}

function readStoredRoutineSentenceTarget(profileId: ProfileId, targetLanguageCode: string) {
  if (typeof localStorage === "undefined") {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  const storedValue = localStorage.getItem(
    getRoutineSentenceTargetStorageKey(profileId, targetLanguageCode)
  );
  if (!storedValue) {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  return normalizeRoutineSentenceTarget(storedValue);
}

function writeStoredRoutineSentenceTarget(
  profileId: ProfileId,
  targetLanguageCode: string,
  sentenceTarget: number
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getRoutineSentenceTargetStorageKey(profileId, targetLanguageCode),
    String(normalizeRoutineSentenceTarget(sentenceTarget))
  );
}

function readStoredDailyRoutineState(
  profileId: ProfileId,
  targetLanguageCode: string,
  partialVideoClipsEnabled: boolean
): DailyRoutineState | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(getDailyRoutineStorageKey(profileId, targetLanguageCode));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DailyRoutineState>;
    if (
      parsed.version !== DAILY_ROUTINE_STORAGE_VERSION ||
      parsed.dateKey !== getLocalDateKey() ||
      parsed.targetLanguageCode !== targetLanguageCode ||
      parsed.partialVideoClipsEnabled !== partialVideoClipsEnabled ||
      !parsed.seed ||
      !Array.isArray(parsed.seed.segments) ||
      parsed.seed.segments.length === 0
    ) {
      return null;
    }
    return {
      version: DAILY_ROUTINE_STORAGE_VERSION,
      dateKey: parsed.dateKey,
      targetLanguageCode: parsed.targetLanguageCode,
      partialVideoClipsEnabled,
      sentenceTargetCount: normalizeRoutineSentenceTarget(parsed.sentenceTargetCount),
      seed: parsed.seed,
      reserveSegments: Array.isArray(parsed.reserveSegments) ? parsed.reserveSegments : [],
      selectedCandidateIds: Array.isArray(parsed.selectedCandidateIds)
        ? parsed.selectedCandidateIds.filter((id): id is string => typeof id === "string")
        : [],
      createdAt: parsed.createdAt || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function writeStoredDailyRoutineState(
  profileId: ProfileId,
  targetLanguageCode: string,
  state: DailyRoutineState
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getDailyRoutineStorageKey(profileId, targetLanguageCode),
    JSON.stringify(state)
  );
}

function normalizeRoutineSentenceTarget(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  return clamp(
    Math.round(numeric),
    DAILY_ROUTINE_MIN_SENTENCE_TARGET,
    DAILY_ROUTINE_MAX_SENTENCE_TARGET
  );
}

function getListeningYouTubePickerUrl(targetLanguageCode: string, targetLanguageLabel: string) {
  const normalized = normalizeListeningLanguageCode(targetLanguageCode);
  const queryByLanguage: Record<string, string> = {
    en: "English conversation listening practice",
    ja: "日本語 会話 聞き取り",
    ko: "한국어 회화 듣기"
  };
  const query =
    queryByLanguage[normalized] || `${targetLanguageLabel || targetLanguageCode} listening practice`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function isDailyRoutineSeed(seed: ListeningLoopSeed) {
  return seed.id.startsWith("daily-routine:");
}

function normalizeListeningLanguageCode(languageCode: string | undefined) {
  return String(languageCode ?? "")
    .trim()
    .toLowerCase()
    .split("-")[0];
}

function toInputLanguageCode(languageCode: string | undefined): InputLanguageCode {
  const normalized = normalizeListeningLanguageCode(languageCode);
  return normalized === "en" || normalized === "ja" || normalized === "ko"
    ? normalized
    : "unknown";
}

function createEmptyListeningSeed(targetLanguageCode: string): ListeningLoopSeed {
  return {
    id: `empty:${targetLanguageCode || "unknown"}`,
    title: "듣기 루프 준비 필요",
    channelName: "",
    videoId: "",
    languageCode: targetLanguageCode || undefined,
    levelLabel: "",
    topicLabel: "",
    recommendedReason: "",
    segments: []
  };
}

function createEmptyListeningSegment(): ListeningLoopSegment {
  return {
    id: "empty",
    speaker: "",
    start: 0,
    end: 0,
    text: "",
    translationKo: ""
  };
}
