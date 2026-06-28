import {
  BookmarkPlus,
  Captions,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  FolderOpen,
  FileVideo,
  Home,
  Languages,
  Link,
  ListVideo,
  Loader2,
  Maximize2,
  Minimize2,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Scissors,
  ShieldOff,
  Sparkles,
  Subtitles,
  Type,
  Wand2,
  Youtube
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { LocalEnglishMinerApi } from "../data/api";
import { randomId } from "../shared/ids";
import { createInitialSrs } from "../shared/srs";
import {
  mergeSubtitleSegmentsIntoSentences,
  usesLegacyEmbeddedSubtitleSegments
} from "../shared/subtitleSegments";
import {
  estimateTranslationUsage,
  formatCompactNumber,
  formatKrwRange,
  getTranslationModelName,
  getTranslationProviderLabel,
  type TranslationUsageEstimate
} from "../shared/translationUsage";
import type {
  AppSettings,
  HighlightColorKey,
  HighlightMapping,
  ListeningCardMediaClipInput,
  ListeningTranscript,
  ListeningTranscriptSegment,
  ListeningLocalVideoFile,
  ListeningLocalVideoFolder,
  StudyCardListeningAnnotation,
  ListeningVideoCandidate,
  ProfileId,
  StudyCard
} from "../shared/types";

type VideoReaderPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  profileId: ProfileId;
  settings: AppSettings;
};

type SubtitleMode = "hidden" | "source" | "translation" | "bilingual";
type PlaybackSpeed = 0.75 | 0.9 | 1 | 1.1;
type PlayerMode = "local" | "youtube";
type VideoReaderSideTab = "subtitles" | "playlist" | "settings";
type TranscriptStatusKind = "empty" | "working" | "ready" | "failed";
type SavedVideoFolder = ListeningLocalVideoFolder & {
  id: string;
};
type CaptionWordPopover = {
  word: string;
  normalizedWord: string;
  sourceKey: string;
  segmentId: string;
  x: number;
  y: number;
};
type CaptionTextPart = {
  value: string;
  isWord: boolean;
};
type CaptionHighlightDragState = {
  active: boolean;
  shouldHighlight: boolean;
  touchedKeys: Set<string>;
};
type VideoReaderTranslationConfirm = {
  estimate: TranslationUsageEstimate;
  providerLabel: string;
  totalCount: number;
  untranslatedCount: number;
  skippedCount: number;
};
type VideoReaderTranslationProgress = {
  current: number;
  total: number;
  skippedCount: number;
  currentText?: string;
};
type SaveListeningSegmentCardOptions = {
  textToSave: string;
  targetText: string;
  duplicateMessage: string;
  noteLines: string[];
  successMessagePrefix?: string;
};
type VideoReaderResumeSource =
  | {
      mode: "local";
      filePath: string;
      fileName: string;
      title: string;
      folderPath?: string;
      playbackMessage?: string;
    }
  | {
      mode: "youtube";
      videoId: string;
      url: string;
      candidateId?: string;
    };
type VideoReaderResumeSession = {
  profileId: ProfileId;
  source: VideoReaderResumeSource;
  transcript: ListeningTranscript;
  segmentIndex: number;
  playbackTime: number;
  subtitleMode: SubtitleMode;
  videoCovered: boolean;
  loopEnabled: boolean;
  playbackSpeed: PlaybackSpeed;
  updatedAt: string;
};

