import {
  FolderOpen,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import type { AppSettings, LifeMiningCaptureSettings } from "../shared/types";
import type { SettingsTabId } from "./settingsPageOptions";

type SettingsOverviewPanelProps = {
  lifeMiningCaptureSettings: LifeMiningCaptureSettings;
  settings: AppSettings;
  onSettingsTabChange: (tab: SettingsTabId) => void;
};

export function SettingsOverviewPanel({
  lifeMiningCaptureSettings,
  settings,
  onSettingsTabChange
}: SettingsOverviewPanelProps) {
  return (
    <section className="panel settings-overview-panel">
      <div className="panel-heading">
        <SlidersHorizontal size={19} />
        <h2>기본 설정 요약</h2>
      </div>
      <div className="settings-overview-grid">
        <button className="settings-overview-card" type="button" onClick={() => onSettingsTabChange("ai")}>
          <Sparkles size={18} />
          <strong>AI 카드 생성</strong>
          <span>{settings.providerName} · {settings.geminiModel || "모델 미설정"}</span>
        </button>
        <button className="settings-overview-card" type="button" onClick={() => onSettingsTabChange("capture")}>
          <MousePointer2 size={18} />
          <strong>캡처</strong>
          <span>{settings.captureShortcut || "Ctrl+Q"} · 라이프 마이닝 {lifeMiningCaptureSettings.preset}</span>
        </button>
        <button className="settings-overview-card" type="button" onClick={() => onSettingsTabChange("sync")}>
          <FolderOpen size={18} />
          <strong>동기화</strong>
          <span>{settings.cardSyncFolderPath.trim() ? "폴더 연결됨" : "폴더 미설정"}</span>
        </button>
        <button className="settings-overview-card" type="button" onClick={() => onSettingsTabChange("display")}>
          <Monitor size={18} />
          <strong>화면/실행</strong>
          <span>네비 숨김 · 트레이 · 자동 실행</span>
        </button>
      </div>
    </section>
  );
}
