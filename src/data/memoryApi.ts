import type { LocalEnglishMinerApi } from "./api";
import { buildBilingualDocumentHtml, getBilingualDocumentStats } from "../shared/bilingualExport";
import { isInputReadingCard, isLifeMiningOutputCard, normalizeCardDeck } from "../shared/cardDeck";
import {
  buildDailyMissionBoard,
  createEmptyMissionProgress,
  dailyBonusDefinition,
  findMissionDefinitionsByEventType,
  findMissionDefinition,
  getMissionDateKey
} from "../shared/dailyMissions";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";
import { markLifeLogMetadataProcessedForProfile } from "../shared/lifeLogProgress";
import { parseJsonWithLooseEscapes } from "../shared/jsonParsing";
import { randomId } from "../shared/ids";
import { scheduleCardReview } from "../shared/srs";
import { buildPdfTranslationContext } from "../shared/pdfTranslationContext";
import { parsePdfSegmentTranslationsLenient } from "../shared/pdfSegmentTranslations";
import {
  createTranslationCacheEntry,
  entryToLookupInput,
  getTranslationCacheKey,
  normalizeSourceLang,
  normalizeTargetLang,
  segmentCacheInput,
  translationResultFromEntry
} from "./memoryTranslationCache";
import {
  testGeminiConnection,
  translatePdfSegmentsWithGemini,
  translateTextWithGemini
} from "../shared/geminiTranslation";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage
} from "../shared/translationUsage";
import type {
  BilingualExportHistoryRecord,
  DailyMissionProgress,
  DailyMissionId,
  DiamondTransaction,
  DiamondWallet,
  LearningMissionEvent,
  LifeLog,
  ListeningTranscript,
  ListeningVideoCandidate,
  OllamaModelInput,
  OllamaModelStatusResult,
  PdfSegmentTranslation,
  ProfileLanguage,
  ProfileId,
  PullOllamaModelResult,
  ReviewRating,
  StudyCard,
  TranslatePdfSegmentsInput,
  TranslatePdfSegmentsResult,
  TranslateTextInput,
  TranslateTextResult,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult,
  TranslationUsageEvent
} from "../shared/types";
import {
  buildPdfSegmentTranslationRepairUserPrompt,
  buildPdfSegmentTranslationSystemPrompt,
  buildPdfSegmentTranslationUserPrompt,
  buildPdfTranslationRevisionPrompt,
  buildPdfTranslationSystemPrompt
} from "../shared/translationPrompts";
import {
  assessPdfTranslationQuality,
  hasCriticalPdfTranslationQualityIssues,
  shouldReviewPdfProperNouns
} from "../shared/translationQuality";

const CARDS_KEY = "lem:fallback:cards";
const LIFE_LOGS_KEY = "lem:fallback:lifeLogs";
const LISTENING_VIDEO_CANDIDATES_KEY = "lem:fallback:listeningVideoCandidates";
const LISTENING_TRANSCRIPTS_KEY = "lem:fallback:listeningTranscripts";
const TRANSLATION_CACHE_KEY = "lem:fallback:translationCache";
const EXPORT_RECORDS_KEY = "lem:fallback:exportRecords";
const DIAMOND_WALLET_KEY = "lem:fallback:diamondWallet";
const DIAMOND_TRANSACTIONS_KEY = "lem:fallback:diamondTransactions";
const MISSION_EVENTS_KEY = "lem:fallback:missionEvents";
const MISSION_PROGRESS_KEY = "lem:fallback:dailyMissionProgress";
const sessionFallbackStore = new Map<string, string>();
const LOCAL_MT_DESKTOP_ONLY_MESSAGE =
  "Local MT는 Electron 데스크톱 앱에서만 지원됩니다. 로컬 웹에서는 Ollama LLM, Gemini, Google 번역을 선택해 주세요.";
const DRIVE_SYNC_DESKTOP_ONLY_MESSAGE =
  "동기화 폴더 선택은 Electron 데스크톱 앱에서만 지원됩니다.";