type YouTubePlayer = {
  loadVideoById(input: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  cueVideoById?(input: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate?(rate: number): void;
  unloadModule?(moduleName: string): void;
  setOption?(moduleName: string, option: string, value: unknown): void;
  destroy(): void;
};

type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId: string;
        width: string;
        height: string;
        playerVars: Record<string, string | number>;
        events: {
          onReady: () => void;
        };
      }
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

const youtubeApiCallbacks: Array<() => void> = [];
const VIDEO_READER_DRAFT_KEY = "lem:videoReader:manualTranscript";
const VIDEO_READER_FOLDERS_KEY_PREFIX = "lem:videoReader:folders";
const VIDEO_READER_RESUME_KEY_PREFIX = "lem:videoReader:resume";
const VIDEO_READER_FULLSCREEN_RAIL_KEY = "lem:videoReader:fullscreenSubtitleRail";
const VIDEO_READER_R_KEY_CONFIRM_KEY = "lem:videoReader:rKeyConfirm";
const VIDEO_READER_SAVE_FRAME_IMAGE_KEY = "lem:videoReader:saveFrameImage";
const VIDEO_READER_VIDEO_ACCEPT = ".mp4,.m4v,.webm,.mkv,.mov,.avi,video/*";
const playbackSpeeds: PlaybackSpeed[] = [0.75, 0.9, 1, 1.1];
const listeningCardHighlightColorKeys: HighlightColorKey[] = [
  "yellow",
  "cyan",
  "orange",
  "green",
  "blue",
  "purple",
  "pink",
  "lime",
  "red",
  "slate"
];

export function VideoReaderPage({
  api,
  cards,
  onCardsChanged,
  profileId,
  settings
}: VideoReaderPageProps) {
  const [playerMode, setPlayerMode] = useState<PlayerMode>("local");
  const [localVideoUrl, setLocalVideoUrl] = useState("");
  const [localVideoName, setLocalVideoName] = useState("");
  const [localVideoPath, setLocalVideoPath] = useState("");
  const [localVideoFolderPath, setLocalVideoFolderPath] = useState("");
  const [localVideoPlaybackMessage, setLocalVideoPlaybackMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [youtubeCandidate, setYoutubeCandidate] = useState<ListeningVideoCandidate | null>(null);
  const [transcript, setTranscript] = useState<ListeningTranscript>(() => readManualTranscript());
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("hidden");
  const [subtitleBlurred, setSubtitleBlurred] = useState(false);
  const [videoCovered, setVideoCovered] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [shadowingEnabled, setShadowingEnabled] = useState(false);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState("");
  const [selectionText, setSelectionText] = useState("");
  const [captionWordPopover, setCaptionWordPopover] = useState<CaptionWordPopover | null>(null);
  const [highlightedCaptionWordKeys, setHighlightedCaptionWordKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [rKeyConfirmEnabled, setRKeyConfirmEnabled] = useState(() =>
    readRKeyConfirmPreference()
  );
  const [saveFrameImageEnabled, setSaveFrameImageEnabled] = useState(() =>
    readSaveFrameImagePreference()
  );
  const [rKeyConfirmOpen, setRKeyConfirmOpen] = useState(false);
  const [videoReaderSideTab, setVideoReaderSideTab] = useState<VideoReaderSideTab>("subtitles");
  const [subtitleDetailsExpanded, setSubtitleDetailsExpanded] = useState(false);
  const [localPlaylistVideos, setLocalPlaylistVideos] = useState<ListeningLocalVideoFile[]>([]);
  const [isLoadingLocalPlaylist, setIsLoadingLocalPlaylist] = useState(false);
  const [status, setStatus] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtractingEmbeddedSubtitle, setIsExtractingEmbeddedSubtitle] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationConfirm, setTranslationConfirm] = useState<VideoReaderTranslationConfirm | null>(null);
  const [translationProgress, setTranslationProgress] = useState<VideoReaderTranslationProgress | null>(null);
  const [translationNotice, setTranslationNotice] = useState("");
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [isPreparingLocalVideo, setIsPreparingLocalVideo] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [fullscreenSubtitleRailVisible, setFullscreenSubtitleRailVisible] = useState(() =>
    readFullscreenSubtitleRailPreference()
  );
  const [playerFrameStyle, setPlayerFrameStyle] = useState<CSSProperties>({});
  const [resumeSession, setResumeSession] = useState<VideoReaderResumeSession | null>(() =>
    readVideoReaderResumeSession(profileId)
  );
  const [savedVideoFolders, setSavedVideoFolders] = useState<SavedVideoFolder[]>(() =>
    readStoredVideoFolders(profileId)
  );
  const [savedSessionKeys, setSavedSessionKeys] = useState<Set<string>>(() => new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const shadowResumeTimerRef = useRef<number>(0);
  const localVideoLoadRequestRef = useRef(0);
  const pendingResumeSeekRef = useRef<number | null>(null);
  const embeddedSubtitleAutoCheckKeysRef = useRef<Set<string>>(new Set());
  const manualSegmentSeekUntilRef = useRef(0);
  const shouldResumeAfterCaptionHoverRef = useRef(false);
  const captionHoverInsideRef = useRef(false);
  const translationNoticeTimerRef = useRef(0);
  const captionHighlightDragRef = useRef<CaptionHighlightDragState>({
    active: false,
    shouldHighlight: true,
    touchedKeys: new Set()
  });
  const currentSegment = transcript.segments[segmentIndex] ?? null;
  const currentSourceKey = currentSegment
    ? getVideoReaderSourceKey(transcript, currentSegment)
    : "";
  const savedCardsBySourceKey = useMemo(() => {
    const byKey = new Map<string, StudyCard>();
    for (const card of cards) {
      if (card.deckType === "input-listening" && card.targetText?.startsWith("video-reader:")) {
        byKey.set(card.targetText, card);
      }
    }
    return byKey;
  }, [cards]);
  const savedCardKeys = useMemo(() => new Set(savedCardsBySourceKey.keys()), [savedCardsBySourceKey]);
  const currentSavedCard = currentSourceKey ? savedCardsBySourceKey.get(currentSourceKey) : undefined;
  const isCurrentSaved =
    Boolean(currentSourceKey) &&
    ((currentSavedCard ? hasUsableListeningAudio(currentSavedCard) : false) ||
      savedSessionKeys.has(currentSourceKey));
  const captionWordSavedCard = captionWordPopover?.sourceKey
    ? savedCardsBySourceKey.get(captionWordPopover.sourceKey)
    : undefined;
  const isCaptionWordSaved =
    Boolean(captionWordPopover?.sourceKey) &&
    ((captionWordSavedCard ? hasUsableListeningAudio(captionWordSavedCard) : false) ||
      savedSessionKeys.has(captionWordPopover?.sourceKey ?? ""));
  const translationProgressPercent = translationProgress?.total
    ? Math.round((translationProgress.current / translationProgress.total) * 100)
    : 0;
  const selectedTextForCard = selectionText.trim() || currentSegment?.text || "";
  const canUsePlayer = playerMode === "youtube" ? Boolean(youtubeVideoId) : Boolean(localVideoUrl);
  const transcriptStatusKind = getTranscriptStatusKind(transcript, {
    isPreparing: isPreparingLocalVideo,
    isExtracting: isExtractingEmbeddedSubtitle,
    isTranscribing
  });
  const transcriptStatusText = isExtractingEmbeddedSubtitle
    ? "내장 자막 확인 중"
    : getTranscriptStatusText(transcript, transcriptStatusKind);
  const transcriptStatusDetail = getTranscriptStatusDetail(
    transcript,
    transcriptStatusKind,
    isExtractingEmbeddedSubtitle
      ? "영상 안의 텍스트 자막 스트림을 찾고 있습니다."
      : status
  );
  const localPlaylistIndex = useMemo(
    () =>
      localVideoPath
        ? localPlaylistVideos.findIndex(
            (video) => normalizeLocalPathKey(video.filePath) === normalizeLocalPathKey(localVideoPath)
          )
        : -1,
    [localPlaylistVideos, localVideoPath]
  );
  const previousPlaylistVideo =
    localPlaylistIndex > 0 ? localPlaylistVideos[localPlaylistIndex - 1] : null;
  const nextPlaylistVideo =
    localPlaylistIndex >= 0 && localPlaylistIndex < localPlaylistVideos.length - 1
      ? localPlaylistVideos[localPlaylistIndex + 1]
      : null;

  useEffect(() => {
    return () => {
      if (translationNoticeTimerRef.current) {
        window.clearTimeout(translationNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  useEffect(() => {
    setSavedVideoFolders(readStoredVideoFolders(profileId));
    setResumeSession(readVideoReaderResumeSession(profileId));
  }, [profileId]);

  useEffect(() => {
    const shouldRefreshLegacyEmbeddedTranscript = usesLegacyEmbeddedSubtitleSegments(
      transcript.modelName
    );
    if (
      playerMode !== "local" ||
      !localVideoPath ||
      (!shouldRefreshLegacyEmbeddedTranscript && transcript.segments.length > 0) ||
      isPreparingLocalVideo ||
      isExtractingEmbeddedSubtitle ||
      isTranscribing
    ) {
      return;
    }
    const expectedCandidateId = `local-file:${localVideoPath}`;
    if (transcript.candidateId && transcript.candidateId !== expectedCandidateId) {
      return;
    }
    void extractLocalEmbeddedSubtitleForFile(
      localVideoPath,
      transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
      true
    );
  }, [
    playerMode,
    localVideoPath,
    localVideoName,
    transcript.candidateId,
    transcript.modelName,
    transcript.segments.length,
    transcript.title,
    isPreparingLocalVideo,
    isExtractingEmbeddedSubtitle,
    isTranscribing
  ]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const nextIsFullscreen = document.fullscreenElement === playerShellRef.current;
      setIsPlayerFullscreen(nextIsFullscreen);
      void api.app?.setPlayerFullscreen?.(nextIsFullscreen);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      void api.app?.setPlayerFullscreen?.(false);
    };
  }, [api]);

  useEffect(() => {
    if (!canUsePlayer) {
      setPlayerFrameStyle({});
      return;
    }

    let animationFrame = 0;
    const updatePlayerFrame = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const shell = playerShellRef.current;
        const parent = shell?.parentElement;
        if (!shell || !parent) {
          return;
        }
        const shellTop = shell.getBoundingClientRect().top;
        const parentWidth = parent.clientWidth;
        const availableHeight = Math.max(240, window.innerHeight - shellTop - 24);
        const nextWidth = Math.max(320, Math.min(parentWidth, availableHeight * (16 / 9)));
        const nextHeight = nextWidth * (9 / 16);
        const width = `${Math.round(nextWidth)}px`;
        const height = `${Math.round(nextHeight)}px`;
        setPlayerFrameStyle((previous) => {
          if (previous.width === width && previous.height === height) {
            return previous;
          }
          return { width, height };
        });
      });
    };

    updatePlayerFrame();
    const parent = playerShellRef.current?.parentElement;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePlayerFrame)
      : null;
    if (resizeObserver && parent) {
      resizeObserver.observe(parent);
    }
    window.addEventListener("resize", updatePlayerFrame);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePlayerFrame);
    };
  }, [canUsePlayer, playerMode, localVideoName, youtubeVideoId, transcript.segments.length]);

  useEffect(() => {
    if (playerMode !== "youtube" || !youtubeVideoId) {
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !youtubeHostRef.current) {
        return;
      }
      youtubePlayerRef.current?.destroy();
      const youtubeWindow = window as YouTubeWindow;
      youtubePlayerRef.current = new youtubeWindow.YT!.Player(youtubeHostRef.current, {
        videoId: youtubeVideoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          cc_load_policy: 0,
          playsinline: 1
        },
        events: {
          onReady: () => {
            suppressYouTubeCaptions(youtubePlayerRef.current);
            youtubePlayerRef.current?.setPlaybackRate?.(playbackSpeed);
            setIsPlayerReady(true);
          }
        }
      });
    });

    return () => {
      cancelled = true;
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
      setIsPlayerReady(false);
    };
  }, [playerMode, youtubeVideoId]);

  useEffect(() => {
    if (playerMode === "local") {
      const video = videoRef.current;
      if (video) {
        video.playbackRate = playbackSpeed;
      }
      return;
    }
    youtubePlayerRef.current?.setPlaybackRate?.(playbackSpeed);
  }, [playbackSpeed, playerMode]);

  useEffect(() => {
    if (!currentSegment) {
      return;
    }
    clearShadowTimer();
    setSelectionText("");
    setCaptionWordPopover(null);
    setHighlightedCaptionWordKeys(new Set());
    setRKeyConfirmOpen(false);
    shouldResumeAfterCaptionHoverRef.current = false;
    captionHoverInsideRef.current = false;
    endCaptionHighlightDrag();
  }, [currentSegment?.id]);

  useEffect(() => {
    function handleWindowMouseUp() {
      endCaptionHighlightDrag();
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, []);

  useEffect(() => {
    if (!canUsePlayer || transcript.segments.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      syncSegmentWithPlaybackTime();
    }, 220);
    return () => window.clearInterval(timer);
  }, [canUsePlayer, playerMode, transcript.segments, isPlaying]);

  useEffect(() => {
    if (!canUsePlayer || pendingResumeSeekRef.current === null) {
      return;
    }
    if (playerMode === "youtube" && !isPlayerReady) {
      return;
    }
    applyPendingResumeSeek();
  }, [canUsePlayer, playerMode, isPlayerReady, localVideoUrl, youtubeVideoId]);

  useEffect(() => {
    if (!canUsePlayer) {
      return;
    }
    writeCurrentResumeSession();
    const timer = window.setInterval(() => {
      writeCurrentResumeSession();
    }, 1500);
    return () => {
      window.clearInterval(timer);
      writeCurrentResumeSession();
    };
  }, [
    canUsePlayer,
    playerMode,
    localVideoPath,
    localVideoName,
    localVideoPlaybackMessage,
    youtubeVideoId,
    youtubeUrl,
    youtubeCandidate?.id,
    transcript,
    segmentIndex,
    subtitleMode,
    videoCovered,
    loopEnabled,
    playbackSpeed
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!currentSegment || (!loopEnabled && !shadowingEnabled && !autoPauseEnabled)) {
        return;
      }
      const currentTime = getCurrentTime();
      if (currentTime < currentSegment.start - 0.5 || currentTime >= currentSegment.end - 0.08) {
        handleSegmentEnd();
      }
    }, 180);
    return () => window.clearInterval(timer);
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || isEditableShortcutTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        void togglePlayerFullscreen();
        return;
      }
      if (key === "h" || event.key === "Home") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        void goToVideoReaderHome();
        return;
      }
      if (key === "a" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSegment(-1);
        return;
      }
      if (key === "d" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSegment(1);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (autoPauseEnabled && !isPlaying) {
          moveSegment(1);
          return;
        }
        setSubtitleMode((mode) => (mode === "hidden" ? "bilingual" : "hidden"));
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        togglePlayback();
        return;
      }
      if (key === "q") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setSubtitleBlurred((value) => !value);
        return;
      }
      if (key === "r") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        requestRKeyCardSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleSegmentEnd() {
    if (!currentSegment) {
      return;
    }
    if (shadowingEnabled) {
      pausePlayback();
      setStatus("셰도잉: 잠깐 멈춤. 방금 문장을 따라 말해보세요.");
      clearShadowTimer();
      shadowResumeTimerRef.current = window.setTimeout(() => {
        replaySegment();
      }, 2600);
      return;
    }
    if (autoPauseEnabled) {
      pausePlayback();
      setStatus("문장 끝에서 멈췄습니다. Space로 다음 문장.");
      return;
    }
    if (loopEnabled) {
      replaySegment();
    }
  }

  async function handleVideoFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const electronPath = getElectronFilePath(file, api);
    const title = file.name.replace(/\.[^.]+$/, "");
    if (!electronPath) {
      applyLocalVideoFile(
        {
          filePath: "",
          fileName: file.name,
          title,
          fileUrl: objectUrl,
          folderPath: "",
          playbackSource: "original"
        },
        "영상 파일을 불러왔습니다. 자막 파일을 가져오거나 직접 구간을 편집하세요."
      );
      return;
    }

    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setStatus("로컬 영상을 앱 재생용으로 준비하는 중입니다.");
    try {
      const prepared = await api.listening.prepareLocalVideoFile({
        filePath: electronPath,
        fileName: file.name,
        title,
        fileUrl: objectUrl,
        folderPath: getParentFolderPath(electronPath)
      });
      if (localVideoLoadRequestRef.current !== requestId) {
        if (prepared.fileUrl !== objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }
      if (prepared.fileUrl !== objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      applyLocalVideoFile(
        prepared,
        prepared.playbackMessage || "로컬 영상을 불러왔습니다. Whisper 전사를 실행할 수 있습니다."
      );
      void extractLocalEmbeddedSubtitleForFile(prepared.filePath, prepared.title, true);
    } catch (caught) {
      if (localVideoLoadRequestRef.current !== requestId) {
        return;
      }
      applyLocalVideoFile(
        {
          filePath: electronPath,
          fileName: file.name,
          title,
          fileUrl: objectUrl,
          folderPath: getParentFolderPath(electronPath),
          playbackSource: "original"
        },
        caught instanceof Error ? caught.message : "로컬 영상 준비에 실패했습니다. 원본 파일로 시도합니다."
      );
      void refreshLocalVideoPlaylist(getParentFolderPath(electronPath));
    } finally {
      if (localVideoLoadRequestRef.current === requestId) {
        setIsPreparingLocalVideo(false);
      }
    }
  }

  async function pickLocalVideoFile(folderPath?: string) {
    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setStatus("로컬 영상을 선택하고 앱 재생용으로 준비하는 중입니다.");
    const picked = await api.listening.pickLocalVideoFile(folderPath);
    if (localVideoLoadRequestRef.current !== requestId) {
      setIsPreparingLocalVideo(false);
      return;
    }
    if (!picked) {
      setIsPreparingLocalVideo(false);
      setStatus("");
      return;
    }
    applyLocalVideoFile(
      picked,
      picked.playbackMessage || "로컬 영상을 불러왔습니다. Whisper 전사를 실행할 수 있습니다."
    );

    void refreshLocalVideoPlaylist(picked.folderPath ?? getParentFolderPath(picked.filePath));

    const candidateId = `local-file:${picked.filePath}`;
    const existingTranscript = await api.listening.getTranscript(candidateId);
    if (
      existingTranscript?.segments.length &&
      !usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
    ) {
      updateTranscript(existingTranscript);
      setSegmentIndex(0);
      setSubtitleMode("source");
      setStatus("저장된 자막을 불러왔습니다.");
      setIsPreparingLocalVideo(false);
      return;
    }

    updateTranscript({
      ...transcript,
      id: `transcript:${candidateId}`,
      candidateId,
      videoId: `local:${picked.fileName}`,
      title: picked.title,
      channelName: "로컬 파일",
      segments: [],
      status: "ready",
      modelName: "manual-local-video",
      updatedAt: new Date().toISOString()
    });
    setSegmentIndex(0);
    setIsPreparingLocalVideo(false);
    if (
      existingTranscript?.segments.length &&
      usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
    ) {
      setStatus("저장된 내장 자막을 문장 단위로 다시 정리합니다.");
    } else if (existingTranscript) {
      setStatus("저장된 자막이 비어 있어 내장 자막을 다시 확인합니다.");
    }
    void extractLocalEmbeddedSubtitleForFile(picked.filePath, picked.title, true);
  }

  async function addVideoFolder() {
    const picked = await api.listening.pickLocalVideoFolder();
    if (!picked) {
      return;
    }
    setSavedVideoFolders((previous) => {
      const nextFolder: SavedVideoFolder = {
        ...picked,
        id: getVideoFolderId(picked.folderPath)
      };
      const nextFolders = [
        nextFolder,
        ...previous.filter((folder) => folder.id !== nextFolder.id)
      ].slice(0, 12);
      writeStoredVideoFolders(profileId, nextFolders);
      return nextFolders;
    });
    setLocalVideoFolderPath(picked.folderPath);
    setVideoReaderSideTab("playlist");
    void refreshLocalVideoPlaylist(picked.folderPath);
    setStatus(`${picked.folderName} 폴더를 영상 보관함에 추가했습니다.`);
  }

  async function refreshLocalVideoPlaylist(folderPath = localVideoFolderPath) {
    const normalizedFolderPath = folderPath.trim();
    if (!normalizedFolderPath) {
      setLocalPlaylistVideos([]);
      return;
    }
    setIsLoadingLocalPlaylist(true);
    try {
      const videos = await api.listening.listLocalVideoFolderVideos(normalizedFolderPath);
      setLocalPlaylistVideos(videos);
    } catch (caught) {
      setStatus(`재생목록을 불러오지 못했습니다: ${getErrorMessage(caught)}`);
    } finally {
      setIsLoadingLocalPlaylist(false);
    }
  }

  async function openLocalPlaylistVideo(video: ListeningLocalVideoFile) {
    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setVideoReaderSideTab("playlist");
    setStatus("재생목록 영상을 여는 중입니다.");
    try {
      const prepared = await api.listening.prepareLocalVideoFile(video);
      if (localVideoLoadRequestRef.current !== requestId) {
        return;
      }
      applyLocalVideoFile(
        prepared,
        prepared.playbackMessage || "재생목록 영상을 불러왔습니다."
      );
      void refreshLocalVideoPlaylist(prepared.folderPath ?? getParentFolderPath(prepared.filePath));

      const candidateId = `local-file:${prepared.filePath}`;
      const existingTranscript = await api.listening.getTranscript(candidateId);
      if (
        existingTranscript?.segments.length &&
        !usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        updateTranscript(existingTranscript);
        setSegmentIndex(0);
        setSubtitleMode("source");
        setStatus("저장된 자막을 불러왔습니다.");
        return;
      }

      updateTranscript({
        ...transcript,
        id: `transcript:${candidateId}`,
        candidateId,
        videoId: `local:${prepared.fileName}`,
        title: prepared.title,
        channelName: "로컬 파일",
        segments: [],
        status: "ready",
        modelName: "manual-local-video",
        updatedAt: new Date().toISOString()
      });
      setSegmentIndex(0);
      if (
        existingTranscript?.segments.length &&
        usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        setStatus("저장된 내장 자막을 문장 단위로 다시 정리합니다.");
      } else if (existingTranscript) {
        setStatus("저장된 자막이 비어 있어 내장 자막을 다시 확인합니다.");
      }
      void extractLocalEmbeddedSubtitleForFile(prepared.filePath, prepared.title, true);
    } catch (caught) {
      setStatus(`재생목록 영상을 열지 못했습니다: ${getErrorMessage(caught)}`);
    } finally {
      if (localVideoLoadRequestRef.current === requestId) {
        setIsPreparingLocalVideo(false);
      }
    }
  }

  async function resumeLastVideo(nextSubtitleMode?: SubtitleMode) {
    const session = readVideoReaderResumeSession(profileId);
    if (!session) {
      setStatus("이어볼 영상 기록이 없습니다. 파일이나 YouTube 영상을 먼저 열어 주세요.");
      return;
    }
    const nextSegmentIndex = clamp(
      session.segmentIndex,
      0,
      Math.max(0, session.transcript.segments.length - 1)
    );
    const nextPlaybackTime =
      session.playbackTime > 0
        ? session.playbackTime
        : session.transcript.segments[nextSegmentIndex]?.start ?? 0;

    setResumeSession(session);
    setSubtitleMode(nextSubtitleMode ?? session.subtitleMode ?? "hidden");
    setVideoCovered(session.videoCovered);
    setLoopEnabled(session.loopEnabled);
    setPlaybackSpeed(session.playbackSpeed);
    pendingResumeSeekRef.current = nextPlaybackTime;

    if (session.source.mode === "youtube") {
      setPlayerMode("youtube");
      setYoutubeUrl(session.source.url);
      setYoutubeVideoId(session.source.videoId);
      setYoutubeCandidate(null);
      setLocalVideoUrl("");
      setLocalVideoName("");
      setLocalVideoPath("");
      setLocalVideoFolderPath("");
      setLocalVideoPlaybackMessage("");
      setLocalPlaylistVideos([]);
      updateTranscript(session.transcript);
      setSegmentIndex(nextSegmentIndex);
      setStatus(`이어보기: ${session.transcript.title || "YouTube 영상"}`);
      return;
    }

    setIsPreparingLocalVideo(true);
    setStatus("이전 로컬 영상을 다시 여는 중입니다.");
    try {
      const prepared = await api.listening.prepareLocalVideoFile({
        filePath: session.source.filePath,
        fileName: session.source.fileName,
        title: session.source.title,
        fileUrl: getLocalVideoFileUrl(session.source.filePath),
        folderPath: session.source.folderPath ?? getParentFolderPath(session.source.filePath)
      });
      pendingResumeSeekRef.current = nextPlaybackTime;
      applyLocalVideoFile(
        prepared,
        `이어보기: ${session.transcript.title || session.source.title || session.source.fileName}`
      );
      void refreshLocalVideoPlaylist(prepared.folderPath ?? getParentFolderPath(prepared.filePath));
      updateTranscript(session.transcript);
      setSegmentIndex(nextSegmentIndex);
    } catch (caught) {
      setStatus(`이어보기 실패: ${getErrorMessage(caught)}`);
    } finally {
      setIsPreparingLocalVideo(false);
    }
  }

  function applyLocalVideoFile(
    picked: {
      filePath: string;
      fileName: string;
      title: string;
      fileUrl: string;
      folderPath?: string;
      playbackMessage?: string;
      playbackSource?: "original" | "remuxed";
    },
    nextStatus: string
  ) {
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }
    setPlayerMode("local");
    setLocalVideoUrl(picked.fileUrl);
    setLocalVideoName(picked.fileName);
    setLocalVideoPath(picked.filePath);
    setLocalVideoFolderPath(picked.folderPath ?? getParentFolderPath(picked.filePath));
    setLocalVideoPlaybackMessage(picked.playbackMessage ?? "");
    setYoutubeVideoId("");
    setYoutubeCandidate(null);
    setTranscript((previous) => ({
      ...previous,
      id: `manual-video:${picked.fileName}:${Date.now()}`,
      candidateId: picked.filePath ? `local-file:${picked.filePath}` : `manual-video:${picked.fileName}`,
      videoId: `local:${picked.fileName}`,
      title: picked.title || picked.fileName.replace(/\.[^.]+$/, ""),
      status: "ready",
      segments: [],
      modelName: "manual-local-video",
      createdAt: new Date().toISOString(),
      channelName: "로컬 파일",
      updatedAt: new Date().toISOString()
    }));
    setSegmentIndex(0);
    setStatus(nextStatus);
  }

  function buildCurrentResumeSession(playbackTime = getCurrentTime()): VideoReaderResumeSession | null {
    let source: VideoReaderResumeSource | null = null;
    if (playerMode === "local") {
      if (!localVideoPath) {
        return null;
      }
      source = {
        mode: "local",
        filePath: localVideoPath,
        fileName: localVideoName || getVideoFolderNameFromPath(localVideoPath),
        title: transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
        folderPath: localVideoFolderPath || getParentFolderPath(localVideoPath) || undefined,
        playbackMessage: localVideoPlaybackMessage || undefined
      };
    } else if (youtubeVideoId) {
      source = {
        mode: "youtube",
        videoId: youtubeVideoId,
        url: youtubeUrl.trim() || `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        candidateId: youtubeCandidate?.id
      };
    }
    if (!source) {
      return null;
    }
    return {
      profileId,
      source,
      transcript,
      segmentIndex,
      playbackTime: Number.isFinite(playbackTime) ? Math.max(0, playbackTime) : 0,
      subtitleMode,
      videoCovered,
      loopEnabled,
      playbackSpeed,
      updatedAt: new Date().toISOString()
    };
  }

  function writeCurrentResumeSession(playbackTime?: number) {
    const nextPlaybackTime =
      playbackTime ?? pendingResumeSeekRef.current ?? getCurrentTime();
    const session = buildCurrentResumeSession(nextPlaybackTime);
    if (!session) {
      return;
    }
    writeVideoReaderResumeSession(profileId, session);
    setResumeSession(session);
  }

  async function goToVideoReaderHome() {
    if (!canUsePlayer) {
      return;
    }
    const playbackTime = getCurrentTime();
    writeCurrentResumeSession(playbackTime);
    clearShadowTimer();
    setCaptionWordPopover(null);
    setSelectionText("");
    setRKeyConfirmOpen(false);
    shouldResumeAfterCaptionHoverRef.current = false;
    captionHoverInsideRef.current = false;
    pausePlayback();

    try {
      if (document.fullscreenElement === playerShellRef.current) {
        await document.exitFullscreen();
        await api.app?.setPlayerFullscreen?.(false);
      }
    } catch {
      // Home navigation should still work if fullscreen teardown is rejected.
    }

    setPlayerMode("local");
    setLocalVideoUrl("");
    setLocalVideoName("");
    setLocalVideoPath("");
    setLocalVideoFolderPath("");
    setLocalVideoPlaybackMessage("");
    setYoutubeVideoId("");
    setYoutubeCandidate(null);
    setIsPlayerReady(false);
    setStatus("영상 홈으로 이동했습니다. 이어보기에서 방금 보던 위치로 돌아갈 수 있습니다.");
  }

  async function extractLocalEmbeddedSubtitleForFile(
    filePath = localVideoPath,
    title = transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
    auto = false
  ) {
    if (!filePath) {
      setStatus("내장 자막은 앱에서 연 로컬 영상 파일에서만 확인할 수 있습니다.");
      return false;
    }
    const autoCheckKey = `${filePath}:${transcript.modelName ?? "no-transcript"}`;
    if (auto && embeddedSubtitleAutoCheckKeysRef.current.has(autoCheckKey)) {
      return false;
    }
    if (auto) {
      embeddedSubtitleAutoCheckKeysRef.current.add(autoCheckKey);
    }
    setIsExtractingEmbeddedSubtitle(true);
    setStatus(auto ? "내장 자막을 자동으로 확인하는 중입니다." : "내장 자막을 가져오는 중입니다.");
    try {
      const result = await api.listening.extractLocalEmbeddedSubtitle({
        filePath,
        title,
        languageCode: settings.learningProfile.targetLanguage.code
      });
      if (result.transcript?.segments.length) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        setSubtitleMode("source");
        setVideoCovered(false);
        setStatus(`내장 자막 ${result.transcript.segments.length}개 문장을 가져왔습니다.`);
        return true;
      }
      setStatus(result.message || "텍스트 내장 자막을 찾지 못했습니다. Whisper 전사를 실행하세요.");
      return false;
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "내장 자막을 가져오지 못했습니다.");
      return false;
    } finally {
      setIsExtractingEmbeddedSubtitle(false);
    }
  }

  async function transcribeLocalVideo() {
    if (!localVideoPath) {
      setStatus("Whisper 전사는 Electron 파일 선택으로 불러온 로컬 영상에서 실행됩니다.");
      return;
    }
    setIsTranscribing(true);
    setStatus("로컬 영상을 Whisper로 전사하는 중입니다.");
    try {
      const result = await api.listening.generateLocalTranscript({
        filePath: localVideoPath,
        title: transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
        languageCode: settings.learningProfile.targetLanguage.code
      });
      if (result.transcript) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        if (result.transcript.segments.length) {
          setSubtitleMode("source");
          setVideoCovered(false);
        }
      }
      setStatus(
        result.transcript?.segments.length
          ? `Whisper 전사 완료: ${result.transcript.segments.length}개 문장`
          : result.message || "Whisper 전사는 끝났지만 자막 문장을 만들지 못했습니다."
      );
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "로컬 영상 Whisper 전사에 실패했습니다.");
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleSubtitleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    const segments = parseSubtitleText(text);
    if (segments.length === 0) {
      setStatus("자막 파일에서 문장 구간을 찾지 못했습니다.");
      return;
    }
    updateTranscript({
      ...transcript,
      title: transcript.title || file.name.replace(/\.[^.]+$/, ""),
      segments,
      status: "ready",
      modelName: "imported-subtitle",
      updatedAt: new Date().toISOString()
    });
    setSegmentIndex(0);
    setSubtitleMode("source");
    setStatus(`${segments.length}개 자막 구간을 가져왔습니다.`);
  }

  async function prepareYoutube() {
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      setStatus("YouTube URL을 확인하지 못했습니다.");
      return;
    }
    setPlayerMode("youtube");
    setLocalVideoFolderPath("");
    setLocalPlaylistVideos([]);
    setYoutubeVideoId(videoId);
    setStatus("YouTube 영상을 준비했습니다. Whisper 전사를 실행할 수 있습니다.");
    const candidate = await api.listening.saveVideoCandidate({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `YouTube ${videoId}`,
      sourceType: "manual",
      languageCode: settings.learningProfile.targetLanguage.code,
      channelName: "직접 추가",
      collectedAt: new Date().toISOString()
    });
    setYoutubeCandidate(candidate);
    const existingTranscript = await api.listening.getTranscript(candidate.id);
    if (existingTranscript) {
      updateTranscript(existingTranscript);
      setSegmentIndex(0);
      if (existingTranscript.segments.length) {
        setSubtitleMode("source");
      }
      setStatus("저장된 전사 자막을 불러왔습니다.");
    }
  }

  async function pasteYoutubeUrlFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setStatus("클립보드에 붙여넣을 URL이 없습니다.");
        return;
      }
      setYoutubeUrl(clipboardText.trim());
      setStatus("클립보드 URL을 입력했습니다. YouTube 열기를 눌러 시작하세요.");
    } catch {
      setStatus("클립보드를 읽지 못했습니다. URL을 직접 붙여넣어 주세요.");
    }
  }

  async function transcribeYoutube() {
    const candidate = youtubeCandidate;
    if (!candidate) {
      await prepareYoutube();
      return;
    }
    setIsTranscribing(true);
    setStatus("Whisper로 자막을 전사하는 중입니다.");
    try {
      const result = await api.listening.generateTranscript(candidate.id);
      if (result.transcript) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        if (result.transcript.segments.length) {
          setSubtitleMode("source");
          setVideoCovered(false);
        }
      }
      setStatus(
        result.transcript?.segments.length
          ? `Whisper 전사 완료: ${result.transcript.segments.length}개 문장`
          : result.message || "Whisper 전사는 끝났지만 자막 문장을 만들지 못했습니다."
      );
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Whisper 전사에 실패했습니다.");
    } finally {
      setIsTranscribing(false);
    }
  }

  function showTranslationNotice(message: string) {
    setTranslationConfirm(null);
    setTranslationProgress(null);
    setTranslationNotice(message);
    if (translationNoticeTimerRef.current) {
      window.clearTimeout(translationNoticeTimerRef.current);
    }
    translationNoticeTimerRef.current = window.setTimeout(() => {
      setTranslationNotice("");
      translationNoticeTimerRef.current = 0;
    }, 3200);
  }

  function requestTranslateAllSegments() {
    if (transcript.segments.length === 0 || isTranslating) {
      if (transcript.segments.length === 0) {
        showTranslationNotice("번역할 자막 문장이 없습니다.");
      }
      return;
    }
    const untranslatedSegments = getUntranslatedTranscriptSegments(transcript.segments);
    if (untranslatedSegments.length === 0) {
      setStatus("이미 모든 자막에 번역이 있습니다.");
      showTranslationNotice("이미 모든 자막에 번역이 있습니다.");
      return;
    }
    const providerName = getVideoReaderTranslationProviderName();
    const estimate = estimateTranslationUsage({
      texts: untranslatedSegments.map((segment) => ({ text: segment.text, cacheStatus: "miss" })),
      providerName,
      model: getTranslationModelName(settings),
      plan: settings.geminiPlan,
      sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
      targetLang: settings.learningProfile.nativeLanguage.code,
      dailyAppTokenLimit: settings.dailyAppTokenLimit,
      monthlySpendLimitKrw: settings.monthlySpendLimitKrw
    });
    setTranslationConfirm({
      estimate,
      providerLabel:
        settings.translationProviderName === "browser"
          ? `${getTranslationProviderLabel(settings)} → 로컬 번역기`
          : getTranslationProviderLabel(settings),
      totalCount: transcript.segments.length,
      untranslatedCount: untranslatedSegments.length,
      skippedCount: transcript.segments.length - untranslatedSegments.length
    });
    setTranslationProgress(null);
    setTranslationNotice("");
    setStatus(
      `번역 전 확인: ${untranslatedSegments.length}개 문장, 예상 ${formatKrwRange(
        estimate.estimatedCostKrw
      )}`
    );
  }

  function getVideoReaderTranslationProviderName() {
    return settings.translationProviderName === "browser"
      ? "localMt"
      : settings.translationProviderName;
  }

  async function confirmTranslateAllSegments() {
    setTranslationConfirm(null);
    await translateAllSegments();
  }

  async function translateAllSegments() {
    if (transcript.segments.length === 0 || isTranslating) {
      return;
    }
    const untranslatedTotal = getUntranslatedTranscriptSegments(transcript.segments).length;
    if (untranslatedTotal === 0) {
      setStatus("이미 모든 자막에 번역이 있습니다.");
      showTranslationNotice("이미 모든 자막에 번역이 있습니다.");
      return;
    }
    setIsTranslating(true);
    setTranslationNotice("");
    setTranslationProgress({
      current: 0,
      total: untranslatedTotal,
      skippedCount: transcript.segments.length - untranslatedTotal
    });
    setStatus(`자막 번역 시작: 0/${untranslatedTotal}`);
    try {
      const translatedSegments: ListeningTranscriptSegment[] = [];
      let translatedCount = 0;
      for (let index = 0; index < transcript.segments.length; index += 1) {
        const segment = transcript.segments[index];
        if (segment.translationKo?.trim()) {
          translatedSegments.push(segment);
          continue;
        }
        setTranslationProgress({
          current: translatedCount,
          total: untranslatedTotal,
          skippedCount: transcript.segments.length - untranslatedTotal,
          currentText: segment.text
        });
        setStatus(`번역 중 ${translatedCount + 1}/${untranslatedTotal}`);
        const result = await api.translations.translate({
          text: segment.text,
          sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code,
          providerName:
            getVideoReaderTranslationProviderName(),
          model: getTranslationModelName(settings),
          googleApiKey: settings.googleTranslateApiKey,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          geminiPlan: settings.geminiPlan,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          ollamaModel: settings.ollamaModel,
          sourceLanguage: settings.learningProfile.targetLanguage,
          outputLanguage: settings.learningProfile.nativeLanguage
        });
        translatedSegments.push({
          ...segment,
          translationKo: result.translatedText
        });
        translatedCount += 1;
        setTranslationProgress({
          current: translatedCount,
          total: untranslatedTotal,
          skippedCount: transcript.segments.length - untranslatedTotal,
          currentText: segment.text
        });
      }
      const nextTranscript = {
        ...transcript,
        segments: translatedSegments,
        updatedAt: new Date().toISOString()
      };
      await persistTranscript(nextTranscript);
      setStatus("전체 자막 번역을 완료했습니다.");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "자막 번역에 실패했습니다.");
    } finally {
      setIsTranslating(false);
      setTranslationProgress(null);
    }
  }

  function updateCurrentSegment(patch: Partial<ListeningTranscriptSegment>) {
    if (!currentSegment) {
      return;
    }
    const nextTranscript = {
      ...transcript,
      segments: transcript.segments.map((segment) =>
        segment.id === currentSegment.id ? { ...segment, ...patch } : segment
      ),
      updatedAt: new Date().toISOString()
    };
    updateTranscript(nextTranscript);
  }

  async function saveCurrentSegmentEdits() {
    await persistTranscript(transcript);
    setEditingSegmentId("");
    setStatus("자막 수정을 저장했습니다.");
  }

  async function saveCurrentSegmentCard() {
    return saveListeningSegmentCard({
      textToSave: selectedTextForCard,
      targetText: currentSourceKey,
      duplicateMessage: "이미 인풋-리스닝 덱에 저장된 문장입니다.",
      noteLines: [selectionText ? `선택: ${selectionText}` : "문장 전체 저장"]
    });
  }

  function updateRKeyConfirmPreference(enabled: boolean) {
    setRKeyConfirmEnabled(enabled);
    writeRKeyConfirmPreference(enabled);
    if (!enabled) {
      setRKeyConfirmOpen(false);
    }
  }

  function updateSaveFrameImagePreference(enabled: boolean) {
    setSaveFrameImageEnabled(enabled);
    writeSaveFrameImagePreference(enabled);
  }

  function requestRKeyCardSave() {
    if (!currentSegment || !selectedTextForCard.trim()) {
      void saveCurrentSegmentCard();
      return;
    }
    if (!rKeyConfirmEnabled) {
      void saveCurrentSegmentCard();
      return;
    }
    setCaptionWordPopover(null);
    setRKeyConfirmOpen(true);
  }

  async function confirmRKeyCardSave() {
    const saved = await saveCurrentSegmentCard();
    if (saved) {
      setRKeyConfirmOpen(false);
    }
  }

  async function saveCaptionWordCard() {
    if (!captionWordPopover) {
      return;
    }
    const popover = captionWordPopover;
    const wasAlreadySaved =
      savedCardKeys.has(popover.sourceKey) || savedSessionKeys.has(popover.sourceKey);
    const saved = await saveListeningSegmentCard({
      textToSave: popover.word,
      targetText: popover.sourceKey,
      duplicateMessage: "이미 인풋-리스닝 덱에 저장된 단어입니다.",
      noteLines: [`전체 문장: ${currentSegment?.text ?? ""}`, `우클릭 단어: ${popover.word}`],
      successMessagePrefix: "인풋-리스닝 단어 카드로 저장했습니다"
    });
    if (saved || wasAlreadySaved) {
      closeCaptionWordPopover();
    }
  }

  async function buildListeningHighlightMappings(textToSave: string): Promise<HighlightMapping[]> {
    const terms = getListeningHighlightTerms(textToSave);
    const mappings: HighlightMapping[] = [];
    for (let index = 0; index < terms.length; index += 1) {
      const sourceText = terms[index];
      const meaningAnchor = await translateListeningHighlightTerm(sourceText);
      mappings.push({
        sourceText,
        literalKo: meaningAnchor,
        naturalKo: meaningAnchor,
        colorKey: listeningCardHighlightColorKeys[index % listeningCardHighlightColorKeys.length]
      });
    }
    return mappings;
  }

  function getListeningHighlightTerms(textToSave: string) {
    const normalizedTextToSave = normalizeListeningHighlightKey(textToSave);
    const terms: string[] = [];
    const parts = currentSegment ? splitCaptionTextIntoParts(currentSegment.text) : [];

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part.isWord || !highlightedCaptionWordKeys.has(getCaptionWordHighlightKey(index))) {
        continue;
      }
      const term = normalizeCaptionWordForDisplay(part.value);
      if (!term || !normalizedTextToSave.includes(normalizeListeningHighlightKey(term))) {
        continue;
      }
      terms.push(term);
    }

    if (!terms.length && selectionText.trim()) {
      const selected = selectionText.trim();
      if (normalizedTextToSave.includes(normalizeListeningHighlightKey(selected))) {
        terms.push(selected);
      }
    }

    if (!terms.length && textToSave.trim() && textToSave.trim() !== currentSegment?.text.trim()) {
      terms.push(textToSave.trim());
    }

    return uniqueListeningHighlightTerms(terms).slice(0, listeningCardHighlightColorKeys.length);
  }

  async function translateListeningHighlightTerm(sourceText: string) {
    const translationText = currentSegment?.translationKo?.trim() ?? "";
    const directMatch = findMeaningAnchor(translationText, sourceText);
    if (directMatch) {
      return directMatch;
    }
    if (!translationText) {
      return undefined;
    }
    try {
      const result = await api.translations.translate({
        text: sourceText,
        sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
        targetLang: settings.learningProfile.nativeLanguage.code,
        providerName:
          settings.translationProviderName === "browser"
            ? "localMt"
            : settings.translationProviderName,
        model: getTranslationModelName(settings),
        googleApiKey: settings.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        geminiPlan: settings.geminiPlan,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel,
        sourceLanguage: settings.learningProfile.targetLanguage,
        outputLanguage: settings.learningProfile.nativeLanguage
      });
      return findMeaningAnchor(translationText, result.translatedText) ?? result.translatedText.trim();
    } catch {
      return undefined;
    }
  }

  function buildListeningAnnotations(
    textToSave: string,
    mappings: HighlightMapping[]
  ): StudyCardListeningAnnotation[] {
    const normalizedTextToSave = normalizeListeningHighlightKey(textToSave);
    return mappings
      .filter((mapping) =>
        normalizedTextToSave.includes(normalizeListeningHighlightKey(mapping.sourceText))
      )
      .slice(0, 5)
      .map((mapping) => {
        const mark = inferListeningProsodyMark(mapping.sourceText);
        return {
          anchorText: mapping.sourceText,
          mark,
          label: getListeningProsodyLabel(mapping.sourceText, mark),
          confidence: 0.68
        };
      });
  }

  async function saveListeningSegmentCard({
    textToSave,
    targetText,
    duplicateMessage,
    noteLines,
    successMessagePrefix = "인풋-리스닝 덱에 저장했습니다"
  }: SaveListeningSegmentCardOptions) {
    if (isSavingCard) {
      return false;
    }
    const normalizedTextToSave = textToSave.trim();
    const existingCard = targetText ? savedCardsBySourceKey.get(targetText) : undefined;
    const existingCardHasAudio = existingCard ? hasUsableListeningAudio(existingCard) : false;
    if (targetText && (existingCardHasAudio || savedSessionKeys.has(targetText))) {
      setStatus(duplicateMessage);
      return false;
    }
    if (!currentSegment || !normalizedTextToSave || !targetText) {
      setStatus("저장할 자막 문장이 없습니다.");
      return false;
    }
    setIsSavingCard(true);
    setStatus("리스닝 카드 형광펜 정보를 준비하는 중...");
    const highlightMappings = await buildListeningHighlightMappings(normalizedTextToSave);
    const listeningAnnotations = buildListeningAnnotations(normalizedTextToSave, highlightMappings);
    const now = new Date();
    const baseStructureNoteLines = [
      `영상: ${transcript.title}`,
      `화자: ${currentSegment.speaker}`,
      `구간: ${formatTime(currentSegment.start)} - ${formatTime(currentSegment.end)}`,
      ...noteLines
    ];
    const card: StudyCard = {
      id: existingCard?.id ?? randomId(),
      profileId,
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: normalizedTextToSave,
      targetText,
      frontText: normalizedTextToSave,
      literalTranslationKo: currentSegment.translationKo,
      naturalTranslationKo: currentSegment.translationKo,
      highlightMappings,
      vocabularyItems: [],
      structureNote: baseStructureNoteLines.join("\n"),
      pumpPrompts: [
        {
          type: "question_answer",
          promptKo: "영상의 이 문장을 듣고 다시 따라 말해보세요.",
          requiredTerms: []
        }
      ],
      ...(listeningAnnotations.length ? { listeningAnnotations } : {}),
      srs: existingCard?.srs ?? createInitialSrs(now),
      createdAt: existingCard?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString()
    };

    setStatus("리스닝 카드 원본 오디오 준비 중...");
    try {
      const mediaResult = await createListeningCardMediaForCurrentSegment(card.id);
      if (mediaResult.media) {
        card.listeningMedia = mediaResult.media;
      } else {
        card.structureNote = [
          ...baseStructureNoteLines,
          `원본 오디오: ${mediaResult.message || "생성 실패"}`
        ].join("\n");
      }
      setStatus("카드 저장 중...");
      await api.cards.save(card, profileId);
      if (mediaResult.media) {
        setSavedSessionKeys((previous) => {
          const next = new Set(previous);
          next.add(targetText);
          return next;
        });
      }
      setStatus(
        `${successMessagePrefix}: ${formatStatusSnippet(normalizedTextToSave)}${
          mediaResult.message ? ` · ${mediaResult.message}` : ""
        }`
      );
      try {
        await onCardsChanged();
      } catch (caught) {
        setStatus(`저장됨. 카드 목록 갱신은 다시 열 때 반영됩니다: ${getErrorMessage(caught)}`);
      }
      return true;
    } catch (caught) {
      setStatus(`카드 저장 실패: ${getErrorMessage(caught)}`);
      return false;
    } finally {
      setIsSavingCard(false);
    }
  }

  async function createListeningCardMediaForCurrentSegment(cardId: string) {
    const input = buildListeningCardMediaClipInput(cardId);
    if (!input) {
      return {
        media: undefined,
        message: currentSegment
          ? "원본 오디오 없음: 로컬 영상 경로나 전사 오디오 경로가 없습니다."
          : ""
      };
    }
    const createMediaClip = api.listening.createListeningCardMediaClip;
    if (typeof createMediaClip !== "function") {
      return {
        media: undefined,
        message: "원본 오디오 없음: Electron main/preload가 오래되었습니다. 앱을 재시작한 뒤 다시 저장하세요."
      };
    }
    try {
      const result = await createMediaClip(input);
      if (result.ok && result.media) {
        return {
          media: result.media,
          message: result.media.frameImage ? "원본 오디오+장면 저장" : "원본 오디오 저장"
        };
      }
      return {
        media: undefined,
        message: `원본 오디오 없음: ${result.message}`
      };
    } catch (caught) {
      return {
        media: undefined,
        message: `원본 오디오 없음: ${getErrorMessage(caught)}`
      };
    }
  }

  function buildListeningCardMediaClipInput(cardId: string): ListeningCardMediaClipInput | null {
    if (!currentSegment) {
      return null;
    }
    const transcriptAudioPath = transcript.audioPath?.trim() ?? "";
    const localSourcePath =
      localVideoPath.trim() ||
      getLocalFilePathFromTranscriptCandidateId(transcript.candidateId) ||
      (resumeSession?.source.mode === "local" ? resumeSession.source.filePath : "");
    const sourcePath = transcriptAudioPath || localSourcePath;
    if (!sourcePath) {
      return null;
    }

    const isYoutubeAudioSource = playerMode === "youtube" && Boolean(transcriptAudioPath);
    return {
      profileId,
      cardId,
      sourcePath,
      frameSourcePath: localSourcePath || undefined,
      sourceType: isYoutubeAudioSource
        ? "youtube-audio"
        : transcriptAudioPath
          ? "transcript-audio"
          : "local-video",
      start: currentSegment.start,
      end: currentSegment.end,
      includeFrameImage: saveFrameImageEnabled && Boolean(localSourcePath)
    };
  }

  function updateTranscript(nextTranscript: ListeningTranscript) {
    setTranscript(nextTranscript);
    writeManualTranscript(nextTranscript);
  }

  async function persistTranscript(nextTranscript: ListeningTranscript) {
    const saved =
      nextTranscript.candidateId.startsWith("manual-video:") ||
      nextTranscript.candidateId === "manual-video-reader"
        ? nextTranscript
        : await api.listening.saveTranscript(nextTranscript);
    updateTranscript(saved);
  }

  function moveSegment(step: number) {
    selectSegment(segmentIndex + step);
  }

  function selectSegment(index: number, options: { seek?: boolean; play?: boolean } = {}) {
    const nextIndex = clamp(index, 0, Math.max(0, transcript.segments.length - 1));
    const nextSegment = transcript.segments[nextIndex];
    setSegmentIndex(nextIndex);
    if (options.seek === false || !nextSegment) {
      return;
    }
    manualSegmentSeekUntilRef.current = Date.now() + 500;
    seekToSegment(nextSegment, options.play ?? isPlaying);
  }

  function seekToSegment(segment: ListeningTranscriptSegment, shouldPlay: boolean) {
    if (playerMode === "youtube") {
      if (youtubePlayerRef.current && isPlayerReady) {
        if (shouldPlay) {
          youtubePlayerRef.current.loadVideoById({
            videoId: youtubeVideoId,
            startSeconds: segment.start,
            endSeconds: segment.end
          });
        } else if (youtubePlayerRef.current.cueVideoById) {
          youtubePlayerRef.current.cueVideoById({
            videoId: youtubeVideoId,
            startSeconds: segment.start,
            endSeconds: segment.end
          });
        } else {
          youtubePlayerRef.current.seekTo(segment.start, true);
        }
        suppressYouTubeCaptions(youtubePlayerRef.current);
        youtubePlayerRef.current.setPlaybackRate?.(playbackSpeed);
        if (!shouldPlay) {
          youtubePlayerRef.current.pauseVideo();
        } else {
          youtubePlayerRef.current.playVideo();
        }
      }
      setIsPlaying(shouldPlay);
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = segment.start;
    if (shouldPlay) {
      void video.play();
    } else {
      video.pause();
    }
    setIsPlaying(shouldPlay);
  }

  function syncSegmentWithPlaybackTime(seconds = getCurrentTime()) {
    if (!isPlaying) {
      return;
    }
    if (Date.now() < manualSegmentSeekUntilRef.current) {
      return;
    }
    const nextIndex = findSegmentIndexAtTime(transcript.segments, seconds);
    if (nextIndex < 0) {
      return;
    }
    setSegmentIndex((previous) => (previous === nextIndex ? previous : nextIndex));
  }

  function replaySegment() {
    if (!currentSegment) {
      return;
    }
    seekTo(currentSegment.start);
    playPlayback();
  }

  function playPlayback() {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.playVideo();
    } else {
      void videoRef.current?.play();
    }
    setIsPlaying(true);
  }

  function pausePlayback() {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.pauseVideo();
    } else {
      videoRef.current?.pause();
    }
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaying) {
      pausePlayback();
    } else {
      playPlayback();
    }
  }

  async function togglePlayerFullscreen() {
    const playerShell = playerShellRef.current;
    if (!playerShell) {
      return;
    }
    try {
      if (document.fullscreenElement === playerShell) {
        await document.exitFullscreen();
        await api.app?.setPlayerFullscreen?.(false);
        return;
      }
      await playerShell.requestFullscreen();
      setIsPlayerFullscreen(true);
      await api.app?.setPlayerFullscreen?.(true);
    } catch (caught) {
      setStatus(`전체화면 전환 실패: ${getErrorMessage(caught)}`);
    }
  }

  function updateFullscreenSubtitleRailPreference(nextVisible: boolean) {
    setFullscreenSubtitleRailVisible(nextVisible);
    writeFullscreenSubtitleRailPreference(nextVisible);
  }

  function seekTo(seconds: number) {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.seekTo(seconds, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  }

  function applyPendingResumeSeek() {
    const seconds = pendingResumeSeekRef.current;
    if (seconds === null) {
      return;
    }
    if (playerMode === "youtube" && !isPlayerReady) {
      return;
    }
    seekTo(seconds);
    pendingResumeSeekRef.current = null;
  }

  function getCurrentTime() {
    if (playerMode === "youtube") {
      return youtubePlayerRef.current?.getCurrentTime() ?? 0;
    }
    return videoRef.current?.currentTime ?? 0;
  }

  function handleSubtitleSelection() {
    const selected = window.getSelection?.()?.toString().trim() ?? "";
    if (selected.length >= 2) {
      setSelectionText(selected.slice(0, 240));
    }
  }

  function handleCaptionMouseEnter() {
    captionHoverInsideRef.current = true;
    if (isPlaying) {
      shouldResumeAfterCaptionHoverRef.current = true;
      pausePlayback();
    }
  }

  function handleCaptionMouseLeave() {
    captionHoverInsideRef.current = false;
    endCaptionHighlightDrag();
    if (captionWordPopover) {
      return;
    }
    resumeCaptionHoverPlaybackIfNeeded();
  }

  function resumeCaptionHoverPlaybackIfNeeded() {
    if (!shouldResumeAfterCaptionHoverRef.current) {
      return;
    }
    shouldResumeAfterCaptionHoverRef.current = false;
    playPlayback();
  }

  function closeCaptionWordPopover() {
    setCaptionWordPopover(null);
    resumeCaptionHoverPlaybackIfNeeded();
  }

  function beginCaptionHighlightDrag(event: ReactMouseEvent<HTMLSpanElement>, index: number) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection?.()?.removeAllRanges();
    setCaptionWordPopover(null);
    setSelectionText("");
    const key = getCaptionWordHighlightKey(index);
    const shouldHighlight = !highlightedCaptionWordKeys.has(key);
    captionHighlightDragRef.current = {
      active: true,
      shouldHighlight,
      touchedKeys: new Set([key])
    };
    setCaptionWordHighlightState(key, shouldHighlight);
  }

  function updateCaptionHighlightDrag(event: ReactMouseEvent<HTMLSpanElement>, index: number) {
    const dragState = captionHighlightDragRef.current;
    if (!dragState.active || (event.buttons & 1) !== 1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const key = getCaptionWordHighlightKey(index);
    if (dragState.touchedKeys.has(key)) {
      return;
    }
    dragState.touchedKeys.add(key);
    setCaptionWordHighlightState(key, dragState.shouldHighlight);
  }

  function endCaptionHighlightDrag() {
    const dragState = captionHighlightDragRef.current;
    if (!dragState.active) {
      return;
    }
    dragState.active = false;
    dragState.touchedKeys.clear();
  }

  function setCaptionWordHighlightState(highlightKey: string, shouldHighlight: boolean) {
    setHighlightedCaptionWordKeys((previous) => {
      if (shouldHighlight === previous.has(highlightKey)) {
        return previous;
      }
      const next = new Set(previous);
      if (shouldHighlight) {
        next.add(highlightKey);
      } else {
        next.delete(highlightKey);
      }
      return next;
    });
  }

  function handleCaptionWordContextMenu(
    event: ReactMouseEvent<HTMLSpanElement>,
    rawWord: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!currentSegment || !currentSourceKey) {
      return;
    }
    const word = normalizeCaptionWordForDisplay(rawWord);
    const normalizedWord = normalizeCaptionWordForKey(word);
    if (!word || !normalizedWord) {
      return;
    }
    const popoverWidth = 220;
    const popoverHeight = 112;
    setCaptionWordPopover({
      word,
      normalizedWord,
      sourceKey: getVideoReaderWordSourceKey(currentSourceKey, normalizedWord),
      segmentId: currentSegment.id,
      x: clamp(event.clientX + 8, 12, Math.max(12, window.innerWidth - popoverWidth - 12)),
      y: clamp(event.clientY + 8, 12, Math.max(12, window.innerHeight - popoverHeight - 12))
    });
  }

  function renderInteractiveCaptionText(text: string) {
    return splitCaptionTextIntoParts(text).map((part, index) =>
      part.isWord ? (() => {
        const highlightKey = getCaptionWordHighlightKey(index);
        return (
          <span
            className={`video-reader-caption-word${
              highlightedCaptionWordKeys.has(highlightKey) ? " is-highlighted" : ""
            }`}
            key={`${part.value}-${index}`}
            onContextMenu={(event) => handleCaptionWordContextMenu(event, part.value)}
            onMouseDown={(event) => beginCaptionHighlightDrag(event, index)}
            onMouseEnter={(event) => updateCaptionHighlightDrag(event, index)}
          >
            {part.value}
          </span>
        );
      })() : (
        <span className="video-reader-caption-gap" key={`${part.value}-${index}`}>
          {part.value}
        </span>
      )
    );
  }

  function clearShadowTimer() {
    if (shadowResumeTimerRef.current) {
      window.clearTimeout(shadowResumeTimerRef.current);
      shadowResumeTimerRef.current = 0;
    }
  }

  const hasResumeDraft = Boolean(resumeSession);
  const resumeTitle = resumeSession?.transcript.title || "아직 이어볼 영상이 없습니다";
  const resumeSubtitle = resumeSession
    ? getVideoReaderResumeSubtitle(resumeSession)
    : "영상을 열면 최근 작업이 여기에 표시됩니다";
  const resumeProgressWidth = resumeSession ? getVideoReaderResumeProgressWidth(resumeSession) : "0%";
  const translationFeedbackOverlay = translationConfirm ? (
    <div className="video-reader-translation-overlay" role="presentation">
      <div className="video-reader-translation-panel confirm" role="dialog" aria-modal="false">
        <div>
          <strong>자막 번역을 진행할까요?</strong>
          <span>
            번역 대상 {translationConfirm.untranslatedCount}개
            {translationConfirm.skippedCount > 0
              ? ` · 기존 번역 ${translationConfirm.skippedCount}개 건너뜀`
              : ""}
          </span>
        </div>
        <div className="video-reader-translation-stats">
          <span>
            <strong>{formatKrwRange(translationConfirm.estimate.estimatedCostKrw)}</strong>
            <small>예상 비용</small>
          </span>
          <span>
            <strong>{formatCompactNumber(translationConfirm.estimate.totalTokens.max)}</strong>
            <small>최대 토큰</small>
          </span>
          <span>
            <strong>{translationConfirm.estimate.requestCount}</strong>
            <small>요청</small>
          </span>
          <span>
            <strong>{translationConfirm.providerLabel}</strong>
            <small>{translationConfirm.estimate.model}</small>
          </span>
        </div>
        <p>예상치는 실제 사용량과 다를 수 있습니다. 이미 번역된 문장은 이번 작업에서 제외합니다.</p>
        <div className="video-reader-translation-actions">
          <button
            className="button primary small"
            type="button"
            disabled={isTranslating}
            onClick={() => void confirmTranslateAllSegments()}
          >
            번역 시작
          </button>
          <button
            className="button ghost small"
            type="button"
            disabled={isTranslating}
            onClick={() => setTranslationConfirm(null)}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  ) : translationProgress ? (
    <div className="video-reader-translation-overlay" role="presentation">
      <div className="video-reader-translation-panel progress" role="status">
        <div>
          <strong>
            번역 진행 중 {translationProgress.current}/{translationProgress.total}
          </strong>
          <span>
            {translationProgress.currentText
              ? formatStatusSnippet(translationProgress.currentText)
              : "번역 작업을 준비 중입니다."}
          </span>
        </div>
        <div
          className="video-reader-translation-progress-track"
          aria-label={`번역 진행률 ${translationProgressPercent}%`}
        >
          <span style={{ width: `${translationProgressPercent}%` }} />
        </div>
        <small>
          {translationProgress.skippedCount > 0
            ? `이미 번역된 ${translationProgress.skippedCount}개 문장은 건너뜁니다.`
            : "번역 결과가 완료 후 자막에 반영됩니다."}
        </small>
      </div>
    </div>
  ) : translationNotice ? (
    <div className="video-reader-translation-overlay" role="presentation">
      <div className="video-reader-translation-panel notice" role="status">
        <div>
          <strong>{translationNotice}</strong>
          <span>자막 목록을 확인한 뒤 다시 시도하세요.</span>
        </div>
      </div>
    </div>
  ) : null;

  if (!canUsePlayer) {
    return (
      <div className="video-reader-page video-reader-home-page">
        <section className="panel video-reader-home-main">
          <div className="video-reader-header video-reader-home-header">
            <div>
              <span className="section-kicker">
                <FileVideo size={16} />
                영상 리더
              </span>
              <h2>볼 영상을 먼저 고르세요</h2>
              <p>파일이나 YouTube를 열고, 자막을 붙여 문장 단위로 듣기와 카드 저장을 진행합니다.</p>
            </div>
            <span className="video-reader-counter">{settings.learningProfile.targetLanguage.nameKo}</span>
          </div>

          <section className="video-reader-launch-panel" aria-label="영상 시작">
            <label className="video-reader-launch-tile primary" data-qa="video-reader-file-button">
              <span className="video-reader-launch-icon">
                <FileVideo size={26} />
              </span>
              <strong>파일 열기</strong>
              <small>PC에 저장된 mp4, mkv, webm, mov 파일로 시작합니다.</small>
              <span className="video-reader-launch-action">
                {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FileVideo size={16} />}
                로컬 영상 선택
              </span>
              <input
                accept={VIDEO_READER_VIDEO_ACCEPT}
                data-qa="video-reader-file-input"
                type="file"
                onChange={(event) => void handleVideoFile(event.target.files?.[0])}
              />
            </label>

            <div className="video-reader-launch-tile">
              <span className="video-reader-launch-icon youtube">
                <Youtube size={27} />
              </span>
              <strong>YouTube 열기</strong>
              <small>영상 URL을 붙여넣고 Whisper 전사나 기존 자막으로 학습합니다.</small>
              <div className="video-reader-youtube-home-row">
                <input
                  className="text-input"
                  data-qa="video-reader-youtube-url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
                <button
                  className="button primary"
                  data-qa="video-reader-youtube-load"
                  type="button"
                  onClick={() => void prepareYoutube()}
                >
                  열기
                </button>
              </div>
            </div>
          </section>

          <div className="video-reader-utility-row">
            <label className="button secondary video-reader-file-button" data-qa="video-reader-subtitle-button">
              <Subtitles size={16} />
              자막 파일
              <input
                accept=".srt,.vtt,text/vtt"
                data-qa="video-reader-subtitle-input"
                type="file"
                onChange={(event) => void handleSubtitleFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="button secondary"
              data-qa="video-reader-app-open-button"
              type="button"
              disabled={isPreparingLocalVideo}
              onClick={() =>
                savedVideoFolders[0]
                  ? void pickLocalVideoFile(savedVideoFolders[0].folderPath)
                  : void addVideoFolder()
              }
            >
              {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FolderOpen size={16} />}
              최근 폴더
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => void pasteYoutubeUrlFromClipboard()}
            >
              <Link size={16} />
              URL 붙여넣기
            </button>
          </div>

          <section className="video-reader-resume-strip" aria-label="이어보기">
            <div className="video-reader-resume-thumb">
              <Play size={20} />
            </div>
            <div className="video-reader-resume-copy">
              <span>이어보기</span>
              <strong>{resumeTitle}</strong>
              <small>{resumeSubtitle}</small>
            </div>
            <div className="video-reader-resume-progress" aria-hidden="true">
              <span style={{ width: resumeProgressWidth }} />
            </div>
            <button
              className="button primary"
              type="button"
              disabled={!hasResumeDraft}
              onClick={() => void resumeLastVideo()}
            >
              {isPreparingLocalVideo ? "여는 중" : "이어보기"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!hasResumeDraft || resumeSession?.transcript.segments.length === 0}
              onClick={() => void resumeLastVideo("bilingual")}
            >
              자막 보기
            </button>
          </section>

          <section className="video-reader-library-panel" aria-label="영상 보관함">
            <div className="video-reader-library-head">
              <div>
                <span className="section-kicker">
                  <FolderOpen size={15} />
                  영상 보관함
                </span>
                <h3>보던 시리즈 폴더를 바로 여세요</h3>
              </div>
              <div className="video-reader-library-actions">
                <button className="button secondary small" type="button" onClick={() => void addVideoFolder()}>
                  <FolderOpen size={15} />
                  폴더 추가
                </button>
              </div>
            </div>
            <div className="video-reader-folder-grid">
              {savedVideoFolders.length > 0 ? (
                savedVideoFolders.map((folder) => (
                  <button
                    className="video-reader-folder-tile"
                    key={folder.id}
                    type="button"
                    onClick={() => void pickLocalVideoFile(folder.folderPath)}
                  >
                    <FolderOpen size={23} />
                    <strong>{folder.folderName}</strong>
                    <span>저장된 폴더</span>
                    <small title={folder.folderPath}>{getVideoFolderDisplayPath(folder.folderPath)}</small>
                    <em>열기</em>
                  </button>
                ))
              ) : (
                <button className="video-reader-folder-empty" type="button" onClick={() => void addVideoFolder()}>
                  <FolderOpen size={24} />
                  <strong>폴더를 추가하세요</strong>
                  <span>미드 시리즈나 강의 폴더를 저장해두면 여기서 바로 엽니다.</span>
                </button>
              )}
            </div>
          </section>
        </section>

        <aside className="panel video-reader-home-side">
          <div className="video-reader-side-head">
            <div>
              <span className="section-kicker">Quick</span>
              <strong>빠른 작업</strong>
            </div>
          </div>
          <button
            className="button primary"
            type="button"
            disabled
          >
            <Wand2 size={16} />
            전사 생성
          </button>
          <button className="button secondary" type="button" disabled>
            <ListVideo size={16} />
            재생 목록
          </button>
          <div className="video-reader-home-stat">
            <span>오늘 저장</span>
            <strong>0문장</strong>
          </div>
          <p>{status || "먼저 파일이나 YouTube 영상을 열면 학습 도구가 활성화됩니다."}</p>
        </aside>
      </div>
    );
  }

  return (
    <div className="video-reader-page">
      {translationFeedbackOverlay}
      <section className="panel video-reader-main">
        <div
          className={`video-reader-player-shell ${
            isPlayerFullscreen ? "is-fullscreen" : ""
          } ${fullscreenSubtitleRailVisible ? "with-fullscreen-rail" : "without-fullscreen-rail"}`}
          ref={playerShellRef}
          style={playerFrameStyle}
        >
          <div className="video-reader-player-media">
            {playerMode === "youtube" ? (
              <div className="video-reader-youtube-frame" ref={youtubeHostRef} />
            ) : (
              <video
                ref={videoRef}
                src={localVideoUrl}
                onLoadedMetadata={applyPendingResumeSeek}
                onError={() => {
                  setIsPlaying(false);
                  setStatus(
                    localVideoPlaybackMessage ||
                      "이 영상 형식이나 코덱은 내장 플레이어가 직접 재생하지 못했습니다. MKV/AVI는 앱에서 열기로 다시 선택해 재생용 MP4 준비를 시도하세요."
                  );
                }}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={() => syncSegmentWithPlaybackTime()}
              />
            )}
            {!canUsePlayer ? (
              <div className="video-reader-empty-player">
                <FileVideo size={32} />
                <strong>영상 파일 또는 YouTube URL을 추가하세요.</strong>
                <span>로컬 영상은 SRT/VTT 자막을 가져와 바로 학습할 수 있습니다.</span>
              </div>
            ) : null}
            {videoCovered ? (
              <button
                className="video-reader-cover"
                type="button"
                onClick={() => setVideoCovered(false)}
              >
                <ShieldOff size={28} />
                <strong>영상 가림</strong>
                <span>내장 자막이나 화면 단서를 가리고 듣기만 합니다.</span>
              </button>
            ) : null}
            {currentSegment ? (
              <div
                className={`video-reader-player-caption mode-${subtitleMode}${
                  subtitleBlurred ? " is-blurred" : ""
                }`}
                onDragStart={(event) => event.preventDefault()}
                onMouseEnter={handleCaptionMouseEnter}
                onMouseLeave={handleCaptionMouseLeave}
                onMouseDown={(event) => {
                  if (event.button === 0) {
                    event.preventDefault();
                  }
                }}
                onMouseUp={() => endCaptionHighlightDrag()}
              >
                {subtitleMode === "source" || subtitleMode === "bilingual" ? (
                  <strong className="video-reader-caption-line source">
                    {renderInteractiveCaptionText(currentSegment.text)}
                  </strong>
                ) : null}
                {subtitleMode === "translation" || subtitleMode === "bilingual" ? (
                  <span className="video-reader-caption-line translation">
                    {currentSegment.translationKo || "아직 번역이 없습니다."}
                  </span>
                ) : null}
                {captionWordPopover?.segmentId === currentSegment.id ? (
                  <div
                    className="video-reader-caption-word-popover"
                    style={{ left: captionWordPopover.x, top: captionWordPopover.y }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <strong>{captionWordPopover.word}</strong>
                    <div>
                      <button
                        className="button primary small"
                        type="button"
                        disabled={isSavingCard || isCaptionWordSaved}
                        onClick={() => void saveCaptionWordCard()}
                      >
                        {isSavingCard
                          ? "저장 중"
                          : isCaptionWordSaved
                            ? "저장됨"
                            : "리스닝 카드 만들기"}
                      </button>
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={closeCaptionWordPopover}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {rKeyConfirmOpen && currentSegment ? (
              <div className="video-reader-key-confirm-popover" role="dialog" aria-modal="false">
                <strong>리스닝 카드 만들까요?</strong>
                <span>{formatStatusSnippet(selectedTextForCard)}</span>
                <div>
                  <button
                    className="button primary small"
                    type="button"
                    disabled={isSavingCard || isCurrentSaved}
                    onClick={() => void confirmRKeyCardSave()}
                  >
                    {isSavingCard ? "저장 중" : isCurrentSaved ? "저장됨" : "만들기"}
                  </button>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() => setRKeyConfirmOpen(false)}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="video-reader-fullscreen-toolbar">
            <button
              type="button"
              onClick={() => updateFullscreenSubtitleRailPreference(!fullscreenSubtitleRailVisible)}
            >
              <Captions size={16} />
              {fullscreenSubtitleRailVisible ? "세로 보기 끄기" : "세로 보기 열기"}
            </button>
            <button type="button" onClick={() => void togglePlayerFullscreen()}>
              <Minimize2 size={16} />
              나가기
            </button>
          </div>
          <aside className="video-reader-fullscreen-rail" aria-label="전체화면 자막 세로 보기">
            <div className="video-reader-fullscreen-rail-head">
              <strong>자막 리스트</strong>
              <span>{transcript.segments.length > 0 ? `${segmentIndex + 1}/${transcript.segments.length}` : "0/0"}</span>
            </div>
            <div className="video-reader-fullscreen-rail-list">
              {transcript.segments.length > 0 ? (
                transcript.segments.map((segment, index) => (
                  <button
                    className={index === segmentIndex ? "active" : ""}
                    key={segment.id}
                    type="button"
                    onClick={() => selectSegment(index)}
                  >
                    <span>{formatTime(segment.start)}</span>
                    <strong>{segment.text}</strong>
                    {segment.translationKo ? <small>{segment.translationKo}</small> : null}
                  </button>
                ))
              ) : (
                <div className="video-reader-fullscreen-rail-empty">자막 구간이 없습니다.</div>
              )}
            </div>
          </aside>
        </div>

        <section className="video-reader-control-dock" aria-label="영상 재생 컨트롤">
          <div className="video-reader-video-nav-row">
            <button
              className="button secondary"
              type="button"
              disabled={!previousPlaylistVideo || isPreparingLocalVideo}
              onClick={() => previousPlaylistVideo && void openLocalPlaylistVideo(previousPlaylistVideo)}
            >
              <ChevronLeft size={16} />
              이전 영상
            </button>
            <div className="video-reader-video-nav-current">
              <span>현재 영상</span>
              <strong>{transcript.title || localVideoName || "영상 없음"}</strong>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={!nextPlaylistVideo || isPreparingLocalVideo}
              onClick={() => nextPlaylistVideo && void openLocalPlaylistVideo(nextPlaylistVideo)}
            >
              다음 영상
              <ChevronRight size={16} />
            </button>
          </div>

        <div className="video-reader-controls">
          <button
            className="button secondary"
            type="button"
            disabled={segmentIndex === 0}
            onClick={() => moveSegment(-1)}
          >
            <ChevronLeft size={17} />
            이전
          </button>
          <button className="button secondary" type="button" onClick={replaySegment}>
            <RotateCcw size={16} />
            다시 듣기
          </button>
          <button className="button secondary" type="button" onClick={togglePlayback}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? "멈춤" : "재생"}
          </button>
          <button className="button secondary" type="button" onClick={() => void goToVideoReaderHome()}>
            <Home size={16} />
            영상 홈
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setVideoCovered((value) => !value)}
          >
            {videoCovered ? <Eye size={16} /> : <EyeOff size={16} />}
            {videoCovered ? "영상 보기" : "영상 가리기"}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={segmentIndex >= transcript.segments.length - 1}
            onClick={() => moveSegment(1)}
          >
            다음
            <ChevronRight size={17} />
          </button>
          <button className="button secondary" type="button" onClick={() => void togglePlayerFullscreen()}>
            <Maximize2 size={16} />
            전체화면
          </button>
        </div>

        <div className="video-reader-mode-bar">
          <div className="segmented-control compact">
            {(["hidden", "source", "translation", "bilingual"] as SubtitleMode[]).map((mode) => (
              <button
                key={mode}
                className={subtitleMode === mode ? "active" : ""}
                type="button"
                onClick={() => setSubtitleMode(mode)}
              >
                {getSubtitleModeLabel(mode)}
              </button>
            ))}
          </div>
          <div className="segmented-control compact">
            {playbackSpeeds.map((speed) => (
              <button
                key={speed}
                className={playbackSpeed === speed ? "active" : ""}
                type="button"
                onClick={() => setPlaybackSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <div className="video-reader-practice-toggles">
          <label>
            <input
              checked={loopEnabled}
              type="checkbox"
              onChange={(event) => setLoopEnabled(event.target.checked)}
            />
            문장 루프
          </label>
          <label>
            <input
              checked={autoPauseEnabled}
              type="checkbox"
              onChange={(event) => setAutoPauseEnabled(event.target.checked)}
            />
            자동 일시정지
          </label>
          <label>
            <input
              checked={shadowingEnabled}
              type="checkbox"
              onChange={(event) => setShadowingEnabled(event.target.checked)}
            />
            셰도잉 모드
          </label>
          <label>
            <input
              checked={rKeyConfirmEnabled}
              type="checkbox"
              onChange={(event) => updateRKeyConfirmPreference(event.target.checked)}
            />
            R 저장 확인창
          </label>
          <label>
            <input
              checked={saveFrameImageEnabled}
              type="checkbox"
              onChange={(event) => updateSaveFrameImagePreference(event.target.checked)}
            />
            카드 장면 이미지
          </label>
        </div>
        </section>

        <section
          className={`video-reader-subtitle-card ${subtitleDetailsExpanded ? "expanded" : "collapsed"}`}
          onMouseUp={handleSubtitleSelection}
        >
          <div className="video-reader-subtitle-summary">
            <div>
              <span className="section-kicker">
                <Captions size={15} />
                현재 문장
              </span>
              <strong>{currentSegment ? currentSegment.text : transcriptStatusText}</strong>
              <small>
                {currentSegment
                  ? `${formatTime(currentSegment.start)} - ${formatTime(currentSegment.end)}`
                  : transcriptStatusDetail}
              </small>
            </div>
            <div className="video-reader-subtitle-summary-actions">
              {currentSegment ? (
                <button
                  className="button success small"
                  type="button"
                  disabled={isCurrentSaved || isSavingCard || !selectedTextForCard}
                  onClick={() => void saveCurrentSegmentCard()}
                >
                  <BookmarkPlus size={14} />
                  {isSavingCard ? "저장 중" : isCurrentSaved ? "저장됨" : "문장 저장"}
                </button>
              ) : null}
              <button
                className="button secondary small"
                type="button"
                onClick={() => setSubtitleDetailsExpanded((expanded) => !expanded)}
              >
                {subtitleDetailsExpanded ? "상세 접기" : "상세"}
              </button>
            </div>
          </div>
          <div className={`video-reader-transcript-status ${transcriptStatusKind}`} role="status">
            <strong>{transcriptStatusText}</strong>
            <span>{transcriptStatusDetail}</span>
          </div>
          {currentSegment ? (
            <>
              <div className="video-reader-subtitle-head">
                <div>
                  <span>
                    <Captions size={16} />
                    {currentSegment.speaker}
                  </span>
                  <small>
                    {formatTime(currentSegment.start)} - {formatTime(currentSegment.end)}
                  </small>
                </div>
                <div className="video-reader-subtitle-actions">
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() =>
                      setEditingSegmentId((id) => (id === currentSegment.id ? "" : currentSegment.id))
                    }
                  >
                    <Edit3 size={14} />
                    문장 수정
                  </button>
                  <button
                    className="button ghost small"
                    type="button"
                    disabled={isTranslating}
                    onClick={requestTranslateAllSegments}
                  >
                    {isTranslating ? <Loader2 className="spin-icon" size={14} /> : <Languages size={14} />}
                    전체 번역
                  </button>
                </div>
              </div>

              {editingSegmentId === currentSegment.id ? (
                <div className="video-reader-editor">
                  <label>
                    원문
                    <textarea
                      value={currentSegment.text}
                      onChange={(event) => updateCurrentSegment({ text: event.target.value })}
                    />
                  </label>
                  <label>
                    번역
                    <textarea
                      value={currentSegment.translationKo ?? ""}
                      onChange={(event) => updateCurrentSegment({ translationKo: event.target.value })}
                    />
                  </label>
                  <div className="video-reader-time-edit">
                    <label>
                      시작
                      <input
                        type="number"
                        step="0.1"
                        value={currentSegment.start}
                        onChange={(event) => updateCurrentSegment({ start: Number(event.target.value) || 0 })}
                      />
                    </label>
                    <label>
                      끝
                      <input
                        type="number"
                        step="0.1"
                        value={currentSegment.end}
                        onChange={(event) => updateCurrentSegment({ end: Number(event.target.value) || currentSegment.end })}
                      />
                    </label>
                    <button className="button primary" type="button" onClick={() => void saveCurrentSegmentEdits()}>
                      <Save size={15} />
                      적용
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`video-reader-subtitle-display mode-${subtitleMode}`}>
                  {subtitleMode === "hidden" ? (
                    <button type="button" onClick={() => setSubtitleMode("bilingual")}>
                      <Eye size={18} />
                      자막 가림
                    </button>
                  ) : null}
                  {subtitleMode === "source" || subtitleMode === "bilingual" ? (
                    <p>{currentSegment.text}</p>
                  ) : null}
                  {subtitleMode === "translation" || subtitleMode === "bilingual" ? (
                    <small>{currentSegment.translationKo || "아직 번역이 없습니다."}</small>
                  ) : null}
                </div>
              )}

              {selectionText ? (
                <div className="video-reader-selection-bar">
                  <span>
                    <Type size={14} />
                    선택: {selectionText}
                  </span>
                  <button
                    className="button success small"
                    disabled={isSavingCard || isCurrentSaved}
                    type="button"
                    onClick={() => void saveCurrentSegmentCard()}
                  >
                    <BookmarkPlus size={14} />
                    {isSavingCard ? "저장 중" : isCurrentSaved ? "저장됨" : "선택 카드"}
                  </button>
                  <button className="button ghost small" type="button" onClick={() => setSelectionText("")}>
                    선택 해제
                  </button>
                </div>
              ) : null}

              <div className="video-reader-save-row">
                <button
                  className="button success"
                  type="button"
                  disabled={isCurrentSaved || isSavingCard || !selectedTextForCard}
                  onClick={() => void saveCurrentSegmentCard()}
                >
                  <BookmarkPlus size={16} />
                  {isSavingCard ? "저장 중" : isCurrentSaved ? "저장됨" : "문장 저장"}
                </button>
                <span>{status || "저장 위치: 인풋-리스닝 덱"}</span>
              </div>
            </>
          ) : (
            <div className="video-reader-empty-subtitle">
              <Subtitles size={24} />
              <strong>자막 구간이 없습니다.</strong>
              <span>SRT/VTT를 가져오거나 YouTube URL로 Whisper 전사를 실행하세요.</span>
            </div>
          )}
        </section>
      </section>

      <aside className={`panel video-reader-side tab-${videoReaderSideTab}`}>
        <div className="video-reader-side-tabs" role="tablist" aria-label="영상 리더 보조 패널">
          <button
            className={videoReaderSideTab === "subtitles" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("subtitles")}
          >
            자막
          </button>
          <button
            className={videoReaderSideTab === "playlist" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("playlist")}
          >
            재생목록
          </button>
          <button
            className={videoReaderSideTab === "settings" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("settings")}
          >
            설정
          </button>
        </div>
        <section className="video-reader-playlist-panel">
          <div className="video-reader-side-head">
            <div>
              <span className="section-kicker">
                <ListVideo size={15} />
                재생목록
              </span>
              <strong>{localVideoFolderPath ? getVideoFolderNameFromPath(localVideoFolderPath) : "현재 목록"}</strong>
            </div>
            <button
              className="button ghost small"
              type="button"
              disabled={!localVideoFolderPath || isLoadingLocalPlaylist}
              onClick={() => void refreshLocalVideoPlaylist()}
            >
              {isLoadingLocalPlaylist ? <Loader2 className="spin-icon" size={14} /> : <RotateCcw size={14} />}
              갱신
            </button>
          </div>
          <div className="video-reader-playlist-jump">
            <button
              className="button secondary small"
              type="button"
              disabled={!previousPlaylistVideo || isPreparingLocalVideo}
              onClick={() => previousPlaylistVideo && void openLocalPlaylistVideo(previousPlaylistVideo)}
            >
              <ChevronLeft size={14} />
              이전 영상
            </button>
            <span>
              {localPlaylistIndex >= 0
                ? `${localPlaylistIndex + 1} / ${localPlaylistVideos.length}`
                : localPlaylistVideos.length
                  ? `${localPlaylistVideos.length}개`
                  : "목록 없음"}
            </span>
            <button
              className="button primary small"
              type="button"
              disabled={!nextPlaylistVideo || isPreparingLocalVideo}
              onClick={() => nextPlaylistVideo && void openLocalPlaylistVideo(nextPlaylistVideo)}
            >
              다음 영상
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="video-reader-playlist-list">
            {localPlaylistVideos.length > 0 ? (
              localPlaylistVideos.map((video, index) => {
                const isActive = normalizeLocalPathKey(video.filePath) === normalizeLocalPathKey(localVideoPath);
                return (
                  <button
                    className={isActive ? "active" : ""}
                    key={video.filePath}
                    type="button"
                    onClick={() => void openLocalPlaylistVideo(video)}
                  >
                    <span className="video-reader-playlist-thumb">
                      <video
                        aria-hidden="true"
                        muted
                        playsInline
                        preload="metadata"
                        src={getVideoPreviewUrl(video.fileUrl)}
                      />
                      <FileVideo size={18} />
                    </span>
                    <span className="video-reader-playlist-index">{index + 1}</span>
                    <strong>{video.title || video.fileName}</strong>
                    <small>{video.fileName}</small>
                  </button>
                );
              })
            ) : (
              <div className="video-reader-timeline-empty">
                로컬 폴더에서 영상을 열면 같은 폴더의 영상이 재생목록으로 표시됩니다.
              </div>
            )}
          </div>
        </section>
        <div className="video-reader-side-head">
          <div>
            <span className="section-kicker">
              <Clock size={15} />
              타임라인
            </span>
            <strong>자막 리스트</strong>
          </div>
          <button className="button ghost small" type="button" disabled={isTranslating} onClick={requestTranslateAllSegments}>
            {isTranslating ? <Loader2 className="spin-icon" size={14} /> : <Sparkles size={14} />}
            {isTranslating ? "번역 중" : "번역"}
          </button>
        </div>
        <div className="video-reader-timeline">
          {transcript.segments.map((segment, index) => (
            <button
              key={segment.id}
              className={index === segmentIndex ? "active" : ""}
              type="button"
              onClick={() => selectSegment(index)}
            >
              <span>{index + 1}</span>
              <strong>{segment.text}</strong>
              <small>
                {formatTime(segment.start)} - {formatTime(segment.end)}
              </small>
            </button>
          ))}
          {transcript.segments.length === 0 ? (
            <div className="video-reader-timeline-empty">자막 구간을 불러오면 여기에 표시됩니다.</div>
          ) : null}
        </div>
        <div className="video-reader-help">
          <strong>단축키</strong>
          <span>A / ←: 이전 문장</span>
          <span>D / →: 다음 문장</span>
          <span>S: 재생 / 정지</span>
          <span>Q: 자막 블러 토글</span>
          <span>Enter: 전체화면</span>
          <span>Space: 자막 가리기 / 자동정지 중 다음 문장</span>
          <span>R: 리스닝 카드 만들기</span>
          <span>H / Home: 영상 홈</span>
        </div>
        <div className="video-reader-help muted">
          <strong>나중에 확장</strong>
          <span>로컬 영상 직접 Whisper 전사</span>
          <span>자막 싱크 보정, 음성 녹음 비교</span>
        </div>
        <section className="video-reader-side-source-card" aria-label="영상 소스">
          <div className="video-reader-side-source-head">
            <span className="section-kicker">
              <FileVideo size={15} />
              영상 리더
            </span>
            <span className="video-reader-counter">
              {transcript.segments.length > 0 ? `${segmentIndex + 1} / ${transcript.segments.length}` : "0 / 0"}
            </span>
          </div>
          <h2>{transcript.title || "학습할 영상을 불러오세요"}</h2>
          <p>현재 영상의 자막과 Whisper 전사를 관리합니다.</p>
          <div className={`video-reader-transcript-status compact ${transcriptStatusKind}`}>
            <strong>{transcriptStatusText}</strong>
            <span>{transcriptStatusDetail}</span>
          </div>
          <div className="video-reader-source-panel">
            <label className="video-reader-file-button" data-qa="video-reader-file-button">
              <FileVideo size={16} />
              영상 파일
              <input
                accept={VIDEO_READER_VIDEO_ACCEPT}
                data-qa="video-reader-file-input"
                type="file"
                onChange={(event) => void handleVideoFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="button secondary"
              data-qa="video-reader-app-open-button"
              type="button"
              disabled={isPreparingLocalVideo}
              onClick={() => void pickLocalVideoFile()}
            >
              {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FileVideo size={16} />}
              {isPreparingLocalVideo ? "재생 준비 중" : "앱에서 열기"}
            </button>
            <button
              className="button secondary"
              data-qa="video-reader-embedded-subtitle"
              type="button"
              disabled={!localVideoPath || isExtractingEmbeddedSubtitle || isTranscribing}
              onClick={() => void extractLocalEmbeddedSubtitleForFile()}
            >
              {isExtractingEmbeddedSubtitle ? <Loader2 className="spin-icon" size={16} /> : <Subtitles size={16} />}
              {isExtractingEmbeddedSubtitle ? "확인 중" : "내장 자막"}
            </button>
            <button
              className="button primary"
              data-qa="video-reader-local-whisper"
              type="button"
              disabled={!localVideoPath || isTranscribing || isExtractingEmbeddedSubtitle}
              onClick={() => void transcribeLocalVideo()}
            >
              {isTranscribing ? <Loader2 className="spin-icon" size={16} /> : <Wand2 size={16} />}
              로컬 Whisper
            </button>
            <label className="video-reader-file-button" data-qa="video-reader-subtitle-button">
              <Subtitles size={16} />
              SRT/VTT 자막
              <input
                accept=".srt,.vtt,text/vtt"
                data-qa="video-reader-subtitle-input"
                type="file"
                onChange={(event) => void handleSubtitleFile(event.target.files?.[0])}
              />
            </label>
          </div>
        </section>
      </aside>
    </div>
  );
}

function readManualTranscript(): ListeningTranscript {
  try {
    const raw = localStorage.getItem(VIDEO_READER_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ListeningTranscript;
      if (Array.isArray(parsed.segments)) {
        return parsed;
      }
    }
  } catch {
    // Use empty fallback below.
  }
  const now = new Date().toISOString();
  return {
    id: "manual-video-reader",
    candidateId: "manual-video-reader",
    videoId: "manual-video-reader",
    title: "",
    channelName: "직접 추가",
    status: "ready",
    segments: [],
    modelName: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function writeManualTranscript(transcript: ListeningTranscript) {
  localStorage.setItem(VIDEO_READER_DRAFT_KEY, JSON.stringify(transcript));
}

function readFullscreenSubtitleRailPreference() {
  try {
    const raw = localStorage.getItem(VIDEO_READER_FULLSCREEN_RAIL_KEY);
    return raw === null ? true : raw !== "off";
  } catch {
    return true;
  }
}

function writeFullscreenSubtitleRailPreference(visible: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_FULLSCREEN_RAIL_KEY, visible ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function readRKeyConfirmPreference() {
  try {
    const raw = localStorage.getItem(VIDEO_READER_R_KEY_CONFIRM_KEY);
    return raw === null ? true : raw !== "off";
  } catch {
    return true;
  }
}

function writeRKeyConfirmPreference(enabled: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_R_KEY_CONFIRM_KEY, enabled ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function readSaveFrameImagePreference() {
  try {
    return localStorage.getItem(VIDEO_READER_SAVE_FRAME_IMAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeSaveFrameImagePreference(enabled: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_SAVE_FRAME_IMAGE_KEY, enabled ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function getVideoReaderResumeStorageKey(profileId: ProfileId) {
  return `${VIDEO_READER_RESUME_KEY_PREFIX}:${profileId}`;
}

function readVideoReaderResumeSession(profileId: ProfileId): VideoReaderResumeSession | null {
  try {
    const raw = localStorage.getItem(getVideoReaderResumeStorageKey(profileId));
    if (!raw) {
      return null;
    }
    return normalizeVideoReaderResumeSession(JSON.parse(raw), profileId);
  } catch {
    return null;
  }
}

function writeVideoReaderResumeSession(profileId: ProfileId, session: VideoReaderResumeSession) {
  try {
    localStorage.setItem(getVideoReaderResumeStorageKey(profileId), JSON.stringify(session));
  } catch {
    // Ignore storage failures; the current in-memory video session can still continue.
  }
}

function normalizeVideoReaderResumeSession(
  value: unknown,
  profileId: ProfileId
): VideoReaderResumeSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const source = normalizeVideoReaderResumeSource(record.source);
  const transcript = normalizeVideoReaderResumeTranscript(record.transcript);
  if (!source || !transcript) {
    return null;
  }
  const rawSegmentIndex = typeof record.segmentIndex === "number" ? record.segmentIndex : 0;
  const rawPlaybackTime = typeof record.playbackTime === "number" ? record.playbackTime : 0;
  return {
    profileId,
    source,
    transcript,
    segmentIndex: clamp(
      Math.floor(rawSegmentIndex),
      0,
      Math.max(0, transcript.segments.length - 1)
    ),
    playbackTime: Number.isFinite(rawPlaybackTime) ? Math.max(0, rawPlaybackTime) : 0,
    subtitleMode: normalizeSubtitleMode(record.subtitleMode),
    videoCovered: record.videoCovered === true,
    loopEnabled: record.loopEnabled === true,
    playbackSpeed: normalizePlaybackSpeed(record.playbackSpeed),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };
}

function normalizeVideoReaderResumeSource(value: unknown): VideoReaderResumeSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.mode === "local") {
    const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";
    if (!filePath) {
      return null;
    }
    const fallbackName = getVideoFolderNameFromPath(filePath);
    return {
      mode: "local",
      filePath,
      fileName:
        typeof record.fileName === "string" && record.fileName.trim()
          ? record.fileName.trim()
          : fallbackName,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : fallbackName.replace(/\.[^.]+$/, ""),
      folderPath:
        typeof record.folderPath === "string" && record.folderPath.trim()
          ? record.folderPath.trim()
          : getParentFolderPath(filePath) || undefined,
      playbackMessage:
        typeof record.playbackMessage === "string" && record.playbackMessage.trim()
          ? record.playbackMessage
          : undefined
    };
  }
  if (record.mode === "youtube") {
    const videoId = normalizeVideoId(typeof record.videoId === "string" ? record.videoId : "");
    if (!videoId) {
      return null;
    }
    const url =
      typeof record.url === "string" && record.url.trim()
        ? record.url.trim()
        : `https://www.youtube.com/watch?v=${videoId}`;
    return {
      mode: "youtube",
      videoId,
      url,
      candidateId:
        typeof record.candidateId === "string" && record.candidateId.trim()
          ? record.candidateId
          : undefined
    };
  }
  return null;
}

function normalizeVideoReaderResumeTranscript(value: unknown): ListeningTranscript | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const transcript = value as ListeningTranscript;
  return Array.isArray(transcript.segments) ? transcript : null;
}

