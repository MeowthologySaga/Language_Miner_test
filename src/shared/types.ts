export type CardType = "reading" | "life_expression" | "output_error";

export type CardDeckType = "input" | "input-listening" | "output";

export type CardDirection = "en_to_ko" | "ko_to_en" | "target_to_native" | "native_to_target";

export type HighlightColorKey =
  | "red"
  | "orange"
  | "blue"
  | "purple"
  | "green"
  | "pink"
  | "cyan"
  | "yellow"
  | "lime"
  | "slate";

export type ProviderName = "mock" | "ollama" | "gemini";

export type TranslationProviderName = "local" | "localMt" | "google" | "gemini" | "browser";

export type TtsProviderName = "system" | "browser" | "piper";

export type BrowserSelectionCardMode = "preview" | "autoSave";

export type BrowserCaptureSiteSettings = {
  discord: boolean;
  chatgpt: boolean;
  claude: boolean;
  youtube: boolean;
  reddit: boolean;
  genericWeb: boolean;
};

export type LifeMiningCapturePreset = "light" | "balanced" | "deep" | "custom";

export type LifeMiningCaptureTarget = "own" | "own_with_reply" | "all";

export type LifeMiningCaptureScope = "new_only" | "visible" | "recent" | "manual_all";

export type LifeMiningContextMode =
  | "none"
  | "previous_1"
  | "previous_2"
  | "previous_and_next"
  | "recent";

export type LifeMiningLongMessageMode = "truncate" | "summarize" | "skip";

export type LifeMiningCaptureSettings = {
  preset: LifeMiningCapturePreset;
  target: LifeMiningCaptureTarget;
  scope: LifeMiningCaptureScope;
  contextMode: LifeMiningContextMode;
  contextBeforeCount: number;
  contextAfterCount: number;
  maxMessageChars: number;
  longMessageMode: LifeMiningLongMessageMode;
  filterLowSignalTargets: boolean;
  dedupeEnabled: boolean;
};

export type WebReaderLifeMiningState = {
  enabled: boolean;
  siteKey?: keyof BrowserCaptureSiteSettings | "unsupported";
  mode: "auto" | "selection" | "off";
  lastCaptureAt?: string;
  message?: string;
};

export type GeminiPlan = "free" | "paid";

export type ProfileLanguage = {
  code: string;
  nameKo: string;
  nameEn: string;
};

export type LearningProfile = {
  targetLanguage: ProfileLanguage;
  nativeLanguage: ProfileLanguage;
};

export type ProfileId = string;

export type LearningProfileRecord = {
  id: ProfileId;
  name: string;
  learningProfile: LearningProfile;
  createdAt: string;
  updatedAt: string;
};

export type InputLanguageCode = "en" | "ja" | "ko" | "unknown";

export type InputLanguagePolicyStatus = "match" | "mismatch" | "unknown" | "override";

export type InputLanguageSourceKind = "original" | "translated_page" | "manual_override";

export type CardLanguageMetadata = {
  profileTargetLanguageCode: string;
  profileNativeLanguageCode: string;
  detectedSourceLanguageCode: InputLanguageCode;
  actualSourceLanguageCode: InputLanguageCode | string;
  confidence: number;
  policyStatus: InputLanguagePolicyStatus;
  sourceKind: InputLanguageSourceKind;
};

export type PdfTranslationTermCategory =
  | "acronym"
  | "edition"
  | "person"
  | "proper_noun"
  | "publisher"
  | "repeated_term"
  | "title";

export type PdfTranslationTermPolicy =
  | "preserve"
  | "preserve_if_uncertain"
  | "translate_consistently";

export type PdfTranslationContextTerm = {
  source: string;
  target: string;
  category: PdfTranslationTermCategory;
  policy: PdfTranslationTermPolicy;
  confidence: number;
  occurrences: number;
};