export function createMemoryApi(): LocalEnglishMinerApi {
  return {
    app: {
      async getRuntimeStatus() {
        return {
          isElectron: false,
          trayAvailable: false,
          launchAtLogin: false,
          canConfigureLaunchAtLogin: false,
          message: "Background tray and startup settings are available in the Electron app."
        };
      },
      async setLaunchAtLogin() {
        return {
          isElectron: false,
          trayAvailable: false,
          launchAtLogin: false,
          canConfigureLaunchAtLogin: false,
          message: "Background tray and startup settings are available in the Electron app."
        };
      },
      async setPlayerFullscreen() {
        return true;
      },
      async setBridgeSettings() {
        return false;
      }
    },
    profiles: {
      async setActive() {
        return true;
      }
    },
    cards: {
      async list(profileId = DEFAULT_PROFILE_ID) {
        return readJson<StudyCard[]>(CARDS_KEY, [])
          .map((card) => normalizeCardDeck(card))
          .filter((card) => cardBelongsToProfile(card, profileId));
      },
      async listDue(nowIso = new Date().toISOString(), profileId = DEFAULT_PROFILE_ID) {
        const cards = readJson<StudyCard[]>(CARDS_KEY, []).map((card) =>
          normalizeCardDeck(card)
        );
        return cards
          .filter(
            (card) =>
              cardBelongsToProfile(card, profileId) &&
              new Date(card.srs.dueAt).getTime() <= new Date(nowIso).getTime()
          )
          .sort((a, b) => a.srs.dueAt.localeCompare(b.srs.dueAt));
      },
      async save(card, profileId = DEFAULT_PROFILE_ID) {
        const now = new Date().toISOString();
        const cards = readJson<StudyCard[]>(CARDS_KEY, []);
        const existing = cards.find((candidate) => candidate.id === card.id);
        const saved: StudyCard = normalizeCardDeck({
          ...card,
          profileId: card.profileId ?? profileId,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        });
        const next = [saved, ...cards.filter((candidate) => candidate.id !== saved.id)];
        writeJson(CARDS_KEY, next);
        if (!existing) {
          const cardCreatedEventType = isInputReadingCard(saved)
            ? "card_created"
            : isLifeMiningOutputCard(saved)
              ? "life_mining_card_created"
              : null;
          if (cardCreatedEventType) {
            recordMissionEventToStorage({
              type: cardCreatedEventType,
              profileId: saved.profileId ?? profileId,
              amount: 1,
              metadata: {
                cardId: saved.id,
                deckType: saved.deckType
              }
            });
          }
        }
        return saved;
      },
      async delete(id) {
        const cards = readJson<StudyCard[]>(CARDS_KEY, []);
        writeJson(
          CARDS_KEY,
          cards.filter((card) => card.id !== id)
        );
        return true;
      },
      async review(cardId, rating) {
        const cards = readJson<StudyCard[]>(CARDS_KEY, []);
        const card = cards.find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error(`Card not found: ${cardId}`);
        }
        const updated = applyReview(normalizeCardDeck(card), rating);
        writeJson(
          CARDS_KEY,
          cards.map((candidate) => (candidate.id === cardId ? updated : candidate))
        );
        recordMissionEventToStorage({
          type: "review_completed",
          profileId: updated.profileId,
          amount: 1,
          metadata: {
            cardId,
            rating
          }
        });
        return updated;
      }
    },
    wallet: {
      async get() {
        return getStoredDiamondWallet();
      },
      async listTransactions() {
        return readJson<DiamondTransaction[]>(DIAMOND_TRANSACTIONS_KEY, []).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        );
      }
    },
    missions: {
      async getToday() {
        return getTodayMissionBoardFromStorage();
      },
      async recordEvent(event) {
        return recordMissionEventToStorage(event);
      },
      async claimReward(missionId, profileId = DEFAULT_PROFILE_ID) {
        return claimMissionRewardFromStorage(missionId, profileId);
      },
      async claimDailyBonus(profileId = DEFAULT_PROFILE_ID) {
        return claimDailyBonusFromStorage(profileId);
      }
    },
    cardSync: {
      async status(settings) {
        return {
          configured: Boolean(settings.folderPath.trim()),
          connected: false,
          folderPath: settings.folderPath,
          message: DRIVE_SYNC_DESKTOP_ONLY_MESSAGE
        };
      },
      async connect() {
        return {
          configured: false,
          connected: false,
          message: DRIVE_SYNC_DESKTOP_ONLY_MESSAGE
        };
      },
      async disconnect() {
        return {
          configured: false,
          connected: false,
          message: DRIVE_SYNC_DESKTOP_ONLY_MESSAGE
        };
      },
      async upload() {
        throw new Error(DRIVE_SYNC_DESKTOP_ONLY_MESSAGE);
      },
      async download() {
        throw new Error(DRIVE_SYNC_DESKTOP_ONLY_MESSAGE);
      },
      async sync() {
        throw new Error(DRIVE_SYNC_DESKTOP_ONLY_MESSAGE);
      }
    },
    lifeLogs: {
      async list() {
        return readJson<LifeLog[]>(LIFE_LOGS_KEY, []);
      },
      async save(input) {
        const logs = readJson<LifeLog[]>(LIFE_LOGS_KEY, []);
        const lifeLog: LifeLog = {
          ...input,
          id: randomId(),
          processed: false,
          createdAt: new Date().toISOString()
        };
        writeJson(LIFE_LOGS_KEY, [lifeLog, ...logs]);
        return lifeLog;
      },
      async markProcessed(id, profileId = DEFAULT_PROFILE_ID) {
        const logs = readJson<LifeLog[]>(LIFE_LOGS_KEY, []);
        writeJson(
          LIFE_LOGS_KEY,
          logs.map((log) =>
            log.id === id
              ? {
                  ...log,
                  metadata: markLifeLogMetadataProcessedForProfile(log.metadata, profileId),
                  processed: true
                }
              : log
          )
        );
        return true;
      },
      async delete(id) {
        const logs = readJson<LifeLog[]>(LIFE_LOGS_KEY, []);
        writeJson(
          LIFE_LOGS_KEY,
          logs.filter((log) => log.id !== id)
        );
        return true;
      }
    },
    listening: {
      async listVideoCandidates() {
        return readJson<ListeningVideoCandidate[]>(LISTENING_VIDEO_CANDIDATES_KEY, []);
      },
      async saveVideoCandidate(input) {
        const now = new Date().toISOString();
        const candidates = readJson<ListeningVideoCandidate[]>(
          LISTENING_VIDEO_CANDIDATES_KEY,
          []
        );
        const id = `${input.sourceType}:${input.videoId}`;
        const existing = candidates.find((candidate) => candidate.id === id);
        const saved: ListeningVideoCandidate = {
          ...input,
          id,
          firstSeenAt: existing?.firstSeenAt ?? input.collectedAt ?? now,
          lastSeenAt: input.collectedAt ?? now,
          watchCount: (existing?.watchCount ?? 0) + 1
        };
        writeJson(
          LISTENING_VIDEO_CANDIDATES_KEY,
          [saved, ...candidates.filter((candidate) => candidate.id !== id)].slice(0, 200)
        );
        return saved;
      },
      async markVideoCandidatesLearned(candidateIds) {
        const ids = new Set(candidateIds);
        const now = new Date().toISOString();
        const candidates = readJson<ListeningVideoCandidate[]>(
          LISTENING_VIDEO_CANDIDATES_KEY,
          []
        );
        const learnedVideoIds = new Set(
          candidates
            .filter((candidate) => ids.has(candidate.id))
            .map((candidate) => candidate.videoId.trim())
            .filter(Boolean)
        );
        const nextCandidates = candidates.map((candidate) =>
          ids.has(candidate.id) || learnedVideoIds.has(candidate.videoId.trim())
            ? {
                ...candidate,
                metadata: {
                  ...candidate.metadata,
                  learned: true,
                  learnedAt: now
                }
              }
            : candidate
        );
        writeJson(LISTENING_VIDEO_CANDIDATES_KEY, nextCandidates);
        return nextCandidates;
      },
      async fetchRssCandidates(languageCode?: string) {
        const normalizedLanguageCode = languageCode?.trim().toLowerCase().split("-")[0];
        const candidates = readJson<ListeningVideoCandidate[]>(LISTENING_VIDEO_CANDIDATES_KEY, []);
        if (!normalizedLanguageCode) {
          return candidates;
        }
        return candidates.filter(
          (candidate) =>
            candidate.languageCode?.trim().toLowerCase().split("-")[0] === normalizedLanguageCode
        );
      },
      async refreshVideoCandidateMetadata() {
        return readJson<ListeningVideoCandidate[]>(LISTENING_VIDEO_CANDIDATES_KEY, []);
      },
      async listTranscripts() {
        return readJson<ListeningTranscript[]>(LISTENING_TRANSCRIPTS_KEY, []);
      },
      async getTranscript(candidateId) {
        return (
          readJson<ListeningTranscript[]>(LISTENING_TRANSCRIPTS_KEY, []).find(
            (transcript) => transcript.candidateId === candidateId
          ) ?? null
        );
      },
      async saveTranscript(transcript) {
        const now = new Date().toISOString();
        const transcripts = readJson<ListeningTranscript[]>(LISTENING_TRANSCRIPTS_KEY, []);
        const existing = transcripts.find(
          (candidate) => candidate.candidateId === transcript.candidateId
        );
        const saved: ListeningTranscript = {
          ...transcript,
          id: existing?.id ?? transcript.id,
          createdAt: existing?.createdAt ?? transcript.createdAt ?? now,
          updatedAt: now
        };
        writeJson(
          LISTENING_TRANSCRIPTS_KEY,
          [saved, ...transcripts.filter((candidate) => candidate.id !== saved.id)].slice(0, 200)
        );
        return saved;
      },
      async generateTranscript() {
        const toolStatus = {
          ytDlpAvailable: false,
          ffmpegAvailable: false,
          whisperAvailable: false,
          ytDlpCommand: "yt-dlp",
          ffmpegCommand: "ffmpeg",
          whisperCommand: "whisper",
          message: "Whisper 자막 생성은 Electron 앱에서 실행됩니다."
        };
        return {
          ok: false,
          toolStatus,
          message: toolStatus.message
        };
      },
      async pickLocalVideoFile() {
        return null;
      },
      async listLocalVideoFolderVideos() {
        return [];
      },
      getLocalFilePath() {
        return "";
      },
      async pickLocalVideoFolder() {
        return null;
      },
      async prepareLocalVideoFile(input) {
        return input;
      },
      async createListeningCardMediaClip() {
        const toolStatus = {
          ytDlpAvailable: false,
          ffmpegAvailable: false,
          whisperAvailable: false,
          ytDlpCommand: "yt-dlp",
          ffmpegCommand: "ffmpeg",
          whisperCommand: "whisper",
          message: "리스닝 카드 원본 오디오 생성은 Electron 앱에서 실행됩니다."
        };
        return {
          ok: false,
          toolStatus,
          message: toolStatus.message
        };
      },
      async extractLocalEmbeddedSubtitle() {
        const toolStatus = {
          ytDlpAvailable: false,
          ffmpegAvailable: false,
          whisperAvailable: false,
          ytDlpCommand: "yt-dlp",
          ffmpegCommand: "ffmpeg",
          whisperCommand: "whisper",
          message: "내장 자막 가져오기는 Electron 앱에서 실행됩니다."
        };
        return {
          ok: false,
          toolStatus,
          message: toolStatus.message
        };
      },
      async generateLocalTranscript() {
        const toolStatus = {
          ytDlpAvailable: false,
          ffmpegAvailable: false,
          whisperAvailable: false,
          ytDlpCommand: "yt-dlp",
          ffmpegCommand: "ffmpeg",
          whisperCommand: "whisper",
          message: "로컬 영상 Whisper 전사는 Electron 앱에서 실행됩니다."
        };
        return {
          ok: false,
          toolStatus,
          message: toolStatus.message
        };
      },
      async getToolStatus() {
        return {
          ytDlpAvailable: false,
          ffmpegAvailable: false,
          whisperAvailable: false,
          ytDlpCommand: "yt-dlp",
          ffmpegCommand: "ffmpeg",
          whisperCommand: "whisper",
          message: "Whisper 자막 생성은 Electron 앱에서 실행됩니다."
        };
      }
    },
    documents: {
      async exportBilingualPdf(input) {
        const html = buildBilingualDocumentHtml(input);
        const exportStats = getBilingualDocumentStats(input);
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = getAutoBilingualExportFileName(input.title, input.pages.map((page) => page.pageNumber));
        anchor.click();
        URL.revokeObjectURL(url);
        return {
          filePath: anchor.download,
          fileType: "html",
          pageCount: exportStats.pageCount,
          segmentCount: exportStats.segmentCount
        };
      },
      async listExportRecords(profileId = DEFAULT_PROFILE_ID) {
        return readJson<BilingualExportHistoryRecord[]>(EXPORT_RECORDS_KEY, []).filter(
          (record) => (record.profileId ?? DEFAULT_PROFILE_ID) === normalizeProfileId(profileId)
        );
      },
      async saveExportRecord(record) {
        const records = readJson<BilingualExportHistoryRecord[]>(EXPORT_RECORDS_KEY, []);
        const saved = {
          ...record,
          profileId: normalizeProfileId(record.profileId)
        };
        const next = [
          saved,
          ...records.filter((candidate) => candidate.id !== record.id)
        ].slice(0, 50);
        writeJson(EXPORT_RECORDS_KEY, next);
        return saved;
      },
      async redownloadExport() {
        throw new Error("재다운로드는 Electron 앱에서만 지원됩니다.");
      },
      async pickReaderArtifact() {
        return null;
      },
      async readPdfFile() {
        return null;
      },
      async readTextFile() {
        return null;
      },
      async openPath() {
        return false;
      },
      async revealPath() {
        return false;
      }
    },
    translations: {
      async getCached(input) {
        return getCachedTranslation(input);
      },
      async saveCached(input) {
        return saveCachedTranslation(input, input.translatedText);
      },
      async getOllamaModelStatus(input) {
        return fetchOllamaModelStatus(input);
      },
      async pullOllamaModel(input) {
        return downloadOllamaModel(input);
      },
      async testConnection(input) {
        return testTranslationConnection(input);
      },
      async translate(input) {
        const cached = getCachedTranslation(input);
        if (cached) {
          return translationResultFromEntry(cached, "hit");
        }

        if (input.providerName === "google") {
          const translatedText = await translateWithGoogle(input);
          const saved = saveCachedTranslation(input, translatedText);
          return translationResultFromEntry(
            saved,
            "miss",
            estimateUsageEventForTexts(input, [input.text])
          );
        }

        if (input.providerName === "gemini") {
          const geminiResult = await translateTextWithGemini(input);
          const saved = saveCachedTranslation(input, geminiResult.translatedText);
          return translationResultFromEntry(saved, "miss", geminiResult.usage);
        }

        if (input.providerName === "browser") {
          throw new Error("Built-in translator runs in the UI, not the fallback API.");
        }

        if (input.providerName === "localMt") {
          throw new Error(LOCAL_MT_DESKTOP_ONLY_MESSAGE);
        }

        const translatedText = await translateWithLocalOllama(input);
        const saved = saveCachedTranslation(input, translatedText);
        return translationResultFromEntry(
          saved,
          "miss",
          estimateUsageEventForTexts(input, [input.text])
        );
      },
      async translatePdfSegments(input) {
        return translatePdfSegments(input);
      }
    },
    tts: {
      async synthesize(input) {
        return {
          providerName: input.providerName,
          model: input.model,
          voiceName: input.voiceName,
          message: "웹 fallback에서는 오디오 파일 캐시를 생성하지 않고 브라우저 TTS로 즉시 재생합니다.",
          createdAt: new Date().toISOString()
        };
      },
      async listVoices() {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          return [];
        }
        return window.speechSynthesis.getVoices().map((voice) => ({
          id: voice.voiceURI,
          name: voice.name,
          culture: voice.lang
        }));
      }
    }
  };
}

