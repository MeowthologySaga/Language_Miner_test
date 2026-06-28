import { CheckCircle2, Settings } from "lucide-react";
import type { AppSettings, ProviderName } from "../shared/types";
import {
  getSettingsStatusClassName
} from "./settingsPageUtils";
import { ollamaModelPresets } from "./settingsPageOptions";

type SettingsCardEnginePanelProps = {
  className: string;
  connectionStatus: string;
  isTestingConnection: boolean;
  settings: AppSettings;
  onSettingsChange: (next: Partial<AppSettings>) => void;
  onTestConnection: () => void;
};

export function SettingsCardEnginePanel({
  className,
  connectionStatus,
  isTestingConnection,
  settings,
  onSettingsChange,
  onTestConnection
}: SettingsCardEnginePanelProps) {
  return (
    <section className={className}>
      <div className="panel-heading">
        <Settings size={19} />
        <h2>카드 생성 모델</h2>
      </div>
      <div className="segmented-control">
        {(["mock", "ollama", "gemini"] as ProviderName[]).map((providerName) => (
          <button
            key={providerName}
            className={settings.providerName === providerName ? "active" : ""}
            type="button"
            onClick={() => onSettingsChange({ providerName })}
          >
            {providerName}
          </button>
        ))}
      </div>
      <p className="muted compact">
        이 모델은 단어카드/문장카드 JSON 생성에 사용됩니다. PDF 번역 엔진과는 분리되어 있습니다.
      </p>
      {settings.providerName === "gemini" ? (
        <p className="status-text compact">
          Gemini 카드 생성: API 및 사용량 섹션의 Gemini API 키/모델을 사용합니다.
        </p>
      ) : null}
      <label className="field-label">
        Ollama baseUrl
        <input
          className="text-input"
          value={settings.ollamaBaseUrl}
          onChange={(event) => onSettingsChange({ ollamaBaseUrl: event.target.value })}
        />
      </label>
      <label className="field-label">
        Ollama 모델
        <input
          className="text-input"
          value={settings.ollamaModel}
          onChange={(event) => onSettingsChange({ ollamaModel: event.target.value })}
        />
      </label>
      <div className="model-preset-grid" aria-label="Ollama 모델 프리셋">
        {ollamaModelPresets.map((preset) => (
          <button
            key={preset.value}
            className={
              settings.ollamaModel === preset.value
                ? "model-preset-button active"
                : "model-preset-button"
            }
            type="button"
            onClick={() => onSettingsChange({ ollamaModel: preset.value })}
          >
            <strong>{preset.label}</strong>
            <span>{preset.value}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
      <button
        className="button secondary"
        data-qa="settings-card-engine-test"
        disabled={isTestingConnection}
        type="button"
        onClick={onTestConnection}
      >
        <CheckCircle2 size={18} />
        {isTestingConnection ? "확인 중" : "연결 테스트"}
      </button>
      {connectionStatus ? (
        <p className={getSettingsStatusClassName(connectionStatus)}>{connectionStatus}</p>
      ) : null}
    </section>
  );
}