export type PdfTranslationContext = {
  sourceLang: string;
  targetLang: string;
  terms: PdfTranslationContextTerm[];
  styleGuide: string[];
  contextHash: string;
  promptVersion: string;
};

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type LearningMissionEventType =
  | "review_completed"
  | "review_input_reading_deck_completed"
  | "review_input_listening_deck_completed"
  | "review_output_deck_completed"
  | "card_created"
  | "life_mining_card_created"
  | "writing_practice_completed"
  | "listening_sentence_completed";

export type DailyMissionCategory = "input" | "output" | "review";

export type DailyMissionId =
  | "review-10"
  | "review-30"
  | "review-input-reading-deck"
  | "review-input-listening-deck"
  | "review-output-deck"
  | "card-2"
  | "life-mining-card-5"
  | "listening-30"
  | "writing-3"
  | "writing-10";

export type DailyMissionBonusId = "daily-bonus";

export type DiamondTransactionType = "earn" | "spend" | "adjust";

export type DiamondWallet = {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  updatedAt: string;
};

export type DiamondTransaction = {
  id: string;
  type: DiamondTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string;
  missionId?: DailyMissionId | DailyMissionBonusId;
  profileId?: ProfileId;
  dateKey: string;
  createdAt: string;
};

export type LearningMissionEvent = {
  id: string;
  dateKey: string;
  type: LearningMissionEventType;
  profileId?: ProfileId;
  amount: number;
  metadata?: Record<string, string | number | boolean | undefined>;
  createdAt: string;
};

export type DailyMissionProgress = {
  dateKey: string;
  missionId: DailyMissionId | DailyMissionBonusId;
  progress: number;
  claimed: boolean;
  claimedAt?: string;
  updatedAt: string;
};

export type DailyMissionStatus = {
  id: DailyMissionId;
  category: DailyMissionCategory;
  title: string;
  description: string;
  eventType: LearningMissionEventType;
  goal: number;
  progress: number;
  rewardDiamonds: number;
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
};

export type DailyMissionBonusStatus = {
  id: DailyMissionBonusId;
  title: string;
  description: string;
  rewardDiamonds: number;
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
};

export type DailyMissionBoard = {
  dateKey: string;
  missions: DailyMissionStatus[];
  bonus: DailyMissionBonusStatus;
  earnedToday: number;
  allBaseRewardsClaimed: boolean;
};

export type HighlightMapping = {
  sourceText: string;
  literalKo?: string;
  naturalKo?: string;
  colorKey: HighlightColorKey;
};

export type VocabularyItem = {
  term: string;
  ipa?: string;
  partOfSpeech?: string;
  basicMeaningKo: string;
  meaningInContextKo?: string;
  etymologyKo?: string;
  usagePatterns?: string[];
  colorKey: HighlightColorKey;
  examples: string[];
};

export type PumpPrompt = {
  type: "ko_to_en" | "make_sentence" | "question_answer";
  promptKo: string;
  requiredTerms?: string[];
};

export type ConfusingComparisonKind = "similar" | "contrast" | "nuance" | "collocation";

export type ConfusingComparison = {
  kind?: ConfusingComparisonKind;
  title: string;
  explanationKo: string;
};

export type StudyCardTtsAudio = {
  id: string;
  text: string;
  languageCode: string;
  providerName: TtsProviderName;
  model: string;
  voiceName?: string;
  mimeType: string;
  audioDataUrl: string;
  createdAt: string;
};

export type StudyCardListeningMediaSourceType =
  | "transcript-audio"
  | "local-video"
  | "local-playback-video"
  | "youtube-audio";

export type StudyCardListeningMedia = {
  audioClip?: {
    filePath: string;
    fileUrl: string;
    mimeType: string;
    start: number;
    end: number;
    sourceType: StudyCardListeningMediaSourceType;
    createdAt: string;
  };
  frameImage?: {
    filePath: string;
    fileUrl: string;
    mimeType: string;
    capturedAt: number;
    createdAt: string;
  };
};

