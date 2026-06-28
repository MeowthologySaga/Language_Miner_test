import { BilingualArtifactReader } from "../components/BilingualArtifactReader";
import { PDFSelectionReader } from "../components/PDFSelectionReader";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import type { AppSettings, BilingualReaderArtifact } from "../shared/types";
import { useState } from "react";

type PdfReaderPageProps = {
  api: LocalEnglishMinerApi;
  artifact: BilingualReaderArtifact | null;
  provider: LLMProvider;
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
  onSettingsChange: (settings: AppSettings) => void;
};

export function PdfReaderPage({
  api,
  artifact,
  provider,
  settings,
  onCardsChanged,
  onSettingsChange
}: PdfReaderPageProps) {
  const [readerMode, setReaderMode] = useState<"finished" | "live">("finished");
  const modeTabs = (
    <div className="segmented-control reader-mode-tabs">
      <button
        className={readerMode === "finished" ? "active" : ""}
        data-qa="pdf-reader-finished-tab"
        type="button"
        onClick={() => setReaderMode("finished")}
      >
        Reader
      </button>
      <button
        className={readerMode === "live" ? "active" : ""}
        data-qa="pdf-reader-live-tab"
        type="button"
        onClick={() => setReaderMode("live")}
      >
        Live Translate
      </button>
    </div>
  );

  return (
    <div className="document-workspace reader-workspace">
      <div className={`reader-mode-shell reader-mode-shell-${readerMode}`}>
        {readerMode === "finished" ? (
          <BilingualArtifactReader
            api={api}
            artifact={artifact}
            provider={provider}
            settings={settings}
            onCardsChanged={onCardsChanged}
            onOpenLiveTranslate={() => setReaderMode("live")}
            modeTabs={modeTabs}
          />
        ) : (
          <>
            <div className="reader-mode-header">
              <div>
                <strong>Reader</strong>
                <span>Live PDF translation</span>
              </div>
              {modeTabs}
            </div>
            <PDFSelectionReader
              api={api}
              mode="reader"
              provider={provider}
              settings={settings}
              onCardsChanged={onCardsChanged}
              onSettingsChange={onSettingsChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
