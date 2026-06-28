import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderOpen,
  Languages,
  Plus,
  Settings,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import {
  defaultLifeMiningCaptureSettings,
  resolveLifeMiningPresetSettings
} from "../shared/lifeMiningSettings";
import {
  DEFAULT_DAILY_APP_TOKEN_LIMIT,
  DEFAULT_LOCAL_MT_MODEL,
  DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
  formatCompactNumber,
  formatKrwRange,
  getTranslationProviderLabel
} from "../shared/translationUsage";
import { sanitizeSettingsStatusMessage } from "../shared/settingsStatus";
import {
  createProfileId,
  createProfilePreset,
  getBrowserTranslatorApi,
  getErrorMessage,
  getProfileInitials,
  getSettingsStatusClassName,
  getSettingsTranslationProviderButtonLabel,
  normalizeTranslatorLanguage
} from "./settingsPageUtils";
import { LanguageProfileEditor } from "./LanguageProfileEditor";
import { SettingsCardEnginePanel } from "./SettingsCardEnginePanel";
import { SettingsOverviewPanel } from "./SettingsOverviewPanel";
import { SettingsProfileAccountPanel } from "./SettingsProfileAccountPanel";
import { SettingsProfileSwitcher } from "./SettingsProfileSwitcher";
import { SettingsTtsPanel } from "./SettingsTtsPanel";
import { SettingsPageHeader } from "./SettingsPageHeader";
import {
  browserCaptureSiteOptions,
  geminiModelPresets,
  lifeMiningContextOptions,
  lifeMiningPresetOptions,
  lifeMiningScopeOptions,
  lifeMiningTargetOptions,
  getSettingsPanelClassName,
  isSettingsPanelVisible as isSettingsPanelVisibleForState,
  type SettingsMode,
  type SettingsPanelId,
  type SettingsTabId
} from "./settingsPageOptions";
import type {
  AppSettings,
  AppRuntimeStatus,
  BilingualPdfExportMode,
  LearningProfileRecord,
  LifeMiningCapturePreset,
  LifeMiningCaptureSettings,
  ProfileId,
  TranslationProviderName
} from "../shared/types";

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

