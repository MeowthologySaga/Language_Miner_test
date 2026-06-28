import { BookOpen, Download, ExternalLink, FileText, FolderOpen, Languages, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { BilingualExportHistoryRecord, BilingualReaderArtifact } from "../shared/types";

type ExportHistoryPageProps = {
  api: LocalEnglishMinerApi;
  onNavigate: (route: "bookMaker" | "documentLibrary") => void;
  onOpenReaderArtifact: (artifact: BilingualReaderArtifact) => void;
};

type ExportRecordAction = "open" | "reveal" | "redownload";

export function ExportHistoryPage({
  api,
  onNavigate,
  onOpenReaderArtifact
}: ExportHistoryPageProps) {
  const [records, setRecords] = useState<BilingualExportHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyRecordId, setBusyRecordId] = useState("");
  const [busyAction, setBusyAction] = useState<ExportRecordAction | "">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadRecords();
  }, [api]);

  async function loadRecords() {
    setIsLoading(true);
    setError("");
    try {
      setRecords(await api.documents.listExportRecords());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "내보내기 기록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function openRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "open", async () => {
      const opened = await api.documents.openPath(record.filePath);
      if (!opened) {
        throw new Error("이 실행 환경에서는 저장된 파일을 직접 열 수 없습니다.");
      }
      return `파일을 열었습니다: ${record.filePath}`;
    });
  }

  async function revealRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "reveal", async () => {
      const revealed = await api.documents.revealPath(record.filePath);
      if (!revealed) {
        throw new Error("이 실행 환경에서는 저장 폴더를 직접 열 수 없습니다.");
      }
      return `파일 위치를 열었습니다: ${record.filePath}`;
    });
  }

  async function redownloadRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "redownload", async () => {
      const result = await api.documents.redownloadExport(record);
      const createdAt = new Date().toISOString();
      const savedRecord = await api.documents.saveExportRecord({
        ...record,
        id: `${createdAt}-${result.filePath}`,
        filePath: result.filePath,
        fileType: result.fileType,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        createdAt
      });
      setRecords((previous) => [
        savedRecord,
        ...previous.filter((candidate) => candidate.id !== savedRecord.id)
      ]);
      return `재다운로드 완료: ${result.filePath}`;
    });
  }

  function openRecordInReader(record: BilingualExportHistoryRecord) {
    onOpenReaderArtifact({
      id: record.id,
      title: record.title,
      filePath: record.filePath,
      fileType: record.fileType,
      sourceLabel: record.sourceLanguageLabel,
      translationLabel: record.targetLanguageLabel,
      pageCount: record.pageCount,
      createdAt: record.createdAt
    });
  }

  async function runRecordAction(
    record: BilingualExportHistoryRecord,
    actionName: ExportRecordAction,
    action: () => Promise<string | void>
  ) {
    setBusyRecordId(record.id);
    setBusyAction(actionName);
    setStatus("");
    setError("");
    try {
      const nextStatus = await action();
      if (nextStatus) {
        setStatus(nextStatus);
      }
    } catch (caught) {
      setError(formatExportRecordActionError(actionName, record, caught));
    } finally {
      setBusyRecordId("");
      setBusyAction("");
    }
  }

  return (
    <div className="document-page export-history-page">
      <section className="export-history-panel">
        <div className="document-section-heading">
          <div>
            <h2>내보내기 기록</h2>
            <p>완성된 이중언어 PDF/HTML을 다시 열거나 재다운로드합니다.</p>
          </div>
          <div className="export-history-heading-actions">
            <button
              className="button secondary"
              data-qa="export-history-refresh"
              type="button"
              onClick={() => void loadRecords()}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
            <button
              className="button primary maker-action"
              data-qa="export-history-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              <Languages size={17} />
              새로 만들기
            </button>
          </div>
        </div>

        {status ? <p className="success-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {isLoading ? (
          <EmptyState
            className="document-empty-state"
            icon={<Loader2 className="spin" size={24} />}
            title="기록 불러오는 중"
          />
        ) : records.length === 0 ? (
          <EmptyState
            className="document-empty-state"
            data-qa="export-history-empty-state"
            description="완성한 이중언어 PDF와 HTML이 여기에 쌓입니다."
            icon={<FileText size={24} />}
            title="아직 내보낸 문서가 없습니다"
            actions={
              <>
                <button
                  className="button primary maker-action"
                  type="button"
                  onClick={() => onNavigate("bookMaker")}
                >
                  <Languages size={16} />
                  새로 만들기
                </button>
                <button
                  className="button secondary"
                  data-qa="export-history-open-library"
                  type="button"
                  onClick={() => onNavigate("documentLibrary")}
                >
                  문서 라이브러리
                </button>
              </>
            }
          />
        ) : (
          <div className="export-history-list">
            {records.map((record) => {
              const isBusy = busyRecordId === record.id;
              const recordBusyAction = isBusy ? busyAction : "";
              return (
                <article className="export-history-record" key={record.id}>
                  <div className="export-history-record-main">
                    <FileText size={22} />
                    <div>
                      <strong>{record.title}</strong>
                      <span>{record.filePath}</span>
                    </div>
                  </div>
                  <div className="export-history-record-meta">
                    <span>{record.pageRange} 범위</span>
                    <span>{record.fileType.toUpperCase()}</span>
                    <span>{record.pageCount}페이지</span>
                    <span>{record.segmentCount}세그먼트</span>
                    <span>{record.providerLabel}</span>
                    <span>{formatExportRecordDate(record.createdAt)}</span>
                  </div>
                  <div className="export-history-record-actions">
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void openRecord(record)}>
                      {recordBusyAction === "open" ? <Loader2 className="spin" size={14} /> : <ExternalLink size={14} />}
                      {recordBusyAction === "open" ? "여는 중" : "열기"}
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void redownloadRecord(record)}>
                      {recordBusyAction === "redownload" ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
                      {recordBusyAction === "redownload" ? "재다운 중" : "재다운"}
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => openRecordInReader(record)}>
                      <BookOpen size={14} />
                      리더기
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void revealRecord(record)}>
                      {recordBusyAction === "reveal" ? <Loader2 className="spin" size={14} /> : <FolderOpen size={14} />}
                      {recordBusyAction === "reveal" ? "여는 중" : "폴더"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function formatExportRecordDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatExportRecordActionError(
  actionName: ExportRecordAction,
  record: BilingualExportHistoryRecord,
  error: unknown
) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "내보내기 기록 작업에 실패했습니다.";
  return `${getExportRecordActionLabel(actionName)} 실패: ${record.title || record.filePath} (${record.filePath}) - ${message}`;
}

function getExportRecordActionLabel(actionName: ExportRecordAction) {
  if (actionName === "open") {
    return "파일 열기";
  }
  if (actionName === "reveal") {
    return "폴더 열기";
  }
  return "재다운로드";
}
