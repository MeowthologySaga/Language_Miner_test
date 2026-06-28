import { Download, Loader2 } from "lucide-react";

type PendingModelDownloadPrompt = {
  model: string;
};

type PendingOllamaSetupPrompt = {
  baseUrl: string;
  model: string;
};

type PdfReaderRuntimeDialogsProps = {
  isDownloadingModel: boolean;
  ollamaDownloadUrl: string;
  pendingModelDownload: PendingModelDownloadPrompt | null;
  pendingOllamaSetup: PendingOllamaSetupPrompt | null;
  onDismissModelDownload: () => void;
  onDismissOllamaSetup: () => void;
  onDownloadMissingModel: () => void;
  onRetryOllamaSetup: () => void;
};

export function PdfReaderRuntimeDialogs({
  isDownloadingModel,
  ollamaDownloadUrl,
  pendingModelDownload,
  pendingOllamaSetup,
  onDismissModelDownload,
  onDismissOllamaSetup,
  onDownloadMissingModel,
  onRetryOllamaSetup
}: PdfReaderRuntimeDialogsProps) {
  return (
    <>
      {pendingModelDownload ? (
        <div
          aria-labelledby="model-download-title"
          aria-modal="true"
          className="model-download-backdrop"
          role="dialog"
        >
          <div className="model-download-dialog">
            <div className="model-download-icon">
              {isDownloadingModel ? (
                <Loader2 className="spin" size={22} />
              ) : (
                <Download size={22} />
              )}
            </div>
            <h3 id="model-download-title">번역모델이 없습니다. 다운로드 할까요?</h3>
            <p>
              선택된 모델 <strong>{pendingModelDownload.model}</strong>이 로컬 Ollama에
              설치되어 있지 않습니다.
            </p>
            <div className="model-download-actions">
              <button
                className="button primary"
                disabled={isDownloadingModel}
                type="button"
                onClick={onDownloadMissingModel}
              >
                {isDownloadingModel ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                다운로드
              </button>
              <button
                className="button ghost"
                disabled={isDownloadingModel}
                type="button"
                onClick={onDismissModelDownload}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingOllamaSetup ? (
        <div
          aria-labelledby="ollama-setup-title"
          aria-modal="true"
          className="model-download-backdrop"
          role="dialog"
        >
          <div className="model-download-dialog">
            <div className="model-download-icon">
              <Download size={22} />
            </div>
            <h3 id="ollama-setup-title">Ollama가 필요합니다</h3>
            <p>로컬 번역을 쓰려면 Ollama가 설치되어 있고 실행 중이어야 합니다.</p>
            <div className="model-download-steps">
              <span>1. Ollama 설치</span>
              <span>2. Ollama 앱 실행</span>
              <span>3. 다시 확인</span>
            </div>
            <p className="compact">
              baseUrl: <strong>{pendingOllamaSetup.baseUrl}</strong>
              <br />
              model: <strong>{pendingOllamaSetup.model}</strong>
            </p>
            <div className="model-download-actions">
              <a className="button primary" href={ollamaDownloadUrl} rel="noreferrer" target="_blank">
                <Download size={16} />
                Ollama 다운로드
              </a>
              <button className="button secondary" type="button" onClick={onRetryOllamaSetup}>
                다시 확인
              </button>
              <button className="button ghost" type="button" onClick={onDismissOllamaSetup}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
