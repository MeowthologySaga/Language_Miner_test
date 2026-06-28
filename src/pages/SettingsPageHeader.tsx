import { Search } from "lucide-react";
import {
  settingsTabOptions,
  type SettingsMode,
  type SettingsTabId
} from "./settingsPageOptions";

type SettingsPageHeaderProps = {
  activeSettingsTab: SettingsTabId;
  normalizedSettingsSearch: string;
  settingsMode: SettingsMode;
  settingsSearch: string;
  onSettingsModeChange: (mode: SettingsMode) => void;
  onSettingsSearchChange: (value: string) => void;
  onSettingsTabChange: (tab: SettingsTabId) => void;
};

export function SettingsPageHeader({
  activeSettingsTab,
  normalizedSettingsSearch,
  settingsMode,
  settingsSearch,
  onSettingsModeChange,
  onSettingsSearchChange,
  onSettingsTabChange
}: SettingsPageHeaderProps) {
  return (
    <section className="panel settings-page-header">
      <div className="settings-page-title-row">
        <div>
          <span className="profile-account-eyebrow">앱 설정</span>
          <h1>설정</h1>
          <p>자주 쓰는 항목은 기본에 두고, 세부 옵션은 탭별로 나눴습니다.</p>
        </div>
        <label className="settings-search">
          <Search size={16} />
          <input
            aria-label="설정 검색"
            placeholder="설정 검색"
            value={settingsSearch}
            onChange={(event) => onSettingsSearchChange(event.target.value)}
          />
        </label>
      </div>
      <div className="settings-tab-row" role="tablist" aria-label="설정 분류">
        {settingsTabOptions.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeSettingsTab === tab.id && !normalizedSettingsSearch;
          return (
            <button
              aria-selected={isActive}
              className={isActive ? "active" : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => {
                onSettingsTabChange(tab.id);
                onSettingsSearchChange("");
              }}
            >
              <TabIcon size={16} />
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="settings-mode-row">
        <div className="segmented-control compact">
          {(["basic", "advanced"] as SettingsMode[]).map((mode) => (
            <button
              className={settingsMode === mode ? "active" : ""}
              key={mode}
              type="button"
              onClick={() => onSettingsModeChange(mode)}
            >
              {mode === "basic" ? "기본 설정" : "고급 설정"}
            </button>
          ))}
        </div>
        {normalizedSettingsSearch ? (
          <span className="settings-search-status">검색 결과: {settingsSearch}</span>
        ) : (
          <span className="settings-search-status">
            {activeSettingsTab === "basic"
              ? settingsMode === "basic"
                ? "필수 항목만 표시"
                : "기본 탭의 세부 항목 표시"
              : `${settingsTabOptions.find((tab) => tab.id === activeSettingsTab)?.label ?? "현재 탭"} 설정 표시`}
          </span>
        )}
      </div>
    </section>
  );
}