function applyReview(card: StudyCard, rating: ReviewRating): StudyCard {
  const now = new Date();
  const srs = scheduleCardReview(card.srs, rating, now);
  return { ...card, srs, updatedAt: now.toISOString() };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getFallbackStorageItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  setFallbackStorageItem(key, JSON.stringify(value));
}

function getFallbackStorageItem(key: string) {
  const sessionValue = sessionFallbackStore.get(key);
  if (sessionValue !== undefined) {
    return sessionValue;
  }
  if (typeof localStorage !== "undefined") {
    try {
      return localStorage.getItem(key);
    } catch {
      return sessionFallbackStore.get(key) ?? null;
    }
  }
  return sessionFallbackStore.get(key) ?? null;
}

function setFallbackStorageItem(key: string, value: string) {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(key, value);
      sessionFallbackStore.delete(key);
      return;
    } catch {
      // Fall back to in-memory storage when browser storage is blocked or full.
    }
  }
  sessionFallbackStore.set(key, value);
}

function getStoredDiamondWallet(): DiamondWallet {
  return readJson<DiamondWallet>(DIAMOND_WALLET_KEY, {
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    updatedAt: new Date().toISOString()
  });
}

function getTodayMissionBoardFromStorage() {
  const dateKey = getMissionDateKey();
  const progressRows = readJson<DailyMissionProgress[]>(MISSION_PROGRESS_KEY, []).filter(
    (progress) => progress.dateKey === dateKey
  );
  const transactions = readJson<DiamondTransaction[]>(DIAMOND_TRANSACTIONS_KEY, []);
  return buildDailyMissionBoard(dateKey, progressRows, transactions);
}

