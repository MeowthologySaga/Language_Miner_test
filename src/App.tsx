import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Gem,
  ListChecks,
  SkipForward,
  Sparkles,
  X
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiClient } from "./data/apiClient";
import {
  finishDailyRoutineStep,
  goToNextDailyRoutineStep,
  goToPreviousDailyRoutineStep,
  reopenSkippedDailyRoutineStep,
  readDailyRoutineRun
} from "./appDailyRoutine";
import {
  readNavSectionExpandedState,
  readSidebarCollapsed,
  writeNavSectionExpandedState,
  writeSidebarCollapsed,
  type NavSectionExpandedState,
  type NavSectionId
} from "./appSidebarState";
import {
  getNavSectionIdForTab,
  homeNavItem,
  navSectionHasTab,
  navSections,
  routeMeta,
  type NavItem,
  type NavSection,
  type TabKey
} from "./appNavigation";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  getProfileInitials,
  normalizeProfileRecordForSave,
  PROFILES_STORAGE_KEY,
  readProfiles
} from "./appProfiles";
import {
  applyWebLocalGeminiSettings,
  defaultSettings,
  normalizeAppSettingsForStorage,
  readAppSettings
} from "./appSettings";
import {
  formatElectricityCost,
  formatInteger,
  formatLocalRuntime,
  formatUsageCost,
  formatUsageLimit,
  getUsageLimitChipClassName
} from "./appUsageFormatting";
import { createProfiledApi } from "./profiledApi";
import {
  getLastReaderArtifactKey,
  getRecentDocumentsKey,
  normalizeRecentDocuments,
  pathsMatch,
  readReaderArtifact,
  readRecentDocuments,
  recentDocumentFromArtifact
} from "./recentDocuments";
import { createProvider } from "./services/llm/providerRegistry";
import {
  buildDailyMissionBoard,
  getMissionDateKey,
  normalizeDailyMissionBoard
} from "./shared/dailyMissions";
import {
  createDailyRoutineRun,
  getCurrentRoutineStep,
  getDailyRoutineProgress,
  getDailyRoutineStorageKey,
  type DailyRoutineRun,
  type DailyRoutineStep,
  type DailyRoutineStepId
} from "./shared/dailyRoutine";
import { formatCompactNumber } from "./shared/translationUsage";
import {
  DEFAULT_PROFILE_ID,
  normalizeActiveProfileId
} from "./shared/profiles";
import { SettingsProfileSwitcher } from "./pages/SettingsProfileSwitcher";
import { createProfilePreset } from "./pages/settingsPageUtils";
import type {
  AppSettings,
  BilingualReaderArtifact,
  DailyMissionBoard,
  DailyMissionId,
  DiamondWallet,
  LifeLog,
  LearningProfileRecord,
  ProfileId,
  RecentDocumentRecord,
  StudyCard
} from "./shared/types";
import {
  recordTranslationUsageEvent,
  summarizeTranslationUsage,
  type TranslationUsageLedgerSummary,
  usageUpdatedEventName
} from "./utils/translationUsageLedger";
import { createUsageTrackedProvider } from "./utils/llmUsageTracking";

type WebReaderOpenUrlRequest = {
  requestId: number;
  url: string;
  label?: string;
};