function normalizeSubtitleMode(value: unknown): SubtitleMode {
  return value === "source" || value === "translation" || value === "bilingual"
    ? value
    : "hidden";
}

function normalizePlaybackSpeed(value: unknown): PlaybackSpeed {
  return playbackSpeeds.includes(value as PlaybackSpeed) ? (value as PlaybackSpeed) : 1;
}

function getVideoReaderResumeSubtitle(session: VideoReaderResumeSession) {
  const sourceLabel = session.source.mode === "youtube" ? "YouTube" : "로컬 영상";
  const segmentCount = session.transcript.segments.length;
  if (segmentCount > 0) {
    return `${sourceLabel} · ${session.segmentIndex + 1}/${segmentCount} 문장 · ${formatTime(
      session.playbackTime
    )}`;
  }
  return `${sourceLabel} · ${formatTime(session.playbackTime)} 지점`;
}

function getVideoReaderResumeProgressWidth(session: VideoReaderResumeSession) {
  const segmentCount = session.transcript.segments.length;
  if (segmentCount > 0) {
    return `${clamp(((session.segmentIndex + 1) / segmentCount) * 100, 4, 100)}%`;
  }
  return session.playbackTime > 0 ? "12%" : "4%";
}

function normalizeLocalPathKey(filePath: string) {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function getParentFolderPath(filePath: string) {
  const normalized = filePath.trim();
  if (!normalized) {
    return "";
  }
  const separatorIndex = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return separatorIndex > 0 ? normalized.slice(0, separatorIndex) : "";
}

function getVideoPreviewUrl(fileUrl: string) {
  const normalized = fileUrl.trim();
  if (!normalized || normalized.includes("#")) {
    return normalized;
  }
  return `${normalized}#t=1`;
}

function getLocalVideoFileUrl(filePath: string) {
  const normalized = filePath.trim().replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  const encoded = normalized
    .split("/")
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join("/");
  return `${prefix}${encoded}`;
}

function getVideoFolderStorageKey(profileId: ProfileId) {
  return `${VIDEO_READER_FOLDERS_KEY_PREFIX}:${profileId}`;
}

function readStoredVideoFolders(profileId: ProfileId): SavedVideoFolder[] {
  try {
    const raw = localStorage.getItem(getVideoFolderStorageKey(profileId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((value) => normalizeStoredVideoFolder(value))
      .filter((folder): folder is SavedVideoFolder => Boolean(folder))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeStoredVideoFolders(profileId: ProfileId, folders: SavedVideoFolder[]) {
  try {
    localStorage.setItem(getVideoFolderStorageKey(profileId), JSON.stringify(folders));
  } catch {
    // Storage can fail in restricted browser contexts. The selected folder still works for this session.
  }
}

function normalizeStoredVideoFolder(value: unknown): SavedVideoFolder | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const folderPath = typeof record.folderPath === "string" ? record.folderPath.trim() : "";
  if (!folderPath) {
    return null;
  }
  const fallbackName = getVideoFolderNameFromPath(folderPath);
  const folderName =
    typeof record.folderName === "string" && record.folderName.trim()
      ? record.folderName.trim()
      : fallbackName;
  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : getVideoFolderId(folderPath);
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : undefined;
  return {
    id,
    folderPath,
    folderName,
    createdAt
  };
}

function getVideoFolderId(folderPath: string) {
  return folderPath.trim().toLowerCase();
}

function getVideoFolderNameFromPath(folderPath: string) {
  const parts = folderPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || folderPath;
}

function getVideoFolderDisplayPath(folderPath: string) {
  const normalized = folderPath.trim();
  if (normalized.length <= 58) {
    return normalized;
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const folderName = parts[parts.length - 1];
  const parentName = parts[parts.length - 2];
  if (parentName && folderName) {
    return `...\\${parentName}\\${folderName}`;
  }
  return `${normalized.slice(0, 16)}...${normalized.slice(-34)}`;
}

function findSegmentIndexAtTime(segments: ListeningTranscriptSegment[], seconds: number) {
  if (!segments.length || !Number.isFinite(seconds)) {
    return -1;
  }
  const toleranceSeconds = 0.12;
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (seconds < segment.start - toleranceSeconds) {
      high = middle - 1;
      continue;
    }
    if (seconds > segment.end + toleranceSeconds) {
      low = middle + 1;
      continue;
    }
    return middle;
  }
  return -1;
}

function parseSubtitleText(text: string): ListeningTranscriptSegment[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n/i, "");
  const blocks = normalized.split(/\n{2,}/);
  const segments: ListeningTranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) {
      continue;
    }
    const timeMatch = lines[timeLineIndex].match(/([\d:,.]+)\s+-->\s+([\d:,.]+)/);
    if (!timeMatch) {
      continue;
    }
    const start = parseSubtitleTime(timeMatch[1]);
    const end = parseSubtitleTime(timeMatch[2]);
    const subtitleText = lines
      .slice(timeLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!subtitleText || end <= start) {
      continue;
    }
    segments.push({
      id: `subtitle-${segments.length + 1}`,
      speaker: "화자",
      start,
      end,
      text: subtitleText
    });
  }
  return mergeSubtitleSegmentsIntoSentences(segments, { idPrefix: "subtitle" });
}

function parseSubtitleTime(value: string) {
  const normalized = value.replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(normalized) || 0;
}

function getYouTubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname.includes("youtu.be")) {
      return normalizeVideoId(url.pathname.replace("/", ""));
    }
    return normalizeVideoId(url.searchParams.get("v") || "");
  } catch {
    return normalizeVideoId(value);
  }
}