export type ListeningProsodyMark =
  | "stress-dot"
  | "strong-stress-dot"
  | "rising-curve"
  | "falling-curve"
  | "continuing-curve"
  | "linking-bridge"
  | "reduced";

export type StudyCardListeningAnnotation = {
  anchorText: string;
  mark: ListeningProsodyMark;
  label?: string;
  confidence?: number;
};

export type StudyCard = {
  id: string;
  profileId?: ProfileId;
  cardType: CardType;
  deckType: CardDeckType;
  direction: CardDirection;
  languageMetadata?: CardLanguageMetadata;
  sourceSentence: string;
  targetText?: string;
  frontText: string;
  literalTranslationKo?: string;
  naturalTranslationKo?: string;
  highlightMappings: HighlightMapping[];
  vocabularyItems: VocabularyItem[];
  structureNote?: string;
  confusingComparisons?: ConfusingComparison[];
  pumpPrompts?: PumpPrompt[];
  syncMetadata?: {
    conflict?: boolean;
    originalCardId?: string;
    conflictSource?: "sync-folder";
    conflictAt?: string;
    localUpdatedAt?: string;
    remoteUpdatedAt?: string;
  };
  ttsAudio?: StudyCardTtsAudio[];
  listeningMedia?: StudyCardListeningMedia;
  listeningAnnotations?: StudyCardListeningAnnotation[];
  srs: {
    dueAt: string;
    intervalDays: number;
    easeFactor: number;
    reviewCount: number;
    lapseCount: number;
    lastReviewedAt?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type CardSyncSettings = {
  folderPath: string;
};

export type AppRuntimeStatus = {
  isElectron: boolean;
  trayAvailable: boolean;
  launchAtLogin: boolean;
  canConfigureLaunchAtLogin: boolean;
  message: string;
};

export type CardSyncSnapshot = {
  schemaVersion: 1;
  appName: "Language Miner";
  exportedAt: string;
  cards: StudyCard[];
};

export type CardSyncStatus = {
  configured: boolean;
  connected: boolean;
  message: string;
  folderPath?: string;
  remoteFileName?: string;
  remoteModifiedAt?: string;
};

export type CardSyncResult = {
  mode: "upload" | "download" | "sync";
  localCardCount: number;
  remoteCardCount: number;
  mergedCardCount: number;
  uploadedCardCount: number;
  downloadedCardCount: number;
  skippedCardCount: number;
  conflictCount: number;
  remoteModifiedAt?: string;
  message: string;
};

export type GeneratedCardData = Omit<
  StudyCard,
  "id" | "srs" | "createdAt" | "updatedAt" | "deckType" | "direction"
> &
  Partial<Pick<StudyCard, "id" | "srs" | "deckType" | "direction">>;

export type LifeLogMessageRole = "user" | "assistant" | "other" | "system";

export type LifeLogMessage = {
  role: LifeLogMessageRole;
  speaker?: string;
  raw_content: string;
  timestamp?: string;
};

export type LifeLogMetadata = {
  url?: string;
  title?: string;
  trigger?: string;
  capturedAt?: string;
  extensionVersion?: string;
  currentUserSpeaker?: string;
  messages?: LifeLogMessage[];
  processedProfileIds?: ProfileId[];
  [key: string]: unknown;
};

export type LifeLog = {
  id: string;
  text: string;
  beforeContext?: string;
  afterContext?: string;
  appName?: string;
  metadata?: LifeLogMetadata;
  sourceType: "manual" | "clipboard" | "browser_extension" | "desktop_capture";
  processed: boolean;
  createdAt: string;
};

export type ListeningVideoSourceType =
  | "youtube_extension"
  | "youtube_rss"
  | "manual"
  | "curated";

export type ListeningVideoCandidateInput = {
  videoId: string;
  url: string;
  title: string;
  sourceType: ListeningVideoSourceType;
  languageCode?: string;
  channelName?: string;
  channelUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  watchedSeconds?: number;
  progressRatio?: number;
  lastPositionSeconds?: number;
  collectedAt?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
};

export type ListeningVideoCandidate = ListeningVideoCandidateInput & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  watchCount: number;
};

export type ListeningLocalVideoFile = {
  filePath: string;
  fileName: string;
  title: string;
  fileUrl: string;
  folderPath?: string;
  originalFileUrl?: string;
  playbackFilePath?: string;
  playbackSource?: "original" | "remuxed";
  playbackMessage?: string;
};

export type ListeningLocalVideoFolder = {
  folderPath: string;
  folderName: string;
  createdAt?: string;
};

export type ListeningLocalTranscriptInput = {
  filePath: string;
  title?: string;
  languageCode?: string;
};

export type ListeningTranscriptSegment = {
  id: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
  translationKo?: string;
  noteKo?: string;
};

export type ListeningTranscriptStatus = "ready" | "processing" | "failed";

export type ListeningTranscript = {
  id: string;
  candidateId: string;
  videoId: string;
  title: string;
  channelName?: string;
  languageCode?: string;
  status: ListeningTranscriptStatus;
  segments: ListeningTranscriptSegment[];
  errorMessage?: string;
  audioPath?: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type ListeningToolStatus = {
  ytDlpAvailable: boolean;
  ffmpegAvailable: boolean;
  whisperAvailable: boolean;
  ytDlpCommand: string;
  ffmpegCommand: string;
  whisperCommand: string;
  message: string;
};

export type ListeningTranscriptGenerationResult = {
  ok: boolean;
  transcript?: ListeningTranscript;
  toolStatus: ListeningToolStatus;
  message: string;
};

export type ListeningCardMediaClipInput = {
  profileId?: ProfileId;
  cardId: string;
  sourcePath?: string;
  frameSourcePath?: string;
  sourceType: StudyCardListeningMediaSourceType;
  start: number;
  end: number;
  includeFrameImage?: boolean;
};

export type ListeningCardMediaClipResult = {
  ok: boolean;
  media?: StudyCardListeningMedia;
  toolStatus: ListeningToolStatus;
  message: string;
};

export type GenerateReadingCardInput = {
  selectedText: string;
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  readerTextContext?: string;
  learningProfile: LearningProfile;
  learnerLevel?: string;
  translationContext?: string;
};

export type GenerateLifeExpressionCardInput = {
  koreanText: string;
  beforeContext?: string;
  afterContext?: string;
  learningProfile: LearningProfile;
  learnerLevel?: string;
};

export type DesktopOcrSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesktopOcrCaptureResult = {
  id: string;
  imageDataUrl?: string;
  text: string;
  message: string;
  rect: DesktopOcrSelectionRect;
  createdAt: string;
};

export type DesktopOcrCardInput = {
  selectedText: string;
  sourceSentence: string;
  ocrText?: string;
  languagePolicyOverride?: boolean;
};

export type CharacterChatMessage = {
  id: string;
  role: "user" | "character";
  content: string;
  createdAt: string;
};

export type CharacterPreset = {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  messageExample: string;
  creatorNotes?: string;
  alternateGreetings: string[];
  tags: string[];
  creator?: string;
  characterBook?: unknown;
  sourceFormat?: "local" | "tavern_v1" | "tavern_v2" | "tavern_v3" | "risu" | "unknown";
  createdAt: string;
  updatedAt: string;
};

export type CharacterRagHint = {
  cardId: string;
  sourceSentence: string;
  naturalMeaning?: string;
  terms: string[];
};

export type GenerateCharacterChatReplyInput = {
  character: CharacterPreset;
  messages: CharacterChatMessage[];
  userMessage: string;
  ragHints: CharacterRagHint[];
  learnerLevel?: string;
};

export type TranslationCacheLookupInput = {
  profileId?: ProfileId;
  text: string;
  sourceLang?: string;
  targetLang: string;
  providerName: TranslationProviderName;
  model?: string;
  promptVersion?: string;
  contextHash?: string;
};

export type TranslationCacheEntry = {
  id: string;
  profileId?: ProfileId;
  providerName: TranslationProviderName;
  sourceLang: string;
  targetLang: string;
  sourceHash: string;
  sourceText: string;
  translatedText: string;
  model?: string;
  promptVersion?: string;
  contextHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type TranslateTextInput = TranslationCacheLookupInput & {
  googleApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiPlan?: GeminiPlan;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  sourceLanguage?: ProfileLanguage;
  outputLanguage?: ProfileLanguage;
  translationContext?: PdfTranslationContext;
};

export type PdfTextSegment = {
  id: string;
  pageNumber: number;
  index: number;
  text: string;
  sourceBounds?: PdfPageRect;
  sourceLineBounds?: PdfPageRect[];
};

export type PdfPageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfSegmentTranslation = {
  id: string;
  translationKo: string;
  cacheStatus?: "hit" | "miss";
};

export type TranslatePdfSegmentsInput = {
  profileId?: ProfileId;
  segments: PdfTextSegment[];
  sourceLang?: string;
  targetLang: string;
  providerName: TranslationProviderName;
  bypassCache?: boolean;
  model?: string;
  promptVersion?: string;
  contextHash?: string;
  googleApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiPlan?: GeminiPlan;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  sourceLanguage?: ProfileLanguage;
  outputLanguage?: ProfileLanguage;
  translationContext?: PdfTranslationContext;
};

export type TranslatePdfSegmentsResult = {
  translations: PdfSegmentTranslation[];
  providerName: TranslationProviderName;
  sourceLang: string;
  targetLang: string;
  cacheStatus: "hit" | "miss" | "partial";
  missingSegmentIds: string[];
  usage?: TranslationUsageEvent;
  createdAt: string;
  updatedAt: string;
};

export type BilingualPdfExportPage = {
  pageNumber: number;
  sourcePageImageDataUrl?: string;
  sourcePageWidth?: number;
  sourcePageHeight?: number;
  segments: Array<{
    id: string;
    sourceText: string;
    translationText: string;
    sourceBounds?: PdfPageRect;
    sourceLineBounds?: PdfPageRect[];
  }>;
};

export type BilingualPdfExportMode = "reading" | "paper";

export type BilingualPdfExportInput = {
  profileId?: ProfileId;
  title: string;
  sourceLanguageLabel: string;
  targetLanguageLabel: string;
  sourcePdfData?: Uint8Array;
  sourcePdfFilePath?: string;
  exportMode?: BilingualPdfExportMode;
  includeCoverPage?: boolean;
  showPageChrome?: boolean;
  showSourceHighlights?: boolean;
  omitSourceColumnContent?: boolean;
  pages: BilingualPdfExportPage[];
};

export type BilingualPdfExportResult = {
  filePath: string;
  fileType: "pdf" | "html";
  pageCount: number;
  segmentCount: number;
};

export type BilingualExportHistoryRecord = {
  id: string;
  profileId?: ProfileId;
  title: string;
  filePath: string;
  fileType: BilingualPdfExportResult["fileType"];
  pageRange: string;
  pageCount: number;
  segmentCount: number;
  providerLabel: string;
  sourceLanguageLabel: string;
  targetLanguageLabel: string;
  createdAt: string;
};

export type PdfFileReadResult = {
  fileName: string;
  filePath: string;
  data: Uint8Array;
};

export type TextFileReadResult = {
  fileName: string;
  filePath: string;
  text: string;
};

export type BilingualReaderArtifact = {
  id: string;
  profileId?: ProfileId;
  title: string;
  filePath: string;
  fileType: BilingualPdfExportResult["fileType"];
  sourceLabel: string;
  translationLabel: string;
  pageCount: number;
  createdAt: string;
};

export type RecentDocumentRecord = {
  id: string;
  profileId?: ProfileId;
  title: string;
  filePath: string;
  fileType: BilingualPdfExportResult["fileType"];
  sourceLabel: string;
  translationLabel: string;
  pageCount: number;
  source: "reader" | "export" | "manual" | "debug";
  lastOpenedAt: string;
  createdAt: string;
};

export type OllamaModelInput = {
  baseUrl?: string;
  model: string;
};

export type OllamaModelStatusResult = {
  baseUrl: string;
  model: string;
  installed: boolean;
  installedModels: string[];
};

export type PullOllamaModelResult = {
  baseUrl: string;
  model: string;
  status: "already_installed" | "downloaded";
};

export type TranslationUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  billableCharacters: number;
  requestCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
};

export type TranslationUsageEvent = {
  id?: string;
  profileId?: ProfileId;
  providerName: TranslationProviderName;
  model: string;
  plan?: GeminiPlan;
  sourceLang: string;
  targetLang: string;
  usage: TranslationUsageTotals;
  estimatedCostKrw: {
    min: number;
    max: number;
  };
  createdAt: string;
};

export type TranslationConnectionTestInput = {
  providerName: TranslationProviderName;
  googleApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  localMtModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
};

export type TranslationConnectionTestResult = {
  ok: boolean;
  message: string;
};

export type TranslateTextResult = {
  translatedText: string;
  providerName: TranslationProviderName;
  sourceLang: string;
  targetLang: string;
  cacheStatus: "hit" | "miss";
  usage?: TranslationUsageEvent;
  createdAt: string;
  updatedAt: string;
};

export type TtsSynthesisInput = {
  text: string;
  languageCode: string;
  providerName: TtsProviderName;
  model: string;
  voiceName?: string;
  rate?: number;
};

export type TtsSynthesisResult = {
  audioDataUrl?: string;
  mimeType?: string;
  providerName: TtsProviderName;
  model: string;
  voiceName?: string;
  message?: string;
  createdAt: string;
};

export type TtsVoiceInfo = {
  id: string;
  name: string;
  culture?: string;
  gender?: string;
  age?: string;
};

export type WebReaderCustomSource = {
  id: string;
  label: string;
  url: string;
  languageCode: string;
  categoryId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type WebReaderCustomCategoryPurpose = "input-reading" | "output-life";

export type WebReaderCustomCategory = {
  id: string;
  label: string;
  languageCode: string;
  purpose?: WebReaderCustomCategoryPurpose;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  profileId: ProfileId;
  providerName: ProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  localMtModel: string;
  translationProviderName: TranslationProviderName;
  googleTranslateApiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiPlan: GeminiPlan;
  ttsProviderName: TtsProviderName;
  ttsModel: string;
  ttsVoiceName: string;
  ttsRate: number;
  preGenerateCardTts: boolean;
  monthlySpendLimitKrw: number;
  dailyAppTokenLimit: number;
  confirmEstimatedCostBeforeRun: boolean;
  confirmLifeMiningCardCost: boolean;
  stopOnFreeTierLimit: boolean;
  stopOnMonthlyLimit: boolean;
  learningProfile: LearningProfile;
  pdfExportMode: BilingualPdfExportMode;
  showPdfSourceHighlights: boolean;
  captureShortcut: string;
  browserSelectionCardMode: BrowserSelectionCardMode;
  browserCaptureSiteSettings: BrowserCaptureSiteSettings;
  webReaderCustomSources: WebReaderCustomSource[];
  webReaderCustomCategories?: WebReaderCustomCategory[];
  listeningLoopBackgroundPrebuildEnabled: boolean;
  listeningLoopLongVideoPartialClipsEnabled: boolean;
  lifeMiningCaptureSettings: LifeMiningCaptureSettings;
  cardSyncFolderPath: string;
  cardSyncOnStartup: boolean;
  cardSyncOnQuit: boolean;
  labsHideSidebarNavigation: boolean;
  labsHideGlossaryNavigation: boolean;
  debugMode: boolean;
  debugPdfPath: string;
};