function recordMissionEventToStorage(
  input: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const dateKey = getMissionDateKey(now);
  const amount = normalizeMissionAmount(input.amount);
  const event: LearningMissionEvent = {
    id: randomId(),
    dateKey,
    type: input.type,
    profileId: normalizeProfileId(input.profileId),
    amount,
    metadata: input.metadata,
    createdAt: nowIso
  };
  writeJson(MISSION_EVENTS_KEY, [
    event,
    ...readJson<LearningMissionEvent[]>(MISSION_EVENTS_KEY, [])
  ]);

  const missions = findMissionDefinitionsByEventType(event.type);
  if (missions.length > 0) {
    let progressRows = readJson<DailyMissionProgress[]>(MISSION_PROGRESS_KEY, []);
    for (const mission of missions) {
      const existing = progressRows.find(
        (progress) => progress.dateKey === dateKey && progress.missionId === mission.id
      );
      const nextProgress: DailyMissionProgress = {
        ...(existing ?? createEmptyMissionProgress(dateKey, mission.id, nowIso)),
        progress: Math.min(mission.goal, Math.max(0, existing?.progress ?? 0) + amount),
        updatedAt: nowIso
      };
      progressRows = [
        nextProgress,
        ...progressRows.filter(
          (progress) => !(progress.dateKey === dateKey && progress.missionId === mission.id)
        )
      ];
    }
    writeJson(MISSION_PROGRESS_KEY, progressRows);
  }

  return getTodayMissionBoardFromStorage();
}

function claimMissionRewardFromStorage(
  missionId: DailyMissionId,
  profileId: ProfileId = DEFAULT_PROFILE_ID
) {
  const mission = findMissionDefinition(missionId);
  if (!mission) {
    throw new Error(`Unknown mission: ${missionId}`);
  }
  const nowIso = new Date().toISOString();
  const dateKey = getMissionDateKey();
  const progressRows = readJson<DailyMissionProgress[]>(MISSION_PROGRESS_KEY, []);
  const existing = progressRows.find(
    (progress) => progress.dateKey === dateKey && progress.missionId === missionId
  );
  if ((existing?.progress ?? 0) < mission.goal) {
    throw new Error("미션이 아직 완료되지 않았습니다.");
  }
  if (existing?.claimed) {
    throw new Error("이미 받은 보상입니다.");
  }

  const nextProgress: DailyMissionProgress = {
    ...(existing ?? createEmptyMissionProgress(dateKey, missionId, nowIso)),
    progress: Math.min(mission.goal, existing?.progress ?? mission.goal),
    claimed: true,
    claimedAt: nowIso,
    updatedAt: nowIso
  };
  writeJson(MISSION_PROGRESS_KEY, [
    nextProgress,
    ...progressRows.filter(
      (progress) => !(progress.dateKey === dateKey && progress.missionId === missionId)
    )
  ]);
  addDiamondTransactionToStorage({
    amount: mission.rewardDiamonds,
    reason: mission.title,
    missionId,
    profileId,
    dateKey,
    createdAt: nowIso
  });
  return getTodayMissionBoardFromStorage();
}

