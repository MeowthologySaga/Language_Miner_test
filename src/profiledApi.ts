import type { LocalEnglishMinerApi } from "./data/api";
import {
  assessCardInputLanguage,
  assessInputLanguagePolicy,
  withInputLanguageMetadata
} from "./shared/inputLanguagePolicy";
import { DEFAULT_PROFILE_ID } from "./shared/profiles";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage
} from "./shared/translationUsage";
import type {
  AppSettings,
  ProfileId,
  StudyCard,
  TranslationConnectionTestInput,
  TranslationUsageEvent
} from "./shared/types";
import { prepareCardTtsAudio } from "./utils/cardTts";
import { recordTranslationUsageEvent } from "./utils/translationUsageLedger";

type ProfiledApiOptions = {
  switchToLanguageProfile?: (languageCode: string) => boolean;
};

export function createProfiledApi(
  api: LocalEnglishMinerApi,
  profileId: ProfileId,
  settings: AppSettings,
  options: ProfiledApiOptions = {}
): LocalEnglishMinerApi {
  const normalizedProfileId = profileId || DEFAULT_PROFILE_ID;
  return {
    ...api,
    cards: {
      ...api.cards,
      list: () => api.cards.list(normalizedProfileId),
      listDue: (nowIso?: string) => api.cards.listDue(nowIso, normalizedProfileId),
      save: async (card: StudyCard) => {
        const guardedCard = resolveCardLanguagePolicyForSave(card, settings, options);
        const preparedCard = await prepareCardTtsAudio(guardedCard, settings, api);
        return api.cards.save(preparedCard, normalizedProfileId);
      }
    },
    wallet: {
      ...api.wallet
    },
    missions: {
      ...api.missions,
      getToday: () => api.missions.getToday(normalizedProfileId),
      recordEvent: (event) =>
        api.missions.recordEvent({
          ...event,
          profileId: event.profileId ?? normalizedProfileId
        }),
      claimReward: (missionId) => api.missions.claimReward(missionId, normalizedProfileId),
      claimDailyBonus: () => api.missions.claimDailyBonus(normalizedProfileId)
    },
    cardSync: {
      ...api.cardSync,
      upload: (settings) => api.cardSync.upload(settings, normalizedProfileId),
      download: (settings) => api.cardSync.download(settings, normalizedProfileId),
      sync: (settings) => api.cardSync.sync(settings, normalizedProfileId)
    },
    lifeLogs: {
      ...api.lifeLogs,
      markProcessed: (id, nextProfileId) =>
        api.lifeLogs.markProcessed(id, nextProfileId ?? normalizedProfileId)
    },
    documents: {
      ...api.documents,
      exportBilingualPdf: (input) =>
        api.documents.exportBilingualPdf({
          ...input,
          profileId: normalizedProfileId
        }),
      listExportRecords: () => api.documents.listExportRecords(normalizedProfileId),
      saveExportRecord: (record) =>
        api.documents.saveExportRecord({
          ...record,
          profileId: normalizedProfileId
        })
    },
    translations: {
      ...api.translations,
      getCached: (input) =>
        api.translations.getCached({
          ...input,
          profileId: normalizedProfileId
        }),
      saveCached: (input) =>
        api.translations.saveCached({
          ...input,
          profileId: normalizedProfileId
        }),
      testConnection: async (input) => {
        const result = await api.translations.testConnection(input);
        if (result.ok) {
          recordTranslationUsageEvent(
            createTranslationConnectionUsageEvent(input, settings, normalizedProfileId)
          );
        }
        return result;
      },
      translate: async (input) => {
        const result = await api.translations.translate({
          ...input,
          profileId: normalizedProfileId
        });
        recordTranslationUsageEvent(result.usage);
        return result;
      },
      translatePdfSegments: async (input) => {
        const result = await api.translations.translatePdfSegments({
          ...input,
          profileId: normalizedProfileId
        });
        recordTranslationUsageEvent(result.usage);
        return result;
      }
    }
  };
}