const BilingualBookMakerPage = lazy(() =>
  import("./pages/BilingualBookMakerPage").then((module) => ({
    default: module.BilingualBookMakerPage
  }))
);
const BookmarksPage = lazy(() =>
  import("./pages/BookmarksPage").then((module) => ({ default: module.BookmarksPage }))
);
const CardsPage = lazy(() =>
  import("./pages/CardsPage").then((module) => ({ default: module.CardsPage }))
);
const CharacterChatPage = lazy(() =>
  import("./pages/CharacterChatPage").then((module) => ({ default: module.CharacterChatPage }))
);
const DocumentLibraryPage = lazy(() =>
  import("./pages/DocumentLibraryPage").then((module) => ({ default: module.DocumentLibraryPage }))
);
const ExportHistoryPage = lazy(() =>
  import("./pages/ExportHistoryPage").then((module) => ({ default: module.ExportHistoryPage }))
);
const GlossaryPage = lazy(() =>
  import("./pages/GlossaryPage").then((module) => ({ default: module.GlossaryPage }))
);
const LifeMiningPage = lazy(() =>
  import("./pages/LifeMiningPage").then((module) => ({ default: module.LifeMiningPage }))
);
const ListeningLoopPage = lazy(() =>
  import("./pages/ListeningLoopPage").then((module) => ({ default: module.ListeningLoopPage }))
);
const PdfHubPage = lazy(() =>
  import("./pages/PdfHubPage").then((module) => ({ default: module.PdfHubPage }))
);
const PdfReaderPage = lazy(() =>
  import("./pages/PdfReaderPage").then((module) => ({ default: module.PdfReaderPage }))
);
const PlayZonePage = lazy(() =>
  import("./pages/PlayZonePage").then((module) => ({ default: module.PlayZonePage }))
);
const PlayZoneRuntimePage = lazy(() =>
  import("./pages/PlayZoneRuntimePage").then((module) => ({
    default: module.PlayZoneRuntimePage
  }))
);
const ReviewPage = lazy(() =>
  import("./pages/ReviewPage").then((module) => ({ default: module.ReviewPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);
const VideoReaderPage = lazy(() =>
  import("./pages/VideoReaderPage").then((module) => ({ default: module.VideoReaderPage }))
);
const WebReaderPage = lazy(() =>
  import("./pages/WebReaderPage").then((module) => ({ default: module.WebReaderPage }))
);
const WritingPracticePage = lazy(() =>
  import("./pages/WritingPracticePage").then((module) => ({ default: module.WritingPracticePage }))
);

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

type DailyRewardEffect = {
  id: number;
  amount: number;
  label: string;
};

const defaultDiamondWallet: DiamondWallet = {
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  updatedAt: new Date().toISOString()
};

function isPlayZoneRuntimeWindow() {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("playZoneRuntime");
}

export default function App() {
  if (isPlayZoneRuntimeWindow()) {
    return (
      <Suspense fallback={<div className="app-loading">게임 로딩 중...</div>}>
        <PlayZoneRuntimePage />
      </Suspense>
    );
  }

  return <MainApp />;
}

function MainApp() {
  const api = useMemo(() => getApiClient(), []);
  const [activeTab, setActiveTab] = useState<TabKey>("pdfHub");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);
  const [expandedNavSections, setExpandedNavSections] = useState(readNavSectionExpandedState);
  const [shouldKeepBookMakerMounted, setShouldKeepBookMakerMounted] = useState(false);
  const [isSidebarProfileSwitcherOpen, setIsSidebarProfileSwitcherOpen] = useState(false);
  const [profileManagerOpenRequest, setProfileManagerOpenRequest] = useState(0);
  const [webReaderOpenUrlRequest, setWebReaderOpenUrlRequest] =
    useState<WebReaderOpenUrlRequest | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [lifeLogs, setLifeLogs] = useState<LifeLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(readAppSettings);
  const [profiles, setProfiles] = useState<LearningProfileRecord[]>(() =>
    readProfiles(settings.learningProfile)
  );
  const [activeProfileId, setActiveProfileId] = useState<ProfileId>(() =>
    normalizeActiveProfileId(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY), profiles)
  );
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles]
  );
  const activeSettings = useMemo<AppSettings>(
    () =>
      applyWebLocalGeminiSettings({
        ...settings,
        profileId: activeProfile?.id ?? DEFAULT_PROFILE_ID,
        learningProfile: activeProfile?.learningProfile ?? settings.learningProfile
      }),
    [activeProfile, settings]
  );
  const switchToLanguageProfile = useCallback(
    (languageCode: string) => {
      const normalizedLanguageCode = languageCode.trim().toLowerCase().split("-")[0];
      const matchingProfile = profiles.find(
        (profile) =>
          profile.learningProfile.targetLanguage.code.trim().toLowerCase().split("-")[0] ===
          normalizedLanguageCode
      );
      if (!matchingProfile) {
        return false;
      }
      const normalizedProfileId = normalizeActiveProfileId(matchingProfile.id, profiles);
      setActiveProfileId(normalizedProfileId);
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, normalizedProfileId);
      return normalizedProfileId === matchingProfile.id;
    },
    [profiles]
  );
  const profiledApi = useMemo(
    () =>
      createProfiledApi(api, activeSettings.profileId, activeSettings, {
        switchToLanguageProfile
      }),
    [activeSettings, api, switchToLanguageProfile]
  );
  const [recentDocuments, setRecentDocuments] = useState<RecentDocumentRecord[]>(() =>
    readRecentDocuments(activeProfileId)
  );
  const [readerArtifact, setReaderArtifact] = useState<BilingualReaderArtifact | null>(() =>
    readReaderArtifact(activeProfileId)
  );
  const [profileStats, setProfileStats] = useState<ProfileStats>({});
  const [diamondWallet, setDiamondWallet] = useState<DiamondWallet>(defaultDiamondWallet);
  const [dailyMissionBoard, setDailyMissionBoard] = useState<DailyMissionBoard>(() =>
    buildDailyMissionBoard(getMissionDateKey(), [])
  );
  const [dailyRoutineRun, setDailyRoutineRun] = useState<DailyRoutineRun | null>(null);
  const [dismissedDailyRoutineRunnerId, setDismissedDailyRoutineRunnerId] = useState("");
  const [dailyRewardEffect, setDailyRewardEffect] = useState<DailyRewardEffect | null>(null);
  const [usageSummary, setUsageSummary] = useState<TranslationUsageLedgerSummary>(() =>
    summarizeTranslationUsage(defaultSettings)
  );
  const [writingPracticeFocus, setWritingPracticeFocus] = useState<{
    cardId: string;
    promptIndex: number;
    requestId: number;
  } | null>(null);
  const startupCardSyncCompletedKey = useRef("");
  const startupCardSyncPendingKey = useRef("");

  const rawProvider = useMemo(() => createProvider(activeSettings), [activeSettings]);
  const provider = useMemo(
    () => createUsageTrackedProvider(rawProvider, activeSettings),
    [activeSettings, rawProvider]
  );
  const currentRoutineStep = useMemo(
    () => getCurrentRoutineStep(dailyRoutineRun),
    [dailyRoutineRun]
  );
  const dailyRoutineProgress = useMemo(
    () => getDailyRoutineProgress(dailyRoutineRun),
    [dailyRoutineRun]
  );

  const handleBookMakerKeepAliveChange = useCallback((shouldKeepAlive: boolean) => {
    setShouldKeepBookMakerMounted(shouldKeepAlive);
  }, []);

  useEffect(() => {
    const sectionId = getNavSectionIdForTab(activeTab);
    if (!sectionId) {
      return;
    }
    setExpandedNavSections((previous) => {
      if (previous[sectionId]) {
        return previous;
      }
      const next = { ...previous, [sectionId]: true };
      writeNavSectionExpandedState(next);
      return next;
    });
  }, [activeTab]);

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  function toggleNavSection(sectionId: NavSectionId) {
    setExpandedNavSections((previous) => {
      const next = { ...previous, [sectionId]: !previous[sectionId] };
      writeNavSectionExpandedState(next);
      return next;
    });
  }

  async function loadCards() {
    setCards(await profiledApi.cards.list());
  }

  async function loadLifeLogs() {
    setLifeLogs(await api.lifeLogs.list());
  }

  async function handleCardsChanged() {
    await loadCards();
    await loadEconomy();
  }

  function startWritingPracticeFromCard(card: StudyCard, promptIndex = 0) {
    setWritingPracticeFocus({
      cardId: card.id,
      promptIndex,
      requestId: Date.now()
    });
    setActiveTab("writingPractice");
  }

  function clearWritingPracticeFocus() {
    setWritingPracticeFocus(null);
  }

  async function loadEconomy() {
    const [wallet, missionBoard] = await Promise.all([
      profiledApi.wallet.get(),
      profiledApi.missions.getToday()
    ]);
    setDiamondWallet(wallet);
    setDailyMissionBoard(normalizeDailyMissionBoard(missionBoard));
  }

  function showDailyRewardEffect(amount: number, label: string) {
    if (amount <= 0) {
      return;
    }
    setDailyRewardEffect({
      id: Date.now(),
      amount,
      label
    });
  }

  const dismissDailyRewardEffect = useCallback((effectId: number) => {
    setDailyRewardEffect((current) => (current?.id === effectId ? null : current));
  }, []);

  async function claimMissionReward(missionId: DailyMissionId) {
    const normalizedBoard = normalizeDailyMissionBoard(dailyMissionBoard);
    const rewardMission = normalizedBoard.missions.find((mission) => mission.id === missionId);
    const board = normalizeDailyMissionBoard(await profiledApi.missions.claimReward(missionId));
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    if (rewardMission) {
      showDailyRewardEffect(rewardMission.rewardDiamonds, rewardMission.title);
    }
  }

  async function claimDailyBonus() {
    const rewardBonus = normalizeDailyMissionBoard(dailyMissionBoard).bonus;
    const board = normalizeDailyMissionBoard(await profiledApi.missions.claimDailyBonus());
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    showDailyRewardEffect(rewardBonus.rewardDiamonds, rewardBonus.title);
  }

  function persistDailyRoutineRun(run: DailyRoutineRun | null) {
    setDailyRoutineRun(run);
    if (!run) {
      localStorage.removeItem(getDailyRoutineStorageKey(activeSettings.profileId));
      return;
    }
    localStorage.setItem(getDailyRoutineStorageKey(activeSettings.profileId), JSON.stringify(run));
  }

  function navigateToRoutineStep(step: DailyRoutineStep | null) {
    if (!step) {
      setActiveTab("pdfHub");
      return;
    }
    setActiveTab(step.route);
  }

  function startDailyRoutine() {
    const run = createDailyRoutineRun(getMissionDateKey(), activeSettings.profileId);
    setDismissedDailyRoutineRunnerId("");
    persistDailyRoutineRun(run);
    navigateToRoutineStep(getCurrentRoutineStep(run));
  }

  function resumeDailyRoutine() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      startDailyRoutine();
      return;
    }

    const now = new Date().toISOString();
    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    const nextRun: DailyRoutineRun = {
      ...dailyRoutineRun,
      status: "running",
      updatedAt: now,
      steps: dailyRoutineRun.steps.map((step) =>
        step.id === currentStep?.id
          ? {
              ...step,
              status: "running",
              startedAt: step.startedAt ?? now
            }
          : step
      )
    };
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  async function completeDailyRoutineStep() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }

    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    if (currentStep?.id === "claim-rewards") {
      await claimAvailableRoutineRewards();
    }

    const nextRun = finishDailyRoutineStep(dailyRoutineRun, "completed");
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(nextRun.status === "completed" ? null : getCurrentRoutineStep(nextRun));
  }

  function skipDailyRoutineStep() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }
    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    const nextRun =
      currentStep?.status === "completed"
        ? goToNextDailyRoutineStep(dailyRoutineRun)
        : finishDailyRoutineStep(dailyRoutineRun, "skipped");
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(nextRun.status === "completed" ? null : getCurrentRoutineStep(nextRun));
  }

  function goToPreviousDailyRoutineStepFromRunner() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }
    const nextRun = goToPreviousDailyRoutineStep(dailyRoutineRun);
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  function reopenSkippedDailyRoutine(stepId: DailyRoutineStepId) {
    if (!dailyRoutineRun) {
      return;
    }
    const nextRun = reopenSkippedDailyRoutineStep(dailyRoutineRun, stepId);
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  async function claimAvailableRoutineRewards() {
    let board = normalizeDailyMissionBoard(await profiledApi.missions.getToday());
    let claimedRewardAmount = 0;
    let claimedRewardCount = 0;
    let lastRewardLabel = "";
    for (const mission of board.missions) {
      if (mission.claimable) {
        claimedRewardAmount += mission.rewardDiamonds;
        claimedRewardCount += 1;
        lastRewardLabel = mission.title;
        board = normalizeDailyMissionBoard(await profiledApi.missions.claimReward(mission.id));
      }
    }
    if (board.bonus.claimable) {
      claimedRewardAmount += board.bonus.rewardDiamonds;
      claimedRewardCount += 1;
      lastRewardLabel = board.bonus.title;
      board = normalizeDailyMissionBoard(await profiledApi.missions.claimDailyBonus());
    }
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    if (claimedRewardAmount > 0) {
      showDailyRewardEffect(
        claimedRewardAmount,
        claimedRewardCount > 1 ? `${claimedRewardCount}개 보상` : lastRewardLabel
      );
    }
  }

  async function loadProfileStats(nextProfiles = profiles) {
    const now = Date.now();
    const entries = await Promise.all(
      nextProfiles.map(async (profile) => {
        const profileCards = await api.cards.list(profile.id);
        return [
          profile.id,
          {
            cardCount: profileCards.length,
            dueCount: profileCards.filter((card) => {
              const dueTime = new Date(card.srs.dueAt).getTime();
              return Number.isFinite(dueTime) && dueTime <= now;
            }).length
          }
        ] as const;
      })
    );
    setProfileStats(Object.fromEntries(entries));
  }

  function updateSettings(next: AppSettings) {
    const normalizedNext = normalizeAppSettingsForStorage(next, activeSettings.profileId);
    setSettings(normalizedNext);
    localStorage.setItem("lem:settings", JSON.stringify(normalizedNext));
    updateActiveProfileLanguage(normalizedNext.learningProfile);
  }

  function persistProfiles(nextProfiles: LearningProfileRecord[]) {
    const normalized = nextProfiles.length > 0 ? nextProfiles : profiles;
    setProfiles(normalized);
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(normalized));
  }

  function createProfile(profile: LearningProfileRecord) {
    const normalized = normalizeProfileRecordForSave(profile, profiles);
    const nextProfiles = [...profiles, normalized];
    persistProfiles(nextProfiles);
    selectProfile(normalized.id, nextProfiles);
  }

  function updateProfile(profile: LearningProfileRecord) {
    const normalized = normalizeProfileRecordForSave(profile, profiles, profile.id);
    const nextProfiles = profiles.map((candidate) =>
      candidate.id === normalized.id ? normalized : candidate
    );
    persistProfiles(nextProfiles);
    if (normalized.id === activeProfileId) {
      const nextSettings = {
        ...settings,
        profileId: normalized.id,
        learningProfile: normalized.learningProfile
      };
      setSettings(nextSettings);
      localStorage.setItem("lem:settings", JSON.stringify(nextSettings));
    }
  }

  function deleteProfile(profileId: ProfileId) {
    if (profiles.length <= 1) {
      return;
    }
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      return;
    }
    persistProfiles(nextProfiles);
    if (activeProfileId === profileId) {
      selectProfile(nextProfiles[0].id, nextProfiles);
    }
  }

  function updateRecentDocuments(next: RecentDocumentRecord[]) {
    const normalized = normalizeRecentDocuments(next, activeSettings.profileId);
    setRecentDocuments(normalized);
    localStorage.setItem(getRecentDocumentsKey(activeSettings.profileId), JSON.stringify(normalized));
  }

  function rememberRecentDocument(
    artifact: BilingualReaderArtifact,
    source: RecentDocumentRecord["source"] = "reader"
  ) {
    const now = new Date().toISOString();
    const record = recentDocumentFromArtifact(artifact, source, now, activeSettings.profileId);
    setRecentDocuments((previous) => {
      const next = [
        record,
        ...previous.filter(
          (candidate) =>
            !pathsMatch(candidate.filePath, record.filePath) || candidate.fileType !== record.fileType
        )
      ].slice(0, 50);
      localStorage.setItem(getRecentDocumentsKey(activeSettings.profileId), JSON.stringify(next));
      return next;
    });
  }

  function openReaderArtifact(
    artifact: BilingualReaderArtifact,
    source: RecentDocumentRecord["source"] = "reader"
  ) {
    const profiledArtifact = {
      ...artifact,
      profileId: activeSettings.profileId
    };
    setReaderArtifact(profiledArtifact);
    localStorage.setItem(getLastReaderArtifactKey(activeSettings.profileId), JSON.stringify(profiledArtifact));
    rememberRecentDocument(profiledArtifact, source);
    setActiveTab("pdfReader");
  }

  function updateActiveProfileLanguage(learningProfile: AppSettings["learningProfile"]) {
    setProfiles((previous) => {
      const now = new Date().toISOString();
      const nextProfiles = previous.map((profile) =>
        profile.id === activeSettings.profileId
          ? {
              ...profile,
              learningProfile,
              updatedAt: now
            }
          : profile
      );
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
      return nextProfiles;
    });
  }

  function selectProfile(profileId: ProfileId, availableProfiles = profiles) {
    const normalized = normalizeActiveProfileId(profileId, availableProfiles);
    setActiveProfileId(normalized);
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, normalized);
  }

  function selectProfileFromSidebar(profileId: ProfileId) {
    selectProfile(profileId);
    setIsSidebarProfileSwitcherOpen(false);
  }

  function createProfileFromSidebar() {
    const profile = createProfilePreset(profiles.length + 1, activeSettings);
    createProfile(profile);
    setIsSidebarProfileSwitcherOpen(false);
    navigateToTab("settings");
    setProfileManagerOpenRequest((request) => request + 1);
  }

  function openProfileManagerFromSidebar() {
    setIsSidebarProfileSwitcherOpen(false);
    navigateToTab("settings");
    setProfileManagerOpenRequest((request) => request + 1);
  }

  useEffect(() => {
    void loadCards();
    void loadLifeLogs();
    void loadEconomy();
  }, [profiledApi]);

  useEffect(() => {
    setDailyRoutineRun(readDailyRoutineRun(activeSettings.profileId));
    setDismissedDailyRoutineRunnerId("");
  }, [activeSettings.profileId]);

  useEffect(() => {
    void loadProfileStats();
  }, [api, cards, profiles]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeSettings.profileId);
    void api.profiles?.setActive(activeSettings.profileId);
    setRecentDocuments(readRecentDocuments(activeSettings.profileId));
    setReaderArtifact(readReaderArtifact(activeSettings.profileId));
    setSettings((previous) => {
      const next = {
        ...previous,
        profileId: activeSettings.profileId,
        learningProfile: activeSettings.learningProfile
      };
      localStorage.setItem("lem:settings", JSON.stringify(next));
      return next;
    });
  }, [activeSettings.learningProfile, activeSettings.profileId, api]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (!isSidebarProfileSwitcherOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSidebarProfileSwitcherOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarProfileSwitcherOpen]);

  useEffect(() => {
    if (activeTab === "webReader") {
      return;
    }
    void api.webReader?.detach?.();
  }, [activeTab, api.webReader]);

  useEffect(() => {
    void api.app?.setBridgeSettings({
      browserCaptureSiteSettings: activeSettings.browserCaptureSiteSettings,
      lifeMiningCaptureSettings: activeSettings.lifeMiningCaptureSettings,
      captureShortcut: activeSettings.captureShortcut,
      browserSelectionCardMode: activeSettings.browserSelectionCardMode,
      providerName: activeSettings.providerName,
      ollamaBaseUrl: activeSettings.ollamaBaseUrl,
      ollamaModel: activeSettings.ollamaModel,
      geminiApiKey: activeSettings.geminiApiKey,
      geminiModel: activeSettings.geminiModel,
      geminiPlan: activeSettings.geminiPlan,
      learningProfile: activeSettings.learningProfile,
      dailyAppTokenLimit: activeSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: activeSettings.monthlySpendLimitKrw,
      cardSyncFolderPath: activeSettings.cardSyncFolderPath,
      cardSyncOnQuit: activeSettings.cardSyncOnQuit
    });
  }, [
    activeSettings.browserCaptureSiteSettings,
    activeSettings.lifeMiningCaptureSettings,
    activeSettings.captureShortcut,
    activeSettings.browserSelectionCardMode,
    activeSettings.geminiApiKey,
    activeSettings.geminiModel,
    activeSettings.geminiPlan,
    activeSettings.learningProfile,
    activeSettings.dailyAppTokenLimit,
    activeSettings.monthlySpendLimitKrw,
    activeSettings.cardSyncFolderPath,
    activeSettings.cardSyncOnQuit,
    activeSettings.ollamaBaseUrl,
    activeSettings.ollamaModel,
    activeSettings.providerName,
    api
  ]);

  useEffect(() => {
    const folderPath = activeSettings.cardSyncFolderPath.trim();
    if (!activeSettings.cardSyncOnStartup || !folderPath) {
      return undefined;
    }

    const syncKey = `${activeSettings.profileId}\0${folderPath}`;
    if (
      startupCardSyncCompletedKey.current === syncKey ||
      startupCardSyncPendingKey.current === syncKey
    ) {
      return undefined;
    }

    startupCardSyncPendingKey.current = syncKey;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await profiledApi.cardSync.sync({ folderPath });
          await handleCardsChanged();
          startupCardSyncCompletedKey.current = syncKey;
        } catch (caught) {
          console.warn("Startup card sync failed", caught);
        } finally {
          if (startupCardSyncPendingKey.current === syncKey) {
            startupCardSyncPendingKey.current = "";
          }
        }
      })();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      if (startupCardSyncPendingKey.current === syncKey) {
        startupCardSyncPendingKey.current = "";
      }
    };
  }, [
    activeSettings.cardSyncFolderPath,
    activeSettings.cardSyncOnStartup,
    activeSettings.profileId,
    profiledApi
  ]);

  useEffect(() => {
    const unsubscribe = api.lifeLogs.onChanged?.(() => {
      void loadLifeLogs();
    });
    return () => {
      unsubscribe?.();
    };
  }, [api, profiledApi]);

  useEffect(() => {
    const unsubscribe = api.cards.onChanged?.(() => {
      void handleCardsChanged();
    });
    return () => {
      unsubscribe?.();
    };
  }, [api, profiledApi]);

  useEffect(() => {
    function refreshUsageSummary() {
      setUsageSummary(summarizeTranslationUsage(activeSettings));
    }

    refreshUsageSummary();
    window.addEventListener(usageUpdatedEventName, refreshUsageSummary);
    return () => {
      window.removeEventListener(usageUpdatedEventName, refreshUsageSummary);
    };
  }, [activeSettings]);

  useEffect(() => {
    return api.app?.onUsageRecorded?.((event) => {
      recordTranslationUsageEvent(event);
    });
  }, [api]);

  const ActiveIcon = routeMeta[activeTab].icon;
  const SidebarToggleIcon = isSidebarCollapsed ? ChevronsRight : ChevronsLeft;
  const isSidebarHidden = Boolean(activeSettings.labsHideSidebarNavigation);
  const isGlossaryNavigationHidden = Boolean(activeSettings.labsHideGlossaryNavigation);
  const shellClassName = [
    "app-shell",
    isSidebarCollapsed ? "sidebar-collapsed" : "",
    isSidebarHidden ? "sidebar-hidden" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const navigateToTab = (tab: TabKey) => {
    setActiveTab(tab);
  };
  const openWebReaderUrl = (url: string, label?: string) => {
    setWebReaderOpenUrlRequest({
      requestId: Date.now(),
      url,
      label
    });
    setActiveTab("webReader");
  };
  const isNavItemVisible = (item: NavItem) =>
    !(isGlossaryNavigationHidden && item.key === "glossary");
  const renderNavButton = (groupTitle: string, item: NavItem) => {
    const meta = routeMeta[item.key];
    const Icon = item.icon ?? meta.icon;
    return (
      <button
        key={`${groupTitle}-${item.key}-${item.label ?? meta.label}`}
        className={activeTab === item.key ? "active" : ""}
        data-qa={`nav-${item.key}`}
        title={item.label ?? meta.label}
        type="button"
        onClick={() => navigateToTab(item.key)}
      >
        <Icon size={18} />
        <span className="nav-item-label">{item.label ?? meta.label}</span>
      </button>
    );
  };
  const renderNavSection = (section: NavSection) => {
    const SectionIcon = section.icon;
    const isExpanded = expandedNavSections[section.id];
    const visibleGroups = section.groups
      ?.map((group) => ({
        ...group,
        items: group.items.filter(isNavItemVisible)
      }))
      .filter((group) => group.items.length > 0);
    const visibleItems = section.items?.filter(isNavItemVisible);
    const visibleSection: NavSection = {
      ...section,
      groups: visibleGroups,
      items: visibleItems
    };
    const isActive = navSectionHasTab(visibleSection, activeTab);
    if (section.directKey) {
      const directKey = section.directKey;
      return (
        <section
          className={`nav-section nav-section-${section.id} nav-section-direct${
            isActive ? " active" : ""
          }`}
          key={section.id}
        >
          <button
            className={isActive ? "nav-section-toggle active" : "nav-section-toggle"}
            data-qa={`nav-${directKey}`}
            title={section.title}
            type="button"
            onClick={() => navigateToTab(directKey)}
          >
            <SectionIcon size={18} />
            <span className="nav-section-title">{section.title}</span>
          </button>
        </section>
      );
    }

    return (
      <section
        className={
          isExpanded
            ? `nav-section nav-section-${section.id} expanded`
            : `nav-section nav-section-${section.id}`
        }
        key={section.id}
      >
        <button
          aria-expanded={isExpanded}
          className={isActive ? "nav-section-toggle active" : "nav-section-toggle"}
          data-qa={`nav-section-${section.id}`}
          title={section.title}
          type="button"
          onClick={() => toggleNavSection(section.id)}
        >
          <SectionIcon size={18} />
          <span className="nav-section-title">{section.title}</span>
          <ChevronDown className="nav-section-chevron" size={16} />
        </button>
        <div className="nav-section-body" hidden={!isExpanded}>
          {visibleGroups?.map((group) => (
            <div className="nav-subgroup" key={`${section.id}-${group.title}`}>
              <span className="nav-subgroup-title">{group.title}</span>
              {group.items.map((item) => renderNavButton(group.title, item))}
            </div>
          ))}
          {visibleItems?.map((item) => renderNavButton(section.title, item))}
        </div>
      </section>
    );
  };

  return (
    <div className={shellClassName}>
      {isSidebarHidden ? (
        <button
          aria-label="네비게이션 다시 보이기"
          className="icon-button sidebar-restore-button"
          title="네비게이션 다시 보이기"
          type="button"
          onClick={() => updateSettings({ ...activeSettings, labsHideSidebarNavigation: false })}
        >
          <ChevronsRight size={16} />
          <span>네비</span>
        </button>
      ) : null}
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <div className="brand-block">
            <div className="brand-mark">LM</div>
            <div className="brand-copy">
              <h1>Language Miner</h1>
              <p>{provider.name}</p>
            </div>
          </div>
          <button
            aria-label={isSidebarCollapsed ? "네비게이션 펼치기" : "네비게이션 접기"}
            className="icon-button sidebar-collapse-button"
            title={isSidebarCollapsed ? "네비게이션 펼치기" : "네비게이션 접기"}
            type="button"
            onClick={toggleSidebarCollapsed}
          >
            <SidebarToggleIcon size={16} />
          </button>
        </div>
        <div className="profile-switcher">
          <label>프로필</label>
          <button
            aria-expanded={isSidebarProfileSwitcherOpen}
            aria-haspopup="dialog"
            className="profile-summary-button"
            type="button"
            onClick={() => setIsSidebarProfileSwitcherOpen(true)}
          >
            <span className="profile-avatar">{getProfileInitials(activeProfile)}</span>
            <span>
              <strong>{activeProfile?.name ?? "프로필"}</strong>
              <small>
                {activeSettings.learningProfile.targetLanguage.nameKo} 학습 · {activeSettings.learningProfile.nativeLanguage.nameKo} 기준
              </small>
            </span>
          </button>
        </div>
        <nav className="tab-nav" aria-label="Primary">
          <div className="nav-home">{renderNavButton("home", homeNavItem)}</div>
          {navSections
            .filter((section) => section.id !== "manage")
            .map((section) => renderNavSection(section))}
          {navSections
            .filter((section) => section.id === "manage")
            .map((section) => renderNavSection(section))}
        </nav>
        <button
          className="sidebar-usage-card"
          type="button"
          onClick={() => navigateToTab("settings")}
        >
          <div className="sidebar-estimate-box sidebar-combined-estimate">
            <div className="sidebar-combined-head">
              <span>오늘 추정</span>
            </div>
            <div className="sidebar-usage-breakdown">
              <div className="sidebar-usage-row api">
                <span>API</span>
                <strong>{formatUsageCost(usageSummary.todayCostKrw)}</strong>
                <small>
                  {formatCompactNumber(usageSummary.todayTokens)} tokens ·{" "}
                  {usageSummary.todayRequestCount}회
                </small>
              </div>
              <div className="sidebar-usage-row electricity">
                <span>전기</span>
                <strong>{formatElectricityCost(usageSummary.todayLocalElectricityKrw)}</strong>
                <small>로컬 {formatLocalRuntime(usageSummary.todayLocalRuntimeMinutes)}</small>
              </div>
            </div>
            <div className="sidebar-month-lines">
              <span>
                API 월 {formatUsageCost(usageSummary.monthCostKrw)} /{" "}
                {formatUsageLimit(usageSummary.monthlyLimitKrw)}
              </span>
              <span>전기 월 {formatElectricityCost(usageSummary.monthLocalElectricityKrw)}</span>
            </div>
            <span className={getUsageLimitChipClassName(usageSummary.monthlySpendPercent)}>
              한도 {Math.round(usageSummary.monthlySpendPercent)}%
            </span>
          </div>
        </button>
      </aside>

      <main className="app-main">
        {activeTab !== "webReader" ? (
          <header className="topbar">
            <div className="topbar-title">
              <ActiveIcon size={20} />
              <span>{routeMeta[activeTab].label}</span>
            </div>
            <div className="topbar-stats">
              <span className="diamond-balance">
                <Gem size={15} />
                {formatInteger(diamondWallet.balance)} 다이아
              </span>
              <span>카드 {cards.length}장</span>
              <span>로그 {lifeLogs.length}개</span>
            </div>
          </header>
        ) : null}

        {dailyRoutineRun &&
        dailyRoutineRun.status !== "completed" &&
        dismissedDailyRoutineRunnerId !== dailyRoutineRun.id ? (
          <DailyRoutineRunner
            currentStep={currentRoutineStep}
            progress={dailyRoutineProgress}
            run={dailyRoutineRun}
            onCompleteStep={() => void completeDailyRoutineStep()}
            onDismiss={() => setDismissedDailyRoutineRunnerId(dailyRoutineRun.id)}
            onOpenStep={() => navigateToRoutineStep(currentRoutineStep)}
            onPreviousStep={goToPreviousDailyRoutineStepFromRunner}
            onReopenSkippedStep={reopenSkippedDailyRoutine}
            onSkipStep={skipDailyRoutineStep}
          />
        ) : null}

        <Suspense
          fallback={
            <div className="route-loading" role="status">
              화면 불러오는 중...
            </div>
          }
        >
        {activeTab === "pdfHub" ? (
          <PdfHubPage
            cards={cards}
            lifeLogs={lifeLogs}
            missionBoard={dailyMissionBoard}
            profileId={activeSettings.profileId}
            routineCurrentStep={currentRoutineStep}
            routineProgress={dailyRoutineProgress}
            routineRun={dailyRoutineRun}
            wallet={diamondWallet}
            onClaimDailyBonus={claimDailyBonus}
            onClaimMission={claimMissionReward}
            onNavigate={setActiveTab}
            onResumeRoutine={resumeDailyRoutine}
            onStartRoutine={startDailyRoutine}
          />
        ) : null}
        {activeTab === "pdfReader" ? (
          <PdfReaderPage
            api={profiledApi}
            artifact={readerArtifact}
            provider={provider}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onSettingsChange={updateSettings}
          />
        ) : null}
        {activeTab === "webReader" ? (
          <WebReaderPage
            api={profiledApi}
            openUrlRequest={webReaderOpenUrlRequest}
            provider={provider}
            sidebarOverlayOpen={false}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onLifeLogsChanged={loadLifeLogs}
            onSettingsChange={updateSettings}
            onSwitchToLanguageProfile={switchToLanguageProfile}
          />
        ) : null}
        {activeTab === "documentLibrary" ? (
          <DocumentLibraryPage
            api={profiledApi}
            recentDocuments={recentDocuments}
            settings={activeSettings}
            onNavigate={setActiveTab}
            onOpenReaderArtifact={openReaderArtifact}
            onRecentDocumentsChange={updateRecentDocuments}
          />
        ) : null}
        {activeTab === "bookmarks" ? <BookmarksPage onNavigate={setActiveTab} /> : null}
        {activeTab === "bookMaker" || shouldKeepBookMakerMounted ? (
          <div
            aria-hidden={activeTab !== "bookMaker"}
            className={activeTab === "bookMaker" ? "route-keepalive active" : "route-keepalive"}
          >
            <BilingualBookMakerPage
              api={profiledApi}
              settings={activeSettings}
              onKeepAliveChange={handleBookMakerKeepAliveChange}
              onOpenReaderArtifact={openReaderArtifact}
              onSettingsChange={updateSettings}
            />
          </div>
        ) : null}
        {activeTab === "exportHistory" ? (
          <ExportHistoryPage
            api={profiledApi}
            onNavigate={setActiveTab}
            onOpenReaderArtifact={openReaderArtifact}
          />
        ) : null}
        {activeTab === "glossary" ? (
          <GlossaryPage cards={cards} onNavigate={(route) => setActiveTab(route)} />
        ) : null}
        {activeTab === "cards" ? (
          <CardsPage
            api={profiledApi}
            cards={cards}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onNavigate={(route) => setActiveTab(route)}
            onSettingsChange={updateSettings}
            onStartWritingPractice={startWritingPracticeFromCard}
          />
        ) : null}
        {activeTab === "playZone" ? <PlayZonePage walletBalance={diamondWallet.balance} /> : null}
        {activeTab === "characterChat" ? (
          <CharacterChatPage cards={cards} provider={provider} />
        ) : null}
        {activeTab === "listeningLoop" ? (
          <ListeningLoopPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            onMissionProgressChanged={loadEconomy}
            onOpenWebReaderUrl={openWebReaderUrl}
            onSettingsChange={updateSettings}
            profileId={activeSettings.profileId}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "videoReader" ? (
          <VideoReaderPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            profileId={activeSettings.profileId}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "writingPractice" ? (
          <WritingPracticePage
            api={profiledApi}
            cards={cards}
            focusCardId={writingPracticeFocus?.cardId}
            focusPromptIndex={writingPracticeFocus?.promptIndex}
            focusRequestId={writingPracticeFocus?.requestId}
            onFocusConsumed={clearWritingPracticeFocus}
            onMissionProgressChanged={loadEconomy}
            onNavigate={(route) => setActiveTab(route)}
          />
        ) : null}
        {activeTab === "review" ? (
          <ReviewPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            onMissionProgressChanged={loadEconomy}
            onNavigate={(route) => setActiveTab(route)}
            onStartWritingPractice={startWritingPracticeFromCard}
            profileId={activeSettings.profileId}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "life" ? (
          <LifeMiningPage
            api={profiledApi}
            settings={activeSettings}
            lifeLogs={lifeLogs}
            provider={provider}
            onCardsChanged={handleCardsChanged}
            onLifeLogsChanged={loadLifeLogs}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsPage
            api={profiledApi}
            activeProfileId={activeSettings.profileId}
            profileManagerOpenRequest={profileManagerOpenRequest}
            profileStats={profileStats}
            profiles={profiles}
            provider={provider}
            settings={activeSettings}
            onCreateProfile={createProfile}
            onDeleteProfile={deleteProfile}
            onSelectProfile={selectProfile}
            onSettingsChange={updateSettings}
            onUpdateProfile={updateProfile}
          />
        ) : null}
        </Suspense>
        <DailyRewardEffectToast reward={dailyRewardEffect} onDone={dismissDailyRewardEffect} />
      </main>
      {isSidebarProfileSwitcherOpen ? (
        <SettingsProfileSwitcher
          activeProfileId={activeSettings.profileId}
          profileStats={profileStats}
          profiles={profiles}
          onClose={() => setIsSidebarProfileSwitcherOpen(false)}
          onCreateProfile={createProfileFromSidebar}
          onOpenManager={openProfileManagerFromSidebar}
          onSelectProfile={selectProfileFromSidebar}
        />
      ) : null}
    </div>
  );
}

type DailyRewardEffectToastProps = {
  reward: DailyRewardEffect | null;
  onDone: (effectId: number) => void;
};

function DailyRewardEffectToast({ reward, onDone }: DailyRewardEffectToastProps) {
  useEffect(() => {
    if (!reward) {
      return;
    }
    const timeoutId = window.setTimeout(() => onDone(reward.id), 1900);
    return () => window.clearTimeout(timeoutId);
  }, [onDone, reward]);

  if (!reward) {
    return null;
  }

  return (
    <div className="daily-reward-effect" role="status" aria-live="polite" key={reward.id}>
      <span className="daily-reward-orbit" aria-hidden="true" />
      <span className="daily-reward-gem" aria-hidden="true">
        <Gem size={22} />
      </span>
      <span className="daily-reward-copy">
        <strong>+{formatInteger(reward.amount)} 다이아</strong>
        <small>{reward.label} 보상 수령</small>
      </span>
      <Sparkles className="daily-reward-spark spark-a" size={16} aria-hidden="true" />
      <Sparkles className="daily-reward-spark spark-b" size={13} aria-hidden="true" />
      <Sparkles className="daily-reward-spark spark-c" size={11} aria-hidden="true" />
    </div>
  );
}

type DailyRoutineRunnerProps = {
  run: DailyRoutineRun;
  currentStep: DailyRoutineStep | null;
  progress: ReturnType<typeof getDailyRoutineProgress>;
  onCompleteStep: () => void;
  onDismiss: () => void;
  onOpenStep: () => void;
  onPreviousStep: () => void;
  onReopenSkippedStep: (stepId: DailyRoutineStepId) => void;
  onSkipStep: () => void;
};

function DailyRoutineRunner({
  run,
  currentStep,
  progress,
  onCompleteStep,
  onDismiss,
  onOpenStep,
  onPreviousStep,
  onReopenSkippedStep,
  onSkipStep
}: DailyRoutineRunnerProps) {
  if (!currentStep) {
    return null;
  }

  const skippedSteps = run.steps.filter((step) => step.status === "skipped");
  const firstSkippedStep = skippedSteps[0] ?? null;
  const skippedSummaryLabel =
    skippedSteps.length === 1
      ? firstSkippedStep?.title ?? ""
      : `${firstSkippedStep?.title ?? "건너뛴 단계"} 외 ${skippedSteps.length - 1}개`;
  const currentStepIsSkipped = currentStep.status === "skipped";
  const currentStepIsCompleted = currentStep.status === "completed";
  const currentStepIndex = run.steps.findIndex((step) => step.id === currentStep.id);
  const hasPreviousStep = currentStepIndex > 0;
  const openCurrentStep = currentStepIsSkipped
    ? () => onReopenSkippedStep(currentStep.id)
    : onOpenStep;

  return (
    <section className="daily-routine-runner">
      <div className="daily-routine-runner-main">
        <span className="daily-routine-runner-icon">
          <ListChecks size={18} />
        </span>
        <div className="daily-routine-runner-copy">
          <span className="daily-routine-runner-kicker">
            오늘 루틴 · 완료 {progress.completedCount}/{progress.totalCount}
            {progress.skippedCount > 0 ? ` · 건너뜀 ${progress.skippedCount}` : ""}
          </span>
          <strong>{currentStep.title}</strong>
          <small>{currentStep.description}</small>
          {firstSkippedStep ? (
            <div className="daily-routine-skipped-summary" aria-label="건너뛴 루틴 단계 요약">
              <button
                className="daily-routine-skipped-chip"
                type="button"
                onClick={() => onReopenSkippedStep(firstSkippedStep.id)}
                title={
                  skippedSteps.length === 1
                    ? `${firstSkippedStep.title} 단계로 돌아가기`
                    : `${firstSkippedStep.title} 단계로 돌아가기. 다른 건너뛴 단계는 빨간 점으로 선택하세요.`
                }
              >
                <span>건너뜀 {skippedSteps.length}</span>
                <strong>{skippedSummaryLabel}</strong>
                <em>돌아가기</em>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="daily-routine-runner-status"
        aria-label={`오늘 루틴 완료 ${progress.completedCount}개, 건너뜀 ${progress.skippedCount}개, 전체 ${progress.totalCount}개`}
      >
        <div className="daily-routine-runner-progress" aria-hidden="true">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="daily-routine-step-dots" aria-label="오늘 루틴 단계 상태">
          {run.steps.map((step, index) => {
            const isCurrentStep = step.id === currentStep.id;
            const isDotActionable = step.status === "skipped" || isCurrentStep;
            return (
              <button
                aria-label={getDailyRoutineStepDotLabel(step, index, isCurrentStep)}
                className={getDailyRoutineStepDotClassName(step, isCurrentStep)}
                disabled={!isDotActionable}
                key={step.id}
                title={getDailyRoutineStepDotLabel(step, index, isCurrentStep)}
                type="button"
                onClick={() => {
                  if (step.status === "skipped") {
                    onReopenSkippedStep(step.id);
                    return;
                  }
                  if (isCurrentStep) {
                    onOpenStep();
                  }
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="daily-routine-runner-actions">
        <button className="button secondary small" type="button" onClick={openCurrentStep}>
          {currentStepIsSkipped ? "건너뛴 단계 돌아가기" : currentStep.actionLabel}
        </button>
        <button
          className="button secondary small"
          type="button"
          disabled={!hasPreviousStep}
          onClick={onPreviousStep}
        >
          <ChevronsLeft size={15} />
          이전 단계 가기
        </button>
        <button
          className="button secondary small"
          type="button"
          disabled={currentStep.status === "skipped"}
          onClick={onSkipStep}
        >
          <SkipForward size={15} />
          다음 단계 가기
        </button>
        <button
          className="button primary small"
          type="button"
          disabled={currentStepIsSkipped || currentStepIsCompleted}
          onClick={onCompleteStep}
        >
          단계 완료
        </button>
      </div>
      <button
        aria-label="상단 오늘 루틴 바 닫기"
        className="icon-button daily-routine-runner-dismiss"
        title="상단 오늘 루틴 바 닫기"
        type="button"
        onClick={onDismiss}
      >
        <X size={15} />
      </button>
    </section>
  );
}

function getDailyRoutineStepDotClassName(step: DailyRoutineStep, isCurrentStep: boolean) {
  return [
    "daily-routine-step-dot",
    `status-${step.status}`,
    isCurrentStep ? "current" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function getDailyRoutineStepDotLabel(
  step: DailyRoutineStep,
  index: number,
  isCurrentStep: boolean
) {
  const stepNumber = index + 1;
  if (step.status === "completed") {
    return `${stepNumber}. ${step.title} 완료`;
  }
  if (step.status === "skipped") {
    return `${stepNumber}. ${step.title} 건너뜀 · 클릭해서 돌아가기`;
  }
  if (isCurrentStep || step.status === "running") {
    return `${stepNumber}. ${step.title} 현재 단계 열기`;
  }
  return `${stepNumber}. ${step.title} 대기`;
}