type SettingsPageProps = {
  api: LocalEnglishMinerApi;
  activeProfileId: ProfileId;
  profileManagerOpenRequest?: number;
  profiles: LearningProfileRecord[];
  profileStats: ProfileStats;
  settings: AppSettings;
  provider: LLMProvider;
  onSelectProfile: (profileId: ProfileId) => void;
  onCreateProfile: (profile: LearningProfileRecord) => void;
  onUpdateProfile: (profile: LearningProfileRecord) => void;
  onDeleteProfile: (profileId: ProfileId) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function SettingsPage({
  api,
  activeProfileId,
  profileManagerOpenRequest = 0,
  profiles,
  profileStats,
  settings,
  provider,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onSettingsChange
}: SettingsPageProps) {
  const [connectionStatus, setConnectionStatus] = useState("");
  const [translationConnectionStatus, setTranslationConnectionStatus] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingTranslationConnection, setIsTestingTranslationConnection] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AppRuntimeStatus | null>(null);
  const [runtimeStatusMessage, setRuntimeStatusMessage] = useState("");
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(activeProfileId);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>("basic");
  const [settingsMode, setSettingsMode] = useState<SettingsMode>("basic");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [profileDeleteCandidate, setProfileDeleteCandidate] =
    useState<LearningProfileRecord | null>(null);
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles]
  );
  const editingProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingProfileId) ?? activeProfile,
    [activeProfile, editingProfileId, profiles]
  );
  const [profileDraft, setProfileDraft] = useState<LearningProfileRecord | null>(
    () => editingProfile ?? null
  );
  const usagePreview = useMemo(
    () => ({
      dailyLimitLabel: formatCompactNumber(settings.dailyAppTokenLimit || DEFAULT_DAILY_APP_TOKEN_LIMIT),
      monthlyLimitLabel: formatKrwRange({
        min: settings.monthlySpendLimitKrw || DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
        max: settings.monthlySpendLimitKrw || DEFAULT_MONTHLY_SPEND_LIMIT_KRW
      })
    }),
    [settings.dailyAppTokenLimit, settings.monthlySpendLimitKrw]
  );
  const activeProfileStat = activeProfile ? profileStats[activeProfile.id] : undefined;
  const lifeMiningCaptureSettings =
    settings.lifeMiningCaptureSettings ?? defaultLifeMiningCaptureSettings;
  const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();

  function isSettingsPanelVisible(panelId: SettingsPanelId) {
    return isSettingsPanelVisibleForState({
      activeSettingsTab,
      normalizedSettingsSearch,
      panelId,
      settingsMode
    });
  }

  function getSettingsPanelClass(panelId: SettingsPanelId, extraClassName = "") {
    return getSettingsPanelClassName({
      activeSettingsTab,
      extraClassName,
      normalizedSettingsSearch,
      panelId,
      settingsMode
    });
  }

  useEffect(() => {
    setEditingProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    setProfileDraft(editingProfile ? { ...editingProfile } : null);
    setProfileDeleteCandidate(null);
  }, [editingProfile]);

  useEffect(() => {
    if (!isProfileSwitcherOpen && !isProfileManagerOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setIsProfileSwitcherOpen(false);
      setIsProfileManagerOpen(false);
      setProfileDeleteCandidate(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProfileManagerOpen, isProfileSwitcherOpen]);

  useEffect(() => {
    if (profileManagerOpenRequest <= 0) {
      return;
    }
    openProfileManager();
  }, [profileManagerOpenRequest]);

  useEffect(() => {
    let isMounted = true;
    void api.app?.getRuntimeStatus().then((status) => {
      if (!isMounted) {
        return;
      }
      setRuntimeStatus(status);
      setRuntimeStatusMessage(status.message);
    });
    return () => {
      isMounted = false;
    };
  }, [api]);

  function update(next: Partial<AppSettings>) {
    onSettingsChange({
      ...settings,
      ...next
    });
  }

  function updateBrowserCaptureSite(
    key: keyof AppSettings["browserCaptureSiteSettings"],
    enabled: boolean
  ) {
    update({
      browserCaptureSiteSettings: {
        ...settings.browserCaptureSiteSettings,
        [key]: enabled
      }
    });
  }

  function updateLifeMiningCaptureSettings(next: Partial<LifeMiningCaptureSettings>) {
    update({
      lifeMiningCaptureSettings: {
        ...lifeMiningCaptureSettings,
        ...next,
        preset: next.preset ?? "custom"
      }
    });
  }

  function applyLifeMiningPreset(preset: Exclude<LifeMiningCapturePreset, "custom">) {
    update({
      lifeMiningCaptureSettings: resolveLifeMiningPresetSettings(preset)
    });
  }

  function openProfileManager(profileId = activeProfileId) {
    setEditingProfileId(profileId);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function selectProfile(profileId: ProfileId) {
    onSelectProfile(profileId);
    setIsProfileSwitcherOpen(false);
  }

  function createProfile() {
    const profile = createProfilePreset(profiles.length + 1, settings);
    onCreateProfile(profile);
    setEditingProfileId(profile.id);
    setProfileDraft(profile);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function duplicateProfile(profile: LearningProfileRecord) {
    const now = new Date().toISOString();
    const copy: LearningProfileRecord = {
      ...profile,
      id: createProfileId(),
      name: `${profile.name} 복사본`,
      createdAt: now,
      updatedAt: now
    };
    onCreateProfile(copy);
    setEditingProfileId(copy.id);
    setProfileDraft(copy);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function saveProfileDraft() {
    if (!profileDraft) {
      return;
    }
    onUpdateProfile(profileDraft);
  }

  function deleteProfile(profileId: ProfileId) {
    onDeleteProfile(profileId);
    setProfileDeleteCandidate(null);
    if (editingProfileId === profileId) {
      const nextProfile = profiles.find((profile) => profile.id !== profileId);
      setEditingProfileId(nextProfile?.id ?? activeProfileId);
    }
  }

  async function testConnection() {
    setIsTestingConnection(true);
    setConnectionStatus("카드 생성 엔진 연결 확인 중...");
    try {
      const ok = await provider.testConnection();
      setConnectionStatus(ok ? "카드 생성 엔진 연결 성공" : "카드 생성 엔진 연결 실패");
    } catch (caught) {
      setConnectionStatus(
        `카드 생성 엔진 연결 실패: ${sanitizeSettingsStatusMessage(
          getErrorMessage(caught),
          settings
        )}`
      );
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function testTranslationConnection() {
    setIsTestingTranslationConnection(true);
    try {
      if (settings.translationProviderName === "browser") {
        setTranslationConnectionStatus("브라우저 내장 번역기 확인 중...");
        const translator = getBrowserTranslatorApi();
        if (!translator) {
          setTranslationConnectionStatus("현재 Electron/Chrome 버전에서는 브라우저 내장 번역기를 사용할 수 없습니다.");
          return;
        }

        const sourceLanguage = normalizeTranslatorLanguage(
          settings.learningProfile.targetLanguage.code,
          "en"
        );
        const targetLanguage = normalizeTranslatorLanguage(
          settings.learningProfile.nativeLanguage.code,
          "ko"
        );
        const availability = await translator.availability({
          sourceLanguage,
          targetLanguage
        });
        setTranslationConnectionStatus(
          availability === "unavailable"
            ? `브라우저 내장 번역기가 ${sourceLanguage} → ${targetLanguage} 번역을 지원하지 않습니다.`
            : `브라우저 내장 번역기 상태: ${availability} (${sourceLanguage} → ${targetLanguage})`
        );
        return;
      }

      setTranslationConnectionStatus("번역 엔진 연결 확인 중...");
      const result = await api.translations.testConnection({
        providerName: settings.translationProviderName,
        googleApiKey: settings.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        localMtModel: settings.localMtModel,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel
      });
      setTranslationConnectionStatus(sanitizeSettingsStatusMessage(result.message, settings));
    } catch (caught) {
      setTranslationConnectionStatus(
        `번역 엔진 연결 실패: ${sanitizeSettingsStatusMessage(
          getErrorMessage(caught),
          settings
        )}`
      );
    } finally {
      setIsTestingTranslationConnection(false);
    }
  }

  async function updateLaunchAtLogin(enabled: boolean) {
    if (!api.app) {
      setRuntimeStatusMessage("백그라운드 트레이 설정은 Electron 앱에서 사용할 수 있습니다.");
      return;
    }

    const status = await api.app.setLaunchAtLogin(enabled);
    setRuntimeStatus(status);
    setRuntimeStatusMessage(status.message);
  }

  return (
    <div className="settings-grid">
      <SettingsPageHeader
        activeSettingsTab={activeSettingsTab}
        normalizedSettingsSearch={normalizedSettingsSearch}
        settingsMode={settingsMode}
        settingsSearch={settingsSearch}
        onSettingsModeChange={setSettingsMode}
        onSettingsSearchChange={setSettingsSearch}
        onSettingsTabChange={setActiveSettingsTab}
      />

      {activeSettingsTab === "basic" && !normalizedSettingsSearch ? (
        <SettingsOverviewPanel
          lifeMiningCaptureSettings={lifeMiningCaptureSettings}
          settings={settings}
          onSettingsTabChange={setActiveSettingsTab}
        />
      ) : null}

      {isSettingsPanelVisible("profile") ? (
        <SettingsProfileAccountPanel
          activeProfile={activeProfile}
          activeProfileStat={activeProfileStat}
          settings={settings}
          onOpenManager={() => openProfileManager()}
          onOpenSwitcher={() => setIsProfileSwitcherOpen(true)}
        />
      ) : null}
      {isProfileManagerOpen && profileDraft ? (
        <div
          className="profile-manager-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setIsProfileManagerOpen(false);
            setProfileDeleteCandidate(null);
          }}
        >
          <section
            aria-label="프로필 관리"
            aria-modal="true"
            className="panel profile-manager-panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
          <div className="profile-manager-heading">
            <div className="panel-heading">
              <Users size={19} />
              <h2>프로필 관리</h2>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setIsProfileManagerOpen(false);
                setProfileDeleteCandidate(null);
              }}
            >
              <X size={16} />
              닫기
            </button>
          </div>
          <div className="profile-manager-layout">
            <div className="profile-manager-list" aria-label="프로필 목록">
              {profiles.map((profile) => {
                const stat = profileStats[profile.id];
                return (
                  <button
                    className={profile.id === profileDraft.id ? "active" : ""}
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setEditingProfileId(profile.id);
                      setProfileDeleteCandidate(null);
                    }}
                  >
                    <span className="profile-avatar">{getProfileInitials(profile)}</span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>
                        {profile.learningProfile.targetLanguage.nameKo} → {profile.learningProfile.nativeLanguage.nameKo}
                      </small>
                      <small>카드 {stat?.cardCount ?? 0} · 복습 {stat?.dueCount ?? 0}</small>
                    </span>
                  </button>
                );
              })}
              <button type="button" onClick={createProfile}>
                <span className="profile-avatar muted-avatar">
                  <Plus size={16} />
                </span>
                <span>
                  <strong>새 프로필</strong>
                  <small>현재 언어 설정을 복사해 시작</small>
                </span>
              </button>
            </div>
            <div className="profile-editor-panel">
              <label className="field-label">
                프로필 이름
                <input
                  className="text-input"
                  value={profileDraft.name}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      name: event.target.value
                    })
                  }
                />
              </label>
              <LanguageProfileEditor
                label="배우려는 언어"
                language={profileDraft.learningProfile.targetLanguage}
                onChange={(targetLanguage) =>
                  setProfileDraft({
                    ...profileDraft,
                    learningProfile: {
                      ...profileDraft.learningProfile,
                      targetLanguage
                    }
                  })
                }
              />
              <LanguageProfileEditor
                label="모국어"
                language={profileDraft.learningProfile.nativeLanguage}
                onChange={(nativeLanguage) =>
                  setProfileDraft({
                    ...profileDraft,
                    learningProfile: {
                      ...profileDraft.learningProfile,
                      nativeLanguage
                    }
                  })
                }
              />
              <div className="profile-scope-strip">
                <span>카드</span>
                <span>복습</span>
                <span>문서</span>
                <span>번역 캐시</span>
                <strong>Life Log는 공용</strong>
              </div>
              {profileDeleteCandidate?.id === profileDraft.id ? (
                <div className="profile-delete-confirm">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{profileDraft.name} 프로필을 삭제할까요?</strong>
                    <small>이 프로필의 카드와 복습 흐름이 더 이상 보이지 않습니다.</small>
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setProfileDeleteCandidate(null)}
                  >
                    취소
                  </button>
                  <button
                    className="button secondary danger-button"
                    type="button"
                    onClick={() => deleteProfile(profileDraft.id)}
                  >
                    삭제 확인
                  </button>
                </div>
              ) : null}
              <div className="profile-editor-actions">
                <button className="button primary" type="button" onClick={saveProfileDraft}>
                  <CheckCircle2 size={17} />
                  저장
                </button>
                <button className="button secondary" type="button" onClick={() => duplicateProfile(profileDraft)}>
                  <Copy size={17} />
                  복제
                </button>
                <button
                  className="button secondary danger-button"
                  disabled={profiles.length <= 1}
                  type="button"
                  onClick={() => setProfileDeleteCandidate(profileDraft)}
                >
                  <Trash2 size={17} />
                  삭제
                </button>
              </div>
            </div>
          </div>
          </section>
        </div>
      ) : null}

      <SettingsCardEnginePanel
        className={getSettingsPanelClass("cardEngine")}
        connectionStatus={connectionStatus}
        isTestingConnection={isTestingConnection}
        settings={settings}
        onSettingsChange={update}
        onTestConnection={() => void testConnection()}
      />

      <section className={getSettingsPanelClass("apiUsage", "api-usage-panel")}>
        <div className="panel-heading">
          <Languages size={19} />
          <h2>API 및 사용량</h2>
        </div>
        <div className="api-usage-summary">
          <div>
            <span>현재 번역 엔진</span>
            <strong>{getTranslationProviderLabel(settings)}</strong>
          </div>
          <div>
            <span>오늘 앱 한도</span>
            <strong>{usagePreview.dailyLimitLabel} tokens</strong>
          </div>
          <div>
            <span>월 지출 한도</span>
            <strong>{usagePreview.monthlyLimitLabel}</strong>
          </div>
        </div>
        <div className="segmented-control">
          {(["localMt", "local", "gemini", "google", "browser"] as TranslationProviderName[]).map((providerName) => (
            <button
              key={providerName}
              className={settings.translationProviderName === providerName ? "active" : ""}
              type="button"
              onClick={() => update({ translationProviderName: providerName })}
            >
              {getSettingsTranslationProviderButtonLabel(providerName)}
            </button>
          ))}
        </div>
        <label className="field-label">
          로컬 번역기 모델
          <input
            className="text-input"
            value={settings.localMtModel || DEFAULT_LOCAL_MT_MODEL}
            onChange={(event) => update({ localMtModel: event.target.value })}
          />
        </label>
        <p className="muted compact">
          로컬 번역기는 PDF 번역용 모델입니다. LLM 프롬프트, 카드 생성, JSON 응답 경로와 분리됩니다.
        </p>
        <div className="settings-two-column">
          <label className="field-label">
            Gemini API 키
            <input
              autoComplete="off"
              className="text-input"
              data-qa="settings-gemini-api-key"
              placeholder="API 키"
              type="password"
              value={settings.geminiApiKey}
              onChange={(event) => update({ geminiApiKey: event.target.value })}
            />
          </label>
          <label className="field-label">
            Gemini 모델
            <input
              className="text-input"
              value={settings.geminiModel}
              onChange={(event) => update({ geminiModel: event.target.value })}
            />
          </label>
        </div>
        <div className="model-preset-grid" aria-label="Gemini 모델 프리셋">
          {geminiModelPresets.map((preset) => (
            <button
              key={preset.value}
              className={
                settings.geminiModel === preset.value
                  ? "model-preset-button active"
                  : "model-preset-button"
              }
              type="button"
              onClick={() => update({ geminiModel: preset.value })}
            >
              <strong>{preset.label}</strong>
              <span>{preset.value}</span>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
        <p className="muted compact">
          Gemini 수요 폭주 오류가 나면 책 번역 테스트에는 Flash-Lite를 쓰는 편이 안정적입니다. 일시적인 503 과부하에는 앱이 재시도하고 Flash-Lite로 대체합니다.
        </p>
        <label className="field-label">
          Gemini 요금 상태
          <div className="segmented-control">
            {(["free", "paid"] as const).map((plan) => (
              <button
                key={plan}
                className={settings.geminiPlan === plan ? "active" : ""}
                type="button"
                onClick={() => update({ geminiPlan: plan })}
              >
                {plan === "free" ? "무료등급" : "유료등급"}
              </button>
            ))}
          </div>
          <small>
            Google Cloud Billing이 연결된 API 키면 유료등급으로 설정하세요. 일반 토큰은
            유료등급에서 무료 할당량으로 계산하지 않습니다.
          </small>
        </label>
        <label className="field-label">
          Google 번역 API 키
          <input
            autoComplete="off"
            className="text-input"
            data-qa="settings-google-translate-api-key"
            placeholder="Google Cloud Translation API 키"
            type="password"
            value={settings.googleTranslateApiKey}
            onChange={(event) => update({ googleTranslateApiKey: event.target.value })}
          />
        </label>
        <div className="settings-two-column">
          <label className="field-label">
            앱 일일 토큰 한도
            <input
              className="text-input"
              min={1}
              type="number"
              value={settings.dailyAppTokenLimit}
              onChange={(event) =>
                update({ dailyAppTokenLimit: Number(event.target.value) || 1 })
              }
            />
          </label>
          <label className="field-label">
            월 지출 한도(원)
            <input
              className="text-input"
              min={0}
              type="number"
              value={settings.monthlySpendLimitKrw}
              onChange={(event) =>
                update({ monthlySpendLimitKrw: Number(event.target.value) || 0 })
              }
            />
          </label>
        </div>
        <label className="toggle-field">
          <input
            checked={settings.confirmEstimatedCostBeforeRun}
            type="checkbox"
            onChange={(event) =>
              update({ confirmEstimatedCostBeforeRun: event.target.checked })
            }
          />
          <span>
            <strong>작업 전 예상 비용 확인</strong>
            <small>책 만들기 시작 전에 예상 토큰과 예상 금액을 보여줍니다.</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.confirmLifeMiningCardCost}
            type="checkbox"
            onChange={(event) =>
              update({ confirmLifeMiningCardCost: event.target.checked })
            }
          />
          <span>
            <strong>라이프 마이닝 카드 생성 전 비용 확인</strong>
            <small>후보에서 카드를 만들기 전에 예상 토큰과 예상 비용을 팝업으로 확인합니다.</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.stopOnFreeTierLimit}
            type="checkbox"
            onChange={(event) => update({ stopOnFreeTierLimit: event.target.checked })}
          />
          <span>
            <strong>무료 한도 초과 예상 시 중지</strong>
            <small>Gemini 무료등급 사용 시 앱 내부 안전 한도를 넘기지 않습니다.</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.stopOnMonthlyLimit}
            type="checkbox"
            onChange={(event) => update({ stopOnMonthlyLimit: event.target.checked })}
          />
          <span>
            <strong>월 한도 초과 예상 시 중지</strong>
            <small>유료 API 예상 비용이 설정한 월 한도를 넘으면 시작을 막습니다.</small>
          </span>
        </label>
        <button
          className="button secondary"
          data-qa="settings-translation-engine-test"
          disabled={isTestingTranslationConnection}
          type="button"
          onClick={() => void testTranslationConnection()}
        >
          <CheckCircle2 size={18} />
          {isTestingTranslationConnection ? "확인 중" : "번역 엔진 연결 테스트"}
        </button>
        {translationConnectionStatus ? (
          <p className={getSettingsStatusClassName(translationConnectionStatus)}>
            {translationConnectionStatus}
          </p>
        ) : null}
        <p className="selection-warning">
          클라우드 번역을 사용하면 문서 내용이 외부 API로 전송될 수 있습니다. 예상 금액은 실제 청구액과 다를 수 있습니다.
        </p>
        <label className="toggle-field">
          <input
            checked={settings.showPdfSourceHighlights}
            type="checkbox"
            onChange={(event) => update({ showPdfSourceHighlights: event.target.checked })}
          />
          <span>
            <strong>PDF 원문 박스 표시</strong>
            <small>이중 조판 미리보기와 export에서 원문 세그먼트 박스를 표시합니다.</small>
          </span>
        </label>
        <label className="field-label">
          PDF export mode
          <div className="segmented-control">
            {(["reading", "paper"] as BilingualPdfExportMode[]).map((exportMode) => (
              <button
                key={exportMode}
                className={settings.pdfExportMode === exportMode ? "active" : ""}
                type="button"
                onClick={() => update({ pdfExportMode: exportMode })}
              >
                {exportMode === "reading" ? "일반" : "논문"}
              </button>
            ))}
          </div>
        </label>
        <p className="muted compact">
          논문 모드는 표와 수식처럼 보이는 세그먼트를 오른쪽 번역 레이아웃으로 풀지 않고 원문 페이지에 그대로 둡니다.
        </p>
        <p className="muted compact">
          Ollama LLM은 위 Ollama baseUrl/모델 설정으로 번역합니다. 16GB VRAM 기본 추천은 gemma4:12b입니다.
        </p>
      </section>

      <SettingsTtsPanel
        className={getSettingsPanelClass("tts")}
        settings={settings}
        onSettingsChange={update}
      />

      <section className={getSettingsPanelClass("capture")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>캡처</h2>
        </div>
        <label className="field-label">
          문장 캡처 단축키
          <input
            className="text-input"
            data-qa="settings-capture-shortcut"
            placeholder="Ctrl+Q"
            value={settings.captureShortcut}
            onChange={(event) => update({ captureShortcut: event.target.value || "Ctrl+Q" })}
          />
        </label>
        <p className="muted compact">
          기본값은 Ctrl+Q입니다. Reader와 Live Translate에서 텍스트를 선택한 뒤 누르면 문장카드
          후보를 만듭니다.
        </p>
        <label className="toggle-field">
          <input
            checked={settings.browserSelectionCardMode === "autoSave"}
            type="checkbox"
            onChange={(event) =>
              update({
                browserSelectionCardMode: event.target.checked ? "autoSave" : "preview"
              })
            }
          />
          <span>
            <strong>웹 선택 카드 바로 저장</strong>
            <small>
              끄면 웹 팝오버에서 생성 결과를 먼저 확인하고 저장합니다. 켜면 문장카드 버튼이 바로
              저장합니다.
            </small>
          </span>
        </label>
        <div className="capture-site-settings">
          <div>
            <strong>라이프 마이닝 수집 단위</strong>
            <small>
              ChatGPT/Discord 같은 대화형 웹에서 학습 대상은 내 메시지로 두고, 주변 대화는 문맥으로만 붙입니다.
            </small>
          </div>
          <div className="model-preset-grid">
            {lifeMiningPresetOptions.map((option) => (
              <button
                className={
                  lifeMiningCaptureSettings.preset === option.value
                    ? "model-preset-button active"
                    : "model-preset-button"
                }
                data-qa={`settings-life-mining-preset-${option.value}`}
                key={option.value}
                type="button"
                onClick={() => applyLifeMiningPreset(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
            <button
              className={
                lifeMiningCaptureSettings.preset === "custom"
                  ? "model-preset-button active"
                  : "model-preset-button"
              }
              type="button"
              onClick={() => updateLifeMiningCaptureSettings({ preset: "custom" })}
            >
              <strong>커스텀</strong>
              <small>아래 세부 옵션을 직접 조절합니다.</small>
            </button>
          </div>
          <label className="field-label">
            수집 대상
            <div className="segmented-control">
              {lifeMiningTargetOptions.map((option) => (
                <button
                  className={lifeMiningCaptureSettings.target === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => updateLifeMiningCaptureSettings({ target: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <small>
              {
                lifeMiningTargetOptions.find(
                  (option) => option.value === lifeMiningCaptureSettings.target
                )?.description
              }
            </small>
          </label>
          <label className="field-label">
            자동 수집 범위
            <div className="segmented-control">
              {lifeMiningScopeOptions.map((option) => (
                <button
                  className={lifeMiningCaptureSettings.scope === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => updateLifeMiningCaptureSettings({ scope: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <small>
              {
                lifeMiningScopeOptions.find(
                  (option) => option.value === lifeMiningCaptureSettings.scope
                )?.description
              }
            </small>
          </label>
          <div className="settings-two-column">
            <label className="field-label">
              문맥 포함
              <select
                className="text-input"
                value={lifeMiningCaptureSettings.contextMode}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextMode: event.target.value as LifeMiningCaptureSettings["contextMode"]
                  })
                }
              >
                {lifeMiningContextOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              이전 문맥 버블 수
              <input
                className="text-input"
                min={0}
                max={20}
                step={1}
                type="number"
                value={lifeMiningCaptureSettings.contextBeforeCount}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextBeforeCount: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>
          <div className="settings-two-column">
            <label className="field-label">
              다음 문맥 버블 수
              <input
                className="text-input"
                min={0}
                max={10}
                step={1}
                type="number"
                value={lifeMiningCaptureSettings.contextAfterCount}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextAfterCount: Number(event.target.value)
                  })
                }
              />
            </label>
            <label className="field-label">
              메시지 최대 글자 수
              <input
                className="text-input"
                min={300}
                max={6000}
                step={100}
                type="number"
                value={lifeMiningCaptureSettings.maxMessageChars}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    maxMessageChars: Number(event.target.value) || 1500
                  })
                }
              />
            </label>
          </div>
          <div className="settings-two-column">
            <label className="field-label">
              긴 메시지 처리
              <select
                className="text-input"
                value={lifeMiningCaptureSettings.longMessageMode}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    longMessageMode: event.target.value as LifeMiningCaptureSettings["longMessageMode"]
                  })
                }
              >
                <option value="truncate">잘라서 저장</option>
                <option value="skip">너무 길면 건너뛰기</option>
              </select>
            </label>
            <label className="toggle-field compact-toggle">
              <input
                checked={lifeMiningCaptureSettings.dedupeEnabled}
                type="checkbox"
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({ dedupeEnabled: event.target.checked })
                }
              />
              <span>
                <strong>중복 저장 방지</strong>
                <small>같은 페이지의 같은 메시지는 다시 저장하지 않습니다.</small>
              </span>
            </label>
          </div>
          <label className="toggle-field compact-toggle">
            <input
              checked={lifeMiningCaptureSettings.filterLowSignalTargets}
              type="checkbox"
              onChange={(event) =>
                updateLifeMiningCaptureSettings({
                  filterLowSignalTargets: event.target.checked
                })
              }
            />
            <span>
              <strong>짧은 반응 본문 제외</strong>
              <small>
                켜면 ㅋㅋ, ㅇㅇ, 이모지만 있는 메시지는 본문 후보에서 제외하고 문맥에는 남깁니다.
              </small>
            </span>
          </label>
        </div>
        <div className="capture-site-settings">
          <div>
            <strong>웹 라이프 마이닝 작동 사이트</strong>
            <small>꺼둔 사이트에서는 메시지 자동수집, 웹 드래그 카드, YouTube 보조 기능이 실행되지 않습니다.</small>
          </div>
          <div className="capture-site-grid">
            {browserCaptureSiteOptions.map((option) => (
              <label className="toggle-field compact-toggle" key={option.key}>
                <input
                  checked={settings.browserCaptureSiteSettings[option.key] !== false}
                  data-qa={`settings-capture-site-${option.key}`}
                  type="checkbox"
                  onChange={(event) => updateBrowserCaptureSite(option.key, event.target.checked)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className={getSettingsPanelClass("sync")}>
        <div className="panel-heading">
          <FolderOpen size={19} />
          <h2>카드 동기화</h2>
        </div>
        <label className="field-label">
          동기화 폴더
          <input
            className="text-input"
            placeholder="카드 화면에서 폴더 연결 또는 직접 경로 입력"
            value={settings.cardSyncFolderPath}
            onChange={(event) => update({ cardSyncFolderPath: event.target.value })}
          />
        </label>
        <div className="settings-two-column">
          <label className="toggle-field">
            <input
              checked={settings.cardSyncOnStartup}
              type="checkbox"
              onChange={(event) => update({ cardSyncOnStartup: event.target.checked })}
            />
            <span>
              <strong>앱 시작 시 동기화</strong>
              <small>프로그램을 켤 때 카드 파일을 먼저 맞춥니다.</small>
            </span>
          </label>
          <label className="toggle-field">
            <input
              checked={settings.cardSyncOnQuit}
              type="checkbox"
              onChange={(event) => update({ cardSyncOnQuit: event.target.checked })}
            />
            <span>
              <strong>앱 종료 시 동기화</strong>
              <small>종료 전에 로컬 폴더에 변경사항을 반영합니다.</small>
            </span>
          </label>
        </div>
        <p className="muted compact">
          업로드, 다운로드, 충돌 병합은 카드 화면의 동기화 패널에서 실행합니다.
        </p>
      </section>

      <section className={getSettingsPanelClass("background")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>백그라운드 실행</h2>
        </div>
        <div className="background-status-card">
          <strong>시스템 트레이</strong>
          <small>
            Windows 우측 하단 알림 영역에서 Language Miner를 다시 열거나 종료할 수 있습니다.
          </small>
          <span className={runtimeStatus?.trayAvailable ? "status-pill active" : "status-pill"}>
            {runtimeStatus?.trayAvailable ? "켜짐" : "확인 중"}
          </span>
        </div>
        <label className="toggle-field">
          <input
            checked={Boolean(runtimeStatus?.launchAtLogin)}
            data-qa="settings-launch-at-login"
            disabled={!runtimeStatus?.canConfigureLaunchAtLogin}
            type="checkbox"
            onChange={(event) => void updateLaunchAtLogin(event.target.checked)}
          />
          <span>
            <strong>Windows 시작 시 자동 실행</strong>
            <small>
              앱을 켜두면 창을 닫아도 백그라운드에서 라이프 마이닝 수집 브리지가 유지됩니다.
            </small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.listeningLoopBackgroundPrebuildEnabled}
            data-qa="settings-listening-loop-background-prebuild"
            type="checkbox"
            onChange={(event) =>
              update({ listeningLoopBackgroundPrebuildEnabled: event.target.checked })
            }
          />
          <span>
            <strong>듣기 루프 미리 준비</strong>
            <small>
              듣기 루프 후보 큐가 준비되면 하루 한 번 현재 학습어 영상의 자막을 미리 만들어 둡니다.
            </small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.listeningLoopLongVideoPartialClipsEnabled}
            data-qa="settings-listening-loop-long-video-partial-clips"
            type="checkbox"
            onChange={(event) =>
              update({ listeningLoopLongVideoPartialClipsEnabled: event.target.checked })
            }
          />
          <span>
            <strong>긴영상 부분만 가져오기</strong>
            <small>
              켜면 오늘 루틴에서 긴 영상을 20-45초 클립으로 잘라 가져오고, 꺼두면 선택 영상 전사를 문장 단위로 그대로 씁니다.
            </small>
          </span>
        </label>
        <p className="muted compact">
          창의 X 버튼은 앱을 숨기고, 완전 종료는 시스템 트레이 메뉴의 종료를 사용합니다.
        </p>
        {runtimeStatusMessage ? <p className="status-text">{runtimeStatusMessage}</p> : null}
      </section>

      <section className={getSettingsPanelClass("labs")}>
        <div className="panel-heading">
          <AlertTriangle size={19} />
          <h2>실험실</h2>
        </div>
        <label className="toggle-field">
          <input
            checked={settings.labsHideGlossaryNavigation}
            data-qa="settings-labs-hide-glossary-navigation"
            type="checkbox"
            onChange={(event) => update({ labsHideGlossaryNavigation: event.target.checked })}
          />
          <span>
            <strong>용어집 네비에서 숨김</strong>
            <small>
              현재 용어집은 카드 단어 기반 임시 화면이라, PDF 번역용 용어집으로 재설계하기 전까지
              왼쪽 네비에서만 감춥니다.
            </small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.labsHideSidebarNavigation}
            data-qa="settings-labs-hide-sidebar-navigation"
            type="checkbox"
            onChange={(event) => update({ labsHideSidebarNavigation: event.target.checked })}
          />
          <span>
            <strong>네비게이션 완전 숨김</strong>
            <small>
              웹리더, PDF, 영상처럼 화면을 넓게 써야 할 때 왼쪽 네비 전체를 숨깁니다.
              화면 왼쪽 위의 복구 버튼으로 다시 열 수 있습니다.
            </small>
          </span>
        </label>
        <p className="muted compact">
          실험실 옵션은 기본 OFF입니다. 일반 접기보다 강한 화면 확장용 옵션으로만 사용하세요.
        </p>
      </section>

      <section className={getSettingsPanelClass("developer")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>개발자 옵션</h2>
        </div>
        <div className="developer-options-panel">
          <strong>디버그 도구</strong>
        <label className="toggle-field">
          <input
            checked={settings.debugMode}
            data-qa="settings-debug-mode"
            type="checkbox"
            onChange={(event) => update({ debugMode: event.target.checked })}
          />
          <span>
            <strong>디버그 모드</strong>
            <small>Reader에서 기본 PDF를 자동으로 엽니다.</small>
          </span>
        </label>
        <label className="field-label">
          디버그 PDF 경로
          <input
            className="text-input"
            value={settings.debugPdfPath}
            onChange={(event) => update({ debugPdfPath: event.target.value })}
          />
        </label>
        <p className="muted compact">
          선택한 로컬 PDF 경로는 이 기기에만 저장됩니다. Electron 앱에서만 자동 로드됩니다.
        </p>
        </div>
      </section>

      <section className={getSettingsPanelClass("privacy")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>개인정보</h2>
        </div>
        <ul className="settings-list">
          <li>데이터는 로컬 SQLite 파일에 저장됩니다.</li>
          <li>Google 번역 엔진을 사용할 경우 PDF 텍스트가 Google API로 전송됩니다.</li>
          <li>라이프 마이닝 자동 수집은 사용자가 켠 사이트에서만 작동합니다.</li>
          <li>전역 키로깅과 OS 입력 기록은 구현하지 않습니다.</li>
        </ul>
      </section>

      <section className={getSettingsPanelClass("export")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>내보내기 예정</h2>
        </div>
        <ul className="settings-list">
          <li>AnkiConnect 내보내기</li>
          <li>CSV/TSV 내보내기</li>
          <li>JSON 백업</li>
        </ul>
      </section>

      {isProfileSwitcherOpen ? (
        <SettingsProfileSwitcher
          activeProfileId={activeProfileId}
          profileStats={profileStats}
          profiles={profiles}
          onClose={() => setIsProfileSwitcherOpen(false)}
          onCreateProfile={createProfile}
          onOpenManager={() => openProfileManager()}
          onSelectProfile={selectProfile}
        />
      ) : null}
    </div>
  );
}
