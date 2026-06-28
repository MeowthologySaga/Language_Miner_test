import { Plus, Settings, X } from "lucide-react";
import type { LearningProfileRecord, ProfileId } from "../shared/types";
import { getProfileInitials } from "./settingsPageUtils";

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

type SettingsProfileSwitcherProps = {
  activeProfileId: ProfileId;
  profileStats: ProfileStats;
  profiles: LearningProfileRecord[];
  onClose: () => void;
  onCreateProfile: () => void;
  onOpenManager: () => void;
  onSelectProfile: (profileId: ProfileId) => void;
};

export function SettingsProfileSwitcher({
  activeProfileId,
  profileStats,
  profiles,
  onClose,
  onCreateProfile,
  onOpenManager,
  onSelectProfile
}: SettingsProfileSwitcherProps) {
  return (
    <div className="profile-switch-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="프로필 전환"
        className="profile-switch-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-switch-modal-heading">
          <div>
            <span>계정 전환처럼 빠르게</span>
            <h2>프로필 전환</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="profile-switch-list">
          {profiles.map((profile) => {
            const stat = profileStats[profile.id];
            const isActive = profile.id === activeProfileId;
            return (
              <button
                className={isActive ? "active" : ""}
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile.id)}
              >
                <span className="profile-avatar large">{getProfileInitials(profile)}</span>
                <span className="profile-switch-body">
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.learningProfile.targetLanguage.nameKo} →{" "}
                    {profile.learningProfile.nativeLanguage.nameKo}
                  </small>
                  <small>
                    카드 {stat?.cardCount ?? 0} · 복습 {stat?.dueCount ?? 0}
                  </small>
                </span>
                {isActive ? <span className="active-profile-badge">현재</span> : null}
              </button>
            );
          })}
        </div>
        <div className="profile-switch-actions">
          <button className="button secondary" type="button" onClick={onCreateProfile}>
            <Plus size={17} />새 프로필
          </button>
          <button className="button primary" type="button" onClick={onOpenManager}>
            <Settings size={17} />
            프로필 관리
          </button>
        </div>
      </section>
    </div>
  );
}
