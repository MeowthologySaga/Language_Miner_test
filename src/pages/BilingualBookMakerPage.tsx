import { PDFSelectionReader } from "../components/PDFSelectionReader";
import type { LocalEnglishMinerApi } from "../data/api";
import type { AppSettings, BilingualReaderArtifact } from "../shared/types";

type BilingualBookMakerPageProps = {
  api: LocalEnglishMinerApi;
  settings: AppSettings;
  onKeepAliveChange?: (shouldKeepAlive: boolean) => void;
  onOpenReaderArtifact: (artifact: BilingualReaderArtifact) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function BilingualBookMakerPage({
  api,
  settings,
  onKeepAliveChange,
  onOpenReaderArtifact,
  onSettingsChange
}: BilingualBookMakerPageProps) {
  return (
    <div className="document-page maker-wizard-page">
      <div className="maker-workspace-shell">
        <PDFSelectionReader
          api={api}
          mode="maker"
          settings={settings}
          onMakerKeepAliveChange={onKeepAliveChange}
          onOpenReaderArtifact={onOpenReaderArtifact}
          onSettingsChange={onSettingsChange}
        />
      </div>
    </div>
  );
}
