import { Volume2 } from "lucide-react";
import type { AppSettings } from "../shared/types";
import { ttsModelPresets, ttsProviderPresets } from "./settingsPageOptions";

type SettingsTtsPanelProps = {
  className: string;
  settings: AppSettings;
  onSettingsChange: (next: Partial<AppSettings>) => void;
};

export function SettingsTtsPanel({
  className,
  settings,
  onSettingsChange
}: SettingsTtsPanelProps) {
  return (
    <section className={className}>
      <div className="panel-heading">
        <Volume2 size={19} />
        <h2>TTS</h2>
      </div>
      <label className="toggle-field">
        <input
          checked={settings.preGenerateCardTts}
          type="checkbox"
          onChange={(event) => onSettingsChange({ preGenerateCardTts: event.target.checked })}
        />
        <span>
          <strong>카드 저장 시 TTS 미리 생성</strong>
          <small>카드를 만들 때 오디오를 생성해 저장하고, 이후 복습에서 재사용합니다.</small>
        </span>
      </label>
      <div className="segmented-control">
        {ttsProviderPresets.map((preset) => (
          <button
            key={preset.value}
            className={settings.ttsProviderName === preset.value ? "active" : ""}
            type="button"
            onClick={() => onSettingsChange({ ttsProviderName: preset.value })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="muted compact">
        {ttsProviderPresets.find((preset) => preset.value === settings.ttsProviderName)
          ?.description ?? "TTS 엔진을 선택합니다."}
      </p>
      <label className="field-label">
        TTS 모델
        <input
          className="text-input"
          value={settings.ttsModel}
          onChange={(event) => onSettingsChange({ ttsModel: event.target.value })}
        />
      </label>
      <div className="model-preset-grid" aria-label="TTS 모델 프리셋">
        {ttsModelPresets.map((preset) => (
          <button
            key={preset.value}
            className={
              settings.ttsModel === preset.value
                ? "model-preset-button active"
                : "model-preset-button"
            }
            type="button"
            onClick={() => onSettingsChange({ ttsModel: preset.value })}
          >
            <strong>{preset.label}</strong>
            <span>{preset.value}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
      <div className="settings-two-column">
        <label className="field-label">
          음성 이름
          <input
            className="text-input"
            placeholder="비워두면 기본 음성"
            value={settings.ttsVoiceName}
            onChange={(event) => onSettingsChange({ ttsVoiceName: event.target.value })}
          />
        </label>
        <label className="field-label">
          속도
          <input
            className="text-input"
            max={10}
            min={-10}
            type="number"
            value={settings.ttsRate}
            onChange={(event) => onSettingsChange({ ttsRate: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
      <p className="muted compact">
        나중에 원하는 목소리를 고르는 기능은 이 음성 이름과 모델 필드를 확장해서 붙입니다.
        현재 기본값은 PC에 설치된 Windows 음성을 사용하는 가장 가벼운 로컬 방식입니다.
      </p>
    </section>
  );
}
