import type {
  BilingualExportHistoryRecord,
  BilingualPdfExportInput,
  BilingualPdfExportResult,
  BilingualReaderArtifact,
  AppSettings,
  AppRuntimeStatus,
  CardSyncResult,
  CardSyncStatus,
  DailyMissionBoard,
  DailyMissionId,
  DesktopOcrCardInput,
  DesktopOcrCaptureResult,
  DesktopOcrSelectionRect,
  DiamondTransaction,
  DiamondWallet,
  CardSyncSettings,
  LearningMissionEvent,
  LifeLog,
  ListeningLocalTranscriptInput,
  ListeningCardMediaClipInput,
  ListeningCardMediaClipResult,
  ListeningLocalVideoFolder,
  ListeningLocalVideoFile,
  ListeningToolStatus,
  ListeningTranscript,
  ListeningTranscriptGenerationResult,
  ListeningVideoCandidate,
  ListeningVideoCandidateInput,
  OllamaModelInput,
  OllamaModelStatusResult,
  PdfFileReadResult,
  ProfileId,
  PullOllamaModelResult,
  ReviewRating,
  StudyCard,
  TextFileReadResult,
  TtsSynthesisInput,
  TtsSynthesisResult,
  TtsVoiceInfo,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult,
  TranslatePdfSegmentsInput,
  TranslatePdfSegmentsResult,
  TranslateTextInput,
  TranslateTextResult,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationUsageEvent,
  WebReaderLifeMiningState
} from "../shared/types";