function claimDailyBonusFromStorage(profileId: ProfileId = DEFAULT_PROFILE_ID) {
  const board = getTodayMissionBoardFromStorage();
  if (!board.bonus.claimable) {
    throw new Error("오늘 보너스를 받을 수 없습니다.");
  }
  const nowIso = new Date().toISOString();
  const dateKey = board.dateKey;
  const progressRows = readJson<DailyMissionProgress[]>(MISSION_PROGRESS_KEY, []);
  const existing = progressRows.find(
    (progress) => progress.dateKey === dateKey && progress.missionId === dailyBonusDefinition.id
  );
  const nextProgress: DailyMissionProgress = {
    ...(existing ?? createEmptyMissionProgress(dateKey, dailyBonusDefinition.id, nowIso)),
    progress: 1,
    claimed: true,
    claimedAt: nowIso,
    updatedAt: nowIso
  };
  writeJson(MISSION_PROGRESS_KEY, [
    nextProgress,
    ...progressRows.filter(
      (progress) => !(progress.dateKey === dateKey && progress.missionId === dailyBonusDefinition.id)
    )
  ]);
  addDiamondTransactionToStorage({
    amount: dailyBonusDefinition.rewardDiamonds,
    reason: dailyBonusDefinition.title,
    missionId: dailyBonusDefinition.id,
    profileId,
    dateKey,
    createdAt: nowIso
  });
  return getTodayMissionBoardFromStorage();
}

function addDiamondTransactionToStorage(input: {
  amount: number;
  reason: string;
  missionId?: DiamondTransaction["missionId"];
  profileId?: ProfileId;
  dateKey: string;
  createdAt: string;
}) {
  const wallet = getStoredDiamondWallet();
  const amount = Math.max(0, Math.floor(input.amount));
  const nextWallet: DiamondWallet = {
    balance: wallet.balance + amount,
    totalEarned: wallet.totalEarned + amount,
    totalSpent: wallet.totalSpent,
    updatedAt: input.createdAt
  };
  const transaction: DiamondTransaction = {
    id: randomId(),
    type: "earn",
    amount,
    balanceAfter: nextWallet.balance,
    reason: input.reason,
    missionId: input.missionId,
    profileId: normalizeProfileId(input.profileId),
    dateKey: input.dateKey,
    createdAt: input.createdAt
  };
  writeJson(DIAMOND_WALLET_KEY, nextWallet);
  writeJson(DIAMOND_TRANSACTIONS_KEY, [
    transaction,
    ...readJson<DiamondTransaction[]>(DIAMOND_TRANSACTIONS_KEY, [])
  ]);
}

function getCachedTranslation(input: TranslationCacheLookupInput) {
  const entries = readJson<TranslationCacheEntry[]>(TRANSLATION_CACHE_KEY, []);
  const cacheKey = getTranslationCacheKey(input, normalizeProfileId(input.profileId));
  return entries.find(
    (entry) =>
      getTranslationCacheKey(entryToLookupInput(entry), normalizeProfileId(entry.profileId)) ===
      cacheKey
  ) ?? null;
}

function saveCachedTranslation(input: TranslationCacheLookupInput, translatedText: string) {
  const now = new Date().toISOString();
  const entries = readJson<TranslationCacheEntry[]>(TRANSLATION_CACHE_KEY, []);
  const cacheKey = getTranslationCacheKey(input, normalizeProfileId(input.profileId));
  const existing = entries.find(
    (entry) =>
      getTranslationCacheKey(entryToLookupInput(entry), normalizeProfileId(entry.profileId)) ===
      cacheKey
  );
  const saved = createTranslationCacheEntry({
    existing,
    id: existing?.id ?? randomId(),
    input,
    normalizedProfileId: normalizeProfileId(input.profileId),
    now,
    translatedText
  });
  writeJson(TRANSLATION_CACHE_KEY, [
    saved,
    ...entries.filter(
      (entry) =>
        getTranslationCacheKey(entryToLookupInput(entry), normalizeProfileId(entry.profileId)) !==
        cacheKey
    )
  ]);
  return saved;
}

async function testTranslationConnection(
  input: TranslationConnectionTestInput
): Promise<TranslationConnectionTestResult> {
  try {
    if (input.providerName === "gemini") {
      await testGeminiConnection({
        apiKey: input.geminiApiKey,
        model: input.geminiModel
      });
      return { ok: true, message: "Gemini 연결이 정상입니다." };
    }

    if (input.providerName === "google") {
      await translateWithGoogle({
        text: "Hello.",
        targetLang: "ko",
        providerName: "google",
        googleApiKey: input.googleApiKey
      });
      return { ok: true, message: "Google 번역 연결이 정상입니다." };
    }

    if (input.providerName === "browser") {
      return {
        ok: false,
        message: "Built-in translator is checked by the UI, not the fallback API."
      };
    }

    if (input.providerName === "localMt") {
      return {
        ok: false,
        message: LOCAL_MT_DESKTOP_ONLY_MESSAGE
      };
    }

    await fetchOllamaModelStatus({
      baseUrl: input.ollamaBaseUrl,
      model: input.ollamaModel ?? ""
    });
    return { ok: true, message: "Ollama 연결이 정상입니다." };
  } catch (caught) {
    return {
      ok: false,
      message: caught instanceof Error ? caught.message : "연결 테스트에 실패했습니다."
    };
  }
}