function normalizeVideoId(value: string) {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(normalized) ? normalized : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

function formatStatusSnippet(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) {
    return normalized;
  }
  return `${normalized.slice(0, 42)}...`;
}

function getElectronFilePath(file: File, api?: LocalEnglishMinerApi) {
  const apiPath = api?.listening.getLocalFilePath?.(file);
  if (apiPath) {
    return apiPath;
  }
  const electronFile = file as File & { path?: unknown };
  return typeof electronFile.path === "string" ? electronFile.path : "";
}

function getLocalFilePathFromTranscriptCandidateId(candidateId: string | undefined) {
  const prefix = "local-file:";
  const normalized = String(candidateId ?? "").trim();
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length).trim() : "";
}

function hasUsableListeningAudio(card: StudyCard) {
  return Boolean(card.listeningMedia?.audioClip?.fileUrl || card.listeningMedia?.audioClip?.filePath);
}

function getVideoReaderSourceKey(
  transcript: ListeningTranscript,
  segment: ListeningTranscriptSegment
) {
  return `video-reader:${transcript.candidateId}:${segment.id}:${Math.round(segment.start * 10)}`;
}

function getVideoReaderWordSourceKey(sourceKey: string, normalizedWord: string) {
  return `${sourceKey}:word:${encodeURIComponent(normalizedWord)}`;
}