export type LocalEnglishMinerApi = {
  app?: {
    getRuntimeStatus(): Promise<AppRuntimeStatus>;
    setLaunchAtLogin(enabled: boolean): Promise<AppRuntimeStatus>;
    setPlayerFullscreen?(enabled: boolean): Promise<boolean>;
    setBridgeSettings(settings: {
      browserCaptureSiteSettings: AppSettings["browserCaptureSiteSettings"];
      lifeMiningCaptureSettings: AppSettings["lifeMiningCaptureSettings"];
      captureShortcut: AppSettings["captureShortcut"];
      browserSelectionCardMode: AppSettings["browserSelectionCardMode"];
      providerName: AppSettings["providerName"];
      ollamaBaseUrl: AppSettings["ollamaBaseUrl"];
      ollamaModel: AppSettings["ollamaModel"];
      geminiApiKey: AppSettings["geminiApiKey"];
      geminiModel: AppSettings["geminiModel"];
      geminiPlan: AppSettings["geminiPlan"];
      learningProfile: AppSettings["learningProfile"];
      dailyAppTokenLimit: AppSettings["dailyAppTokenLimit"];
      monthlySpendLimitKrw: AppSettings["monthlySpendLimitKrw"];
      cardSyncFolderPath: AppSettings["cardSyncFolderPath"];
      cardSyncOnQuit: AppSettings["cardSyncOnQuit"];
    }): Promise<boolean>;
    openPlayZoneRuntimeWindow?(input: {
      runtimeId: "cartridge";
      cartridgeId: string;
      title: string;
      entryUrl: string;
      walletBalance: number;
    }): Promise<boolean>;
    onUsageRecorded?(callback: (event: TranslationUsageEvent) => void): () => void;
  };
  webReader?: {
    attach(input: {
      url: string;
      bounds: { x: number; y: number; width: number; height: number };
    }): Promise<WebReaderBrowserState>;
    setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<WebReaderBrowserState>;
    loadUrl(url: string): Promise<WebReaderBrowserState>;
    goBack(): Promise<WebReaderBrowserState>;
    goForward(): Promise<WebReaderBrowserState>;
    reload(): Promise<WebReaderBrowserState>;
    getState(): Promise<WebReaderBrowserState>;
    getLifeMiningState(): Promise<WebReaderLifeMiningState>;
    getPageTextSegments?(): Promise<WebReaderPageTextSegments | null>;
    applyPageTranslations?(input: WebReaderPageTranslationApplyInput): Promise<boolean>;
    restorePageTranslations?(): Promise<boolean>;
    getSelection(): Promise<WebReaderBrowserSelection | null>;
    consumePopoverAction?(): Promise<Record<string, unknown> | null>;
    showSelectionPopover?(): Promise<boolean>;
    showPopoverStatus?(input: { state: "ready" | "working" | "ok" | "error"; message?: string }): Promise<boolean>;
    showPopoverResult?(card: unknown): Promise<boolean>;
    hidePopover?(): Promise<boolean>;
    testSelectionPopover?(
      preferredText?: string,
      expectedContext?: string
    ): Promise<Record<string, unknown> | null>;
    testLifeMiningCapture?(): Promise<WebReaderLifeMiningState>;
    captureLifeMiningNow?(): Promise<{
      state: WebReaderLifeMiningState;
      savedCount: number;
      queued: boolean;
      debug: unknown;
    }>;
    detach(): Promise<boolean>;
  };
  profiles?: {
    setActive(profileId: ProfileId): Promise<boolean>;
  };
  desktopCapture?: {
    startOcrCapture(): Promise<boolean>;
    finishOcrSelection(rect: DesktopOcrSelectionRect): Promise<DesktopOcrCaptureResult>;
    cancelOcrSelection(): Promise<boolean>;
    createInputCard(input: DesktopOcrCardInput): Promise<StudyCard>;
  };
  cards: {
    list(profileId?: ProfileId): Promise<StudyCard[]>;
    listDue(nowIso?: string, profileId?: ProfileId): Promise<StudyCard[]>;
    save(card: StudyCard, profileId?: ProfileId): Promise<StudyCard>;
    delete(id: string): Promise<boolean>;
    review(cardId: string, rating: ReviewRating): Promise<StudyCard>;
    onChanged?(callback: (card: StudyCard) => void): () => void;
  };
  wallet: {
    get(): Promise<DiamondWallet>;
    listTransactions(): Promise<DiamondTransaction[]>;
  };
  missions: {
    getToday(profileId?: ProfileId): Promise<DailyMissionBoard>;
    recordEvent(
      event: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">
    ): Promise<DailyMissionBoard>;
    claimReward(missionId: DailyMissionId, profileId?: ProfileId): Promise<DailyMissionBoard>;
    claimDailyBonus(profileId?: ProfileId): Promise<DailyMissionBoard>;
  };
  cardSync: {
    status(settings: CardSyncSettings): Promise<CardSyncStatus>;
    connect(settings: CardSyncSettings): Promise<CardSyncStatus>;
    disconnect(): Promise<CardSyncStatus>;
    upload(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
    download(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
    sync(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
  };
  lifeLogs: {
    list(): Promise<LifeLog[]>;
    save(input: Omit<LifeLog, "id" | "processed" | "createdAt">): Promise<LifeLog>;
    markProcessed(id: string, profileId?: ProfileId): Promise<boolean>;
    delete(id: string): Promise<boolean>;
    onChanged?(callback: (lifeLog: LifeLog) => void): () => void;
  };
  listening: {
    listVideoCandidates(): Promise<ListeningVideoCandidate[]>;
    saveVideoCandidate(input: ListeningVideoCandidateInput): Promise<ListeningVideoCandidate>;
    markVideoCandidatesLearned(candidateIds: string[]): Promise<ListeningVideoCandidate[]>;
    fetchRssCandidates(languageCode?: string): Promise<ListeningVideoCandidate[]>;
    refreshVideoCandidateMetadata(candidateIds?: string[]): Promise<ListeningVideoCandidate[]>;
    listTranscripts(): Promise<ListeningTranscript[]>;
    getTranscript(candidateId: string): Promise<ListeningTranscript | null>;
    saveTranscript(transcript: ListeningTranscript): Promise<ListeningTranscript>;
    generateTranscript(candidateId: string): Promise<ListeningTranscriptGenerationResult>;
    pickLocalVideoFile(folderPath?: string): Promise<ListeningLocalVideoFile | null>;
    listLocalVideoFolderVideos(folderPath: string): Promise<ListeningLocalVideoFile[]>;
    getLocalFilePath?(file: File): string;
    pickLocalVideoFolder(): Promise<ListeningLocalVideoFolder | null>;
    prepareLocalVideoFile(input: ListeningLocalVideoFile): Promise<ListeningLocalVideoFile>;
    createListeningCardMediaClip(
      input: ListeningCardMediaClipInput
    ): Promise<ListeningCardMediaClipResult>;
    extractLocalEmbeddedSubtitle(
      input: ListeningLocalTranscriptInput
    ): Promise<ListeningTranscriptGenerationResult>;
    generateLocalTranscript(
      input: ListeningLocalTranscriptInput
    ): Promise<ListeningTranscriptGenerationResult>;
    getToolStatus(): Promise<ListeningToolStatus>;
  };
  documents: {
    exportBilingualPdf(input: BilingualPdfExportInput): Promise<BilingualPdfExportResult>;
    listExportRecords(profileId?: ProfileId): Promise<BilingualExportHistoryRecord[]>;
    saveExportRecord(record: BilingualExportHistoryRecord): Promise<BilingualExportHistoryRecord>;
    redownloadExport(record: BilingualExportHistoryRecord): Promise<BilingualPdfExportResult>;
    pickReaderArtifact(): Promise<BilingualReaderArtifact | null>;
    readPdfFile(filePath: string): Promise<PdfFileReadResult | null>;
    readTextFile(filePath: string): Promise<TextFileReadResult | null>;
    openPath(filePath: string): Promise<boolean>;
    revealPath(filePath: string): Promise<boolean>;
  };
  translations: {
    getCached(input: TranslationCacheLookupInput): Promise<TranslationCacheEntry | null>;
    saveCached(
      input: TranslationCacheLookupInput & { translatedText: string }
    ): Promise<TranslationCacheEntry>;
    getOllamaModelStatus(input: OllamaModelInput): Promise<OllamaModelStatusResult>;
    pullOllamaModel(input: OllamaModelInput): Promise<PullOllamaModelResult>;
    testConnection(input: TranslationConnectionTestInput): Promise<TranslationConnectionTestResult>;
    translate(input: TranslateTextInput): Promise<TranslateTextResult>;
    translatePdfSegments(input: TranslatePdfSegmentsInput): Promise<TranslatePdfSegmentsResult>;
  };
  tts?: {
    synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult>;
    listVoices(): Promise<TtsVoiceInfo[]>;
  };
  qa?: {
    heartbeat(payload: Record<string, unknown>): Promise<boolean>;
  };
};

export type WebReaderBrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  innerHeight: number;
  innerWidth: number;
};

export type WebReaderPageTextSegment = {
  id: string;
  text: string;
};

export type WebReaderPageTextSegments = {
  url: string;
  title: string;
  segments: WebReaderPageTextSegment[];
};

export type WebReaderPageTranslationApplyInput = {
  targetLanguageCode: string;
  segments: Array<WebReaderPageTextSegment & { translatedText: string }>;
};

export type WebReaderBrowserSelection = {
  selectedText: string;
  sourceSentence?: string;
  fullText: string;
  selectionOffset?: number;
  title: string;
  url: string;
  rect: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  };
};