function estimateUsageEventForTexts(
  input: Pick<
    TranslateTextInput,
    | "profileId"
    | "providerName"
    | "model"
    | "geminiModel"
    | "geminiPlan"
    | "ollamaModel"
    | "sourceLang"
    | "targetLang"
  >,
  texts: string[]
): TranslationUsageEvent {
  const model = getUsageModelName(input);
  const estimate = estimateTranslationUsage({
    texts: texts.map((text) => ({ text, cacheStatus: "miss" })),
    providerName: input.providerName,
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  return createTranslationUsageEvent({
    profileId: input.profileId,
    providerName: input.providerName,
    model: estimate.model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    usage: {
      inputTokens: estimate.inputTokens.max,
      outputTokens: estimate.outputTokens.max,
      totalTokens: estimate.totalTokens.max,
      billableCharacters: estimate.billableCharacters,
      requestCount: estimate.requestCount,
      cacheHitCount: estimate.cacheHitCount,
      cacheMissCount: estimate.cacheMissCount
    }
  });
}

function mergeUsageEvents(
  events: TranslationUsageEvent[],
  input: Pick<
    TranslatePdfSegmentsInput,
    | "profileId"
    | "providerName"
    | "model"
    | "geminiModel"
    | "geminiPlan"
    | "ollamaModel"
    | "sourceLang"
    | "targetLang"
  >
): TranslationUsageEvent | undefined {
  if (events.length === 0) {
    return undefined;
  }

  const usage = events.reduce(
    (sum, event) => ({
      inputTokens: sum.inputTokens + event.usage.inputTokens,
      outputTokens: sum.outputTokens + event.usage.outputTokens,
      totalTokens: sum.totalTokens + event.usage.totalTokens,
      billableCharacters: sum.billableCharacters + event.usage.billableCharacters,
      requestCount: sum.requestCount + event.usage.requestCount,
      cacheHitCount: sum.cacheHitCount + event.usage.cacheHitCount,
      cacheMissCount: sum.cacheMissCount + event.usage.cacheMissCount
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      billableCharacters: 0,
      requestCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 0
    }
  );

  return createTranslationUsageEvent({
    profileId: input.profileId,
    providerName: input.providerName,
    model: getUsageModelName(input),
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    usage
  });
}

function getUsageModelName(
  input: Pick<
    TranslateTextInput,
    "providerName" | "model" | "geminiModel" | "ollamaModel"
  >
) {
  if (input.model?.trim()) {
    return input.model;
  }
  if (input.providerName === "gemini") {
    return input.geminiModel;
  }
  if (input.providerName === "local") {
    return input.ollamaModel;
  }
  return undefined;
}

async function translateWithGoogle(input: TranslateTextInput) {
  const apiKey = input.googleApiKey?.trim();
  if (!apiKey) {
    throw new Error("Google Translate API key가 필요합니다.");
  }

  const requestBody: Record<string, unknown> = {
    q: input.text,
    target: normalizeTargetLang(input.targetLang),
    format: "text"
  };
  const sourceLang = normalizeSourceLang(input.sourceLang);
  if (sourceLang !== "auto") {
    requestBody.source = sourceLang;
  }

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }
  );
  const payload = (await response.json()) as GoogleTranslateResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Google Translate 요청에 실패했습니다.");
  }

  const translatedText = payload.data?.translations?.[0]?.translatedText;
  if (!translatedText) {
    throw new Error("Google Translate 응답에 번역문이 없습니다.");
  }
  return decodeHtmlEntities(translatedText);
}

async function translateWithLocalOllama(input: TranslateTextInput) {
  const { baseUrl: normalizedBaseUrl, model } = normalizeOllamaInput({
    baseUrl: input.ollamaBaseUrl,
    model: input.ollamaModel ?? ""
  });
  const chatUrl = getOllamaApiUrl(normalizedBaseUrl, "/api/chat");

  const sourceLanguage = input.sourceLanguage ?? languageFromCode(input.sourceLang, "Source");
  const outputLanguage = input.outputLanguage ?? languageFromCode(input.targetLang, "Target");
  const systemPrompt = buildPdfTranslationSystemPrompt({
    sourceLanguage,
    outputLanguage
  });

  let translatedText = await requestOllamaChat(chatUrl, model, normalizedBaseUrl, [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: input.text
    }
  ]);

  const shouldRunProperNounReview = shouldReviewPdfProperNouns({
    sourceText: input.text,
    outputLanguage
  });
  for (let revisionAttempt = 0; revisionAttempt < 2; revisionAttempt += 1) {
    const issues = assessPdfTranslationQuality({
      sourceText: input.text,
      translatedText,
      outputLanguage
    });
    const shouldRevise =
      issues.length > 0 || (revisionAttempt === 0 && shouldRunProperNounReview);
    if (!shouldRevise) {
      break;
    }

    translatedText = await requestOllamaChat(chatUrl, model, normalizedBaseUrl, [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: buildPdfTranslationRevisionPrompt({
          sourceText: input.text,
          previousTranslation: translatedText,
          sourceLanguage,
          outputLanguage,
          issueMessages:
            issues.length > 0
              ? issues.map((issue) => issue.message)
              : [
                  "The source contains likely proper nouns or titles. Re-check that names and titles are not malformed, guessed, or translated into unrelated words."
                ]
        })
      }
    ]);
  }

  translatedText = translatedText.trim();

  if (!translatedText) {
    throw new Error("Ollama 응답에 번역문이 없습니다.");
  }

  return translatedText;
}

