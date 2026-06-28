import { Settings, Users } from "lucide-react";
import type { AppSettings, LearningProfileRecord } from "../shared/types";
import { getProfileInitials } from "./settingsPageUtils";

type SettingsProfileAccountPanelProps = {
  activeProfile: LearningProfileRecord | undefined;
  activeProfileStat?: {
    cardCount: number;
    dueCount: number;
  };
  settings: AppSettings;
  onOpenManager: () => void;
  onOpenSwitcher: () => void;
};

export function SettingsProfileAccountPanel({
  activeProfile,
  activeProfileStat,
  settings,
  onOpenManager,
  onOpenSwitcher
}: SettingsProfileAccountPanelProps) {
  return (
    <section className="settings-panel profile-account-panel">
      <div className="profile-account-main">
        <span className="profile-avatar large">{getProfileInitials(activeProfile)}</span>
        <div>
          <span className="profile-account-eyebrow">현재 학습 프로필</span>
          <h2>{activeProfile?.name ?? "프로필"}</h2>
          <p>
            {settings.learningProfile.targetLanguage.nameKo} →{" "}
            {settings.learningProfile.nativeLanguage.nameKo}
          </p>
        </div>
      </div>
      <div className="profile-account-stats" aria-label="현재 프로필 통계">
        <span>카드 {activeProfileStat?.cardCount ?? 0}</span>
        <span>복습 {activeProfileStat?.dueCount ?? 0}</span>
        <span>문서/복습 분리</span>
        <span>Life Log 공유</span>
      </div>
      <div className="profile-account-actions">
        <button
          className="button primary"
          data-qa="settings-profile-switch"
          type="button"
          onClick={onOpenSwitcher}
        >
          <Users size={17} />
          프로필 전환
        </button>
        <button
          className="button secondary"
          data-qa="settings-profile-manage"
          type="button"
          onClick={onOpenManager}
        >
          <Settings size={17} />
          프로필 관리
        </button>
      </div>
    </section>
  );
}