function createTranslationConnectionUsageEvent(
  input: TranslationConnectionTestInput,
  settings: AppSettings,
  profileId: ProfileId
): TranslationUsageEvent | undefined {
  if (input.providerName === "browser") {
    return undefined;
  }

  const sourceLang = settings.learningProfile.targetLanguage.code;
  const targetLang = settings.learningProfile.nativeLanguage.code;
  const estimate = estimateTranslationUsage({
    texts: [{ text: "Translation engine connection test.", cacheStatus: "miss" }],
    providerName: input.providerName,
    model: getTranslationConnectionModel(input, settings),
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });

  return createTranslationUsageEvent({
    profileId,
    providerName: input.providerName,
    model: estimate.model,
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
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

function getTranslationConnectionModel(
  input: TranslationConnectionTestInput,
  settings: AppSettings
) {
  if (input.providerName === "gemini") {
    return input.geminiModel || settings.geminiModel;
  }
  if (input.providerName === "local") {
    return input.ollamaModel || settings.ollamaModel;
  }
  if (input.providerName === "localMt") {
    return input.localMtModel || settings.localMtModel;
  }
  return undefined;
}

function resolveCardLanguagePolicyForSave(
  card: StudyCard,
  settings: AppSettings,
  options: ProfiledApiOptions
): StudyCard {
  if (card.cardType !== "reading" || card.deckType === "output") {
    return card;
  }
  if (card.languageMetadata?.policyStatus === "override") {
    return card;
  }

  const assessment = assessCardInputLanguage({
    card,
    settings,
    sourceKind: card.languageMetadata?.sourceKind
  });
  if (!assessment.shouldBlock) {
    return withInputLanguageMetadata(card, assessment);
  }

  const decision = chooseInputLanguageMismatchAction(
    card,
    assessment.message,
    assessment.expectedLanguageCode,
    assessment.detectedLanguageCode,
    options
  );
  if (decision !== "override") {
    throw new Error(assessment.message);
  }

  return withInputLanguageMetadata(
    card,
    assessInputLanguagePolicy({
      text: card.sourceSentence || card.frontText,
      contextText: card.frontText,
      learningProfile: settings.learningProfile,
      override: true,
      sourceKind: "manual_override"
    })
  );
}

function chooseInputLanguageMismatchAction(
  card: StudyCard,
  message: string,
  expectedLanguageCode: string,
  detectedLanguageCode: string,
  options: ProfiledApiOptions
): "override" | "cancel" {
  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    return "cancel";
  }

  const choice = window
    .prompt(
      [
        message,
        "",
        "선택지를 입력하세요:",
        "번역 = 학습어 번역 페이지를 열고 저장 취소",
        "전환 = 감지 언어 프로필로 바꾼 뒤 다시 저장",
        "강행 = 현재 프로필에 강행 저장"
      ].join("\n"),
      "번역"
    )
    ?.trim()
    .toLowerCase();
  if (!choice) {
    return "cancel";
  }
  if (choice === "강행" || choice === "override" || choice === "3") {
    return "override";
  }
  if (choice === "번역" || choice === "translate" || choice === "1") {
    openTranslationPage(card.sourceSentence || card.frontText, expectedLanguageCode);
    return "cancel";
  }
  if (choice === "전환" || choice === "switch" || choice === "2") {
    const switched =
      detectedLanguageCode !== "unknown" &&
      options.switchToLanguageProfile?.(detectedLanguageCode) === true;
    window.alert?.(
      switched
        ? "감지 언어 프로필로 전환했습니다. 다시 저장하면 해당 프로필에 저장됩니다."
        : "감지 언어에 맞는 프로필을 찾지 못했습니다. 프로필 전환기에서 직접 바꾼 뒤 다시 저장하세요."
    );
    return "cancel";
  }
  return "cancel";
}

function openTranslationPage(text: string, targetLanguageCode: string) {
  if (typeof window === "undefined") {
    return;
  }
  const url = `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(
    targetLanguageCode
  )}&text=${encodeURIComponent(text.slice(0, 5000))}&op=translate`;
  window.open(url, "_blank", "noopener,noreferrer");
}