async function translatePdfSegments(
  input: TranslatePdfSegmentsInput
): Promise<TranslatePdfSegmentsResult> {
  if (input.providerName === "browser") {
    throw new Error("Built-in translator runs in the UI, not the fallback API.");
  }

  const now = new Date().toISOString();
  const cachedTranslations: PdfSegmentTranslation[] = [];
  const missingSegments = [];

  for (const segment of input.segments) {
    const cached = input.bypassCache ? null : getCachedTranslation(segmentCacheInput(input, segment));
    if (cached) {
      cachedTranslations.push({
        id: segment.id,
        translationKo: cached.translatedText,
        cacheStatus: "hit"
      });
    } else {
      missingSegments.push(segment);
    }
  }

  const translatedMisses: PdfSegmentTranslation[] = [];
  const usageEvents: TranslationUsageEvent[] = [];
  const batchSize = input.providerName === "local" ? 4 : input.providerName === "localMt" ? 16 : 8;
  for (const segmentBatch of chunk(missingSegments, batchSize)) {
    let batchTranslations: PdfSegmentTranslation[];
    if (input.providerName === "google") {
      batchTranslations = await Promise.all(
        segmentBatch.map(async (segment) => ({
          id: segment.id,
          translationKo: await translateWithGoogle({
            ...input,
            text: segment.text
          }),
          cacheStatus: "miss" as const
        }))
      );
      usageEvents.push(
        estimateUsageEventForTexts(
          input,
          segmentBatch.map((segment) => segment.text)
        )
      );
    } else if (input.providerName === "gemini") {
      const geminiBatch = await translatePdfSegmentsWithGemini({
        ...input,
        segments: segmentBatch
      });
      batchTranslations = geminiBatch.translations.map((translation) => ({
        ...translation,
        cacheStatus: "miss" as const
      }));
      usageEvents.push(geminiBatch.usage);
    } else if (input.providerName === "localMt") {
      throw new Error(LOCAL_MT_DESKTOP_ONLY_MESSAGE);
    } else {
      batchTranslations = (
        await translatePdfSegmentsWithLocalOllama({
          ...input,
          segments: segmentBatch
        })
      ).map((translation) => ({
        ...translation,
        cacheStatus: "miss" as const
      }));
      usageEvents.push(
        estimateUsageEventForTexts(
          input,
          segmentBatch.map((segment) => segment.text)
        )
      );
    }

    batchTranslations.forEach((translation) => {
      const segment = segmentBatch.find((candidate) => candidate.id === translation.id);
      if (!segment) {
        return;
      }

      saveCachedTranslation(segmentCacheInput(input, segment), translation.translationKo);
      translatedMisses.push(translation);
    });
  }

  const translationsById = new Map(
    [...cachedTranslations, ...translatedMisses].map((translation) => [
      translation.id,
      translation
    ])
  );
  const translations = input.segments
    .map((segment) => translationsById.get(segment.id))
    .filter((translation): translation is PdfSegmentTranslation => Boolean(translation));
  const missingSegmentIds = input.segments
    .filter((segment) => !translationsById.has(segment.id))
    .map((segment) => segment.id);

  return {
    translations,
    providerName: input.providerName,
    sourceLang: input.sourceLang?.trim() || "auto",
    targetLang: input.targetLang.trim() || "ko",
    cacheStatus:
      !input.bypassCache && translatedMisses.length === 0
        ? "hit"
        : cachedTranslations.length > 0
          ? "partial"
          : "miss",
    missingSegmentIds,
    usage: mergeUsageEvents(usageEvents, input),
    createdAt: now,
    updatedAt: now
  };
}

async function translatePdfSegmentsWithLocalOllama(
  input: TranslatePdfSegmentsInput
): Promise<PdfSegmentTranslation[]> {
  const { baseUrl: normalizedBaseUrl, model } = normalizeOllamaInput({
    baseUrl: input.ollamaBaseUrl,
    model: input.ollamaModel ?? ""
  });
  const chatUrl = getOllamaApiUrl(normalizedBaseUrl, "/api/chat");
  const sourceLanguage = input.sourceLanguage ?? languageFromCode(input.sourceLang, "Source");
  const outputLanguage = input.outputLanguage ?? languageFromCode(input.targetLang, "Target");
  const translationContext =
    input.translationContext ??
    buildPdfTranslationContext({
      segments: input.segments,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang
    });
  const translations = new Map<string, string>();
  const systemPrompt = buildPdfSegmentTranslationSystemPrompt({
    sourceLanguage,
    outputLanguage,
    segmentCount: input.segments.length,
    translationContext
  });
  const responseText = await requestOllamaChat(chatUrl, model, normalizedBaseUrl, [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: buildPdfSegmentTranslationUserPrompt(input.segments, translationContext)
    }
  ]);
  const parsed = parsePdfSegmentTranslationsLenient(responseText, input.segments).translations;
  const parsedById = new Map(parsed.map((translation) => [translation.id, translation]));
  const repairCandidates = [];

  for (const segment of input.segments) {
    const candidate = parsedById.get(segment.id)?.translationKo.trim();
    if (!candidate) {
      repairCandidates.push({
        segment,
        translationKo: "",
        issues: ["The model returned an empty translation."]
      });
      continue;
    }

    const issues = assessPdfTranslationQuality({
      sourceText: segment.text,
      translatedText: candidate,
      outputLanguage,
      translationContext
    });
    if (issues.length > 0) {
      repairCandidates.push({
        segment,
        translationKo: candidate,
        issues: issues.map((issue) => issue.message)
      });
      continue;
    }

    translations.set(segment.id, candidate);
  }

  if (repairCandidates.length > 0) {
    const repairSegments = repairCandidates.map((candidate) => candidate.segment);
    const repairPrompt = buildPdfSegmentTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage,
      segmentCount: repairSegments.length,
      translationContext
    });
    const repairResponseText = await requestOllamaChat(chatUrl, model, normalizedBaseUrl, [
      {
        role: "system",
        content: repairPrompt
      },
      {
        role: "user",
        content: buildPdfSegmentTranslationRepairUserPrompt({
          segments: repairSegments,
          previousTranslations: repairCandidates.map((candidate) => ({
            id: candidate.segment.id,
            translationKo: candidate.translationKo,
            issues: candidate.issues
          })),
          translationContext
        })
      }
    ]);
    const repairParsed = parsePdfSegmentTranslationsLenient(
      repairResponseText,
      repairSegments
    ).translations;
    const repairParsedById = new Map(repairParsed.map((translation) => [translation.id, translation]));
    for (const repairCandidate of repairCandidates) {
      const repaired = repairParsedById.get(repairCandidate.segment.id)?.translationKo.trim();
      if (!repaired) {
        continue;
      }
      const remainingIssues = assessPdfTranslationQuality({
        sourceText: repairCandidate.segment.text,
        translatedText: repaired,
        outputLanguage,
        translationContext
      });
      if (hasCriticalQualityIssues(remainingIssues)) {
        continue;
      }
      translations.set(repairCandidate.segment.id, repaired);
    }
  }

  return input.segments.flatMap((segment) => {
    const translationKo = translations.get(segment.id);
    return translationKo ? [{ id: segment.id, translationKo }] : [];
  });
}