function getCaptionWordHighlightKey(index: number) {
  return `word:${index}`;
}

function getUntranslatedTranscriptSegments(segments: ListeningTranscriptSegment[]) {
  return segments.filter((segment) => !segment.translationKo?.trim());
}

function splitCaptionTextIntoParts(text: string): CaptionTextPart[] {
  const parts: CaptionTextPart[] = [];
  const wordPattern = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({
        value: text.slice(cursor, index),
        isWord: false
      });
    }
    parts.push({
      value: match[0],
      isWord: true
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({
      value: text.slice(cursor),
      isWord: false
    });
  }
  return parts.length ? parts : [{ value: text, isWord: false }];
}

function normalizeCaptionWordForDisplay(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

function normalizeCaptionWordForKey(value: string) {
  return normalizeCaptionWordForDisplay(value).toLocaleLowerCase();
}

function normalizeListeningHighlightKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function uniqueListeningHighlightTerms(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalizeListeningHighlightKey(normalized);
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function findMeaningAnchor(sentence: string, candidate: string | undefined) {
  const normalizedSentence = sentence.trim();
  const normalizedCandidate = String(candidate ?? "").trim();
  if (!normalizedSentence || !normalizedCandidate) {
    return undefined;
  }
  const exactIndex = normalizedSentence.toLocaleLowerCase().indexOf(
    normalizedCandidate.toLocaleLowerCase()
  );
  if (exactIndex >= 0) {
    return normalizedSentence.slice(exactIndex, exactIndex + normalizedCandidate.length);
  }

  const tokens = normalizedCandidate
    .replace(/[()[\]{}"'`.,!?;:]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (phrase.length < 2) {
        continue;
      }
      const phraseIndex = normalizedSentence.indexOf(phrase);
      if (phraseIndex >= 0) {
        return normalizedSentence.slice(phraseIndex, phraseIndex + phrase.length);
      }
    }
  }
  return undefined;
}

function inferListeningProsodyMark(sourceText: string): StudyCardListeningAnnotation["mark"] {
  const normalized = normalizeListeningHighlightKey(sourceText);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (/[’']/.test(sourceText) || words.length >= 2) {
    return "linking-bridge";
  }
  if (/^(a|an|the|to|for|of|and|or|in|on|at|is|are|was|were|be|been)$/.test(normalized)) {
    return "reduced";
  }
  if (normalized.length >= 7) {
    return "strong-stress-dot";
  }
  return "stress-dot";
}

function getListeningProsodyLabel(
  sourceText: string,
  mark: StudyCardListeningAnnotation["mark"]
) {
  if (mark === "linking-bridge") {
    return `${sourceText}: 붙어 들림`;
  }
  if (mark === "reduced") {
    return `${sourceText}: 약하게 지나감`;
  }
  if (mark === "strong-stress-dot") {
    return `${sourceText}: 강하게 들리는 핵심어`;
  }
  return `${sourceText}: 강세 후보`;
}

function getTranscriptStatusKind(
  transcript: ListeningTranscript,
  state: { isPreparing: boolean; isExtracting: boolean; isTranscribing: boolean }
): TranscriptStatusKind {
  if (
    state.isPreparing ||
    state.isExtracting ||
    state.isTranscribing ||
    transcript.status === "processing"
  ) {
    return "working";
  }
  if (transcript.status === "failed") {
    return "failed";
  }
  return transcript.segments.length > 0 ? "ready" : "empty";
}

function getTranscriptStatusText(
  transcript: ListeningTranscript,
  statusKind: TranscriptStatusKind
) {
  if (statusKind === "working") {
    return "Whisper 전사 중";
  }
  if (statusKind === "failed") {
    return "Whisper 전사 실패";
  }
  if (statusKind === "ready") {
    return `자막 준비 완료 · ${transcript.segments.length}문장`;
  }
  return "자막 없음";
}

function getTranscriptStatusDetail(
  transcript: ListeningTranscript,
  statusKind: TranscriptStatusKind,
  fallbackStatus: string
) {
  if (statusKind === "working") {
    return (
      fallbackStatus ||
      "영상 길이에 따라 시간이 걸릴 수 있습니다. 완료되면 첫 문장을 자동으로 보여줍니다."
    );
  }
  if (statusKind === "failed") {
    return transcript.errorMessage || fallbackStatus || "Whisper 전사에 실패했습니다.";
  }
  if (statusKind === "ready") {
    return "아래 문장 카드와 오른쪽 자막 리스트에서 바로 들을 수 있습니다.";
  }
  return fallbackStatus || "SRT/VTT 자막을 불러오거나 로컬 Whisper를 실행하세요.";
}

function getSubtitleModeLabel(mode: SubtitleMode) {
  if (mode === "source") {
    return "원문";
  }
  if (mode === "translation") {
    return "번역";
  }
  if (mode === "bilingual") {
    return "이중자막";
  }
  return "가림";
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function suppressYouTubeCaptions(player: YouTubePlayer | null) {
  if (!player) {
    return;
  }

  for (const delay of [0, 250, 900, 1800]) {
    window.setTimeout(() => {
      try {
        player.unloadModule?.("captions");
        player.unloadModule?.("cc");
        player.setOption?.("captions", "track", {});
      } catch {
        // YouTube iframe modules are best-effort and vary by embed state.
      }
    }, delay);
  }
}

function loadYouTubeIframeApi() {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    youtubeApiCallbacks.push(resolve);
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      const callbacks = youtubeApiCallbacks.splice(0);
      callbacks.forEach((callback) => callback());
    };
  });
}