async function requestOllamaChat(
  chatUrl: string,
  model: string,
  normalizedBaseUrl: string,
  messages: Array<{ role: "system" | "user"; content: string }>
) {
  let response: Response;
  try {
    response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          repeat_penalty: 1.05
        },
        messages
      })
    });
  } catch {
    throw new Error(
      `Ollama에 연결할 수 없습니다. Ollama를 설치하고 실행한 뒤 Settings baseUrl(${normalizedBaseUrl})을 확인해 주세요.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama 번역 요청에 실패했습니다: ${response.status}. ${await readOllamaError(response)}`
    );
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  return (payload.message?.content ?? payload.response ?? "").trim();
}

function parsePdfSegmentTranslations(text: string): PdfSegmentTranslation[] {
  const parsed = parseJsonFromText(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Ollama PDF 세그먼트 번역 응답이 JSON 배열이 아닙니다.");
  }

  return parsed.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.translationKo !== "string") {
      throw new Error("Ollama PDF 세그먼트 번역 응답에 id/translationKo가 없습니다.");
    }

    return {
      id: item.id,
      translationKo: item.translationKo
    };
  });
}

function parseJsonFromText(text: string): unknown {
  try {
    return parseJsonWithLooseEscapes(text);
  } catch {
    const firstArray = text.indexOf("[");
    const lastArray = text.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      return parseJsonWithLooseEscapes(text.slice(firstArray, lastArray + 1));
    }
    throw new Error("Ollama did not return parseable JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasCriticalQualityIssues(issues: ReturnType<typeof assessPdfTranslationQuality>) {
  return hasCriticalPdfTranslationQualityIssues(issues);
}

async function fetchOllamaModelStatus(
  input: OllamaModelInput
): Promise<OllamaModelStatusResult> {
  const { baseUrl, model } = normalizeOllamaInput(input);
  const installedModels = await listOllamaModels(baseUrl);

  return {
    baseUrl,
    model,
    installed: isRequestedModelInstalled(model, installedModels),
    installedModels
  };
}

async function downloadOllamaModel(input: OllamaModelInput): Promise<PullOllamaModelResult> {
  const status = await fetchOllamaModelStatus(input);
  if (status.installed) {
    return {
      baseUrl: status.baseUrl,
      model: status.model,
      status: "already_installed"
    };
  }

  let response: Response;
  try {
    response = await fetch(getOllamaApiUrl(status.baseUrl, "/api/pull"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: status.model,
        stream: false
      })
    });
  } catch {
    throw new Error(
      `Ollama에 연결할 수 없습니다. Ollama를 설치하고 실행한 뒤 Settings baseUrl(${status.baseUrl})을 확인해 주세요.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama 모델 다운로드에 실패했습니다: ${response.status}. ${await readOllamaError(response)}`
    );
  }

  return {
    baseUrl: status.baseUrl,
    model: status.model,
    status: "downloaded"
  };
}

async function listOllamaModels(baseUrl: string) {
  let response: Response;
  try {
    response = await fetch(getOllamaApiUrl(baseUrl, "/api/tags"));
  } catch {
    throw new Error(
      `Ollama에 연결할 수 없습니다. Ollama를 설치하고 실행한 뒤 Settings baseUrl(${baseUrl})을 확인해 주세요.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama 모델 목록을 확인하지 못했습니다: ${response.status}. ${await readOllamaError(response)}`
    );
  }

  const payload = (await response.json()) as {
    models?: Array<{
      name?: string;
      model?: string;
    }>;
  };

  return (payload.models ?? [])
    .flatMap((entry) => [entry.name, entry.model])
    .filter((name): name is string => Boolean(name));
}

function normalizeOllamaInput(input: OllamaModelInput) {
  const model = input.model.trim();
  if (!model) {
    throw new Error("Settings에서 Ollama model을 입력해 주세요.");
  }

  return {
    baseUrl: (input.baseUrl?.trim() || "http://localhost:11434").replace(/\/$/, ""),
    model
  };
}

function isRequestedModelInstalled(model: string, installedModels: string[]) {
  const requested = model.toLowerCase();
  const aliases = requested.includes(":") ? [requested] : [requested, `${requested}:latest`];
  return installedModels.some((installedModel) =>
    aliases.includes(installedModel.toLowerCase())
  );
}

function languageFromCode(code: string | undefined, fallbackName: string): ProfileLanguage {
  const normalizedCode = code?.trim() || "auto";
  return {
    code: normalizedCode,
    nameKo: normalizedCode,
    nameEn: fallbackName
  };
}

function getOllamaApiUrl(normalizedBaseUrl: string, pathname: string) {
  const isDefaultLocalOllama = /^https?:\/\/(localhost|127\.0\.0\.1):11434$/.test(
    normalizedBaseUrl
  );
  if (import.meta.env.DEV && isDefaultLocalOllama) {
    return `/ollama${pathname}`;
  }

  return `${normalizedBaseUrl}${pathname}`;
}

async function readOllamaError(response: Response) {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall through to text.
  }

  try {
    return await response.text();
  } catch {
    return "응답 내용을 읽을 수 없습니다.";
  }
}

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeProfileId(profileId: ProfileId | undefined) {
  return profileId?.trim() || DEFAULT_PROFILE_ID;
}

function normalizeMissionAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.floor(parsed));
}

function cardBelongsToProfile(card: Pick<StudyCard, "profileId">, profileId: ProfileId) {
  return (card.profileId ?? DEFAULT_PROFILE_ID) === normalizeProfileId(profileId);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, number: string) =>
      String.fromCodePoint(Number.parseInt(number, 10))
    )
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function getAutoBilingualExportFileName(titleValue: string, pageNumbers: number[]) {
  const title = sanitizeFileName(titleValue) || "bilingual-translation";
  const pageSuffix = formatPageNumbersForFileName(pageNumbers);
  return `${[title, pageSuffix, "dual"].filter(Boolean).join("-")}.html`;
}

function formatPageNumbersForFileName(pageNumbers: number[]) {
  const normalized = Array.from(new Set(pageNumbers))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
    .sort((left, right) => left - right);

  if (normalized.length === 0) {
    return "";
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const isContiguous = normalized.every((pageNumber, index) => pageNumber === first + index);
  if (isContiguous) {
    return first === last ? `p${first}` : `p${first}-${last}`;
  }

  if (normalized.length <= 4) {
    return `p${normalized.join("-")}`;
  }

  return `p${first}-${last}-${normalized.length}pages`;
}
