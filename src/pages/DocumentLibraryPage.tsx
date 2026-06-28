import {
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  History,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LocalEnglishMinerApi } from "../data/api";
import type {
  AppSettings,
  BilingualExportHistoryRecord,
  BilingualReaderArtifact,
  RecentDocumentRecord
} from "../shared/types";

type DocumentLibraryRoute = "pdfReader" | "bookMaker" | "exportHistory";
type DocumentFilter = "all" | "recent" | "exports" | "debug";

type DocumentLibraryPageProps = {
  api: LocalEnglishMinerApi;
  settings: AppSettings;
  recentDocuments: RecentDocumentRecord[];
  onNavigate: (route: DocumentLibraryRoute) => void;
  onOpenReaderArtifact: (
    artifact: BilingualReaderArtifact,
    source?: RecentDocumentRecord["source"]
  ) => void;
  onRecentDocumentsChange: (records: RecentDocumentRecord[]) => void;
};

type LibraryDocument = {
  id: string;
  title: string;
  filePath: string;
  fileType: "pdf" | "html";
  pageCount: number;
  sourceLabel: string;
  translationLabel: string;
  source: RecentDocumentRecord["source"];
  isRecent: boolean;
  lastOpenedAt: string;
  createdAt: string;
  exportRecord?: BilingualExportHistoryRecord;
};

export function DocumentLibraryPage({
  api,
  settings,
  recentDocuments,
  onNavigate,
  onOpenReaderArtifact,
  onRecentDocumentsChange
}: DocumentLibraryPageProps) {
  const [exportRecords, setExportRecords] = useState<BilingualExportHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [revealingDocumentId, setRevealingDocumentId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadExportRecords();
  }, [api]);

  const documents = useMemo(
    () => buildLibraryDocuments(recentDocuments, exportRecords, settings),
    [exportRecords, recentDocuments, settings]
  );
  const filteredDocuments = useMemo(
    () => filterLibraryDocuments(documents, filter, query),
    [documents, filter, query]
  );
  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0];

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedId("");
      return;
    }
    if (selectedDocument.id !== selectedId) {
      setSelectedId(selectedDocument.id);
    }
  }, [selectedDocument, selectedId]);

  async function loadExportRecords() {
    setIsLoading(true);
    setError("");
    try {
      setExportRecords(await api.documents.listExportRecords());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "최근 문서를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function openDocumentInReader(document: LibraryDocument) {
    onOpenReaderArtifact(libraryDocumentToArtifact(document), document.source);
  }

  async function pickAndOpenDocument() {
    setIsPickingFile(true);
    setStatus("");
    setError("");
    try {
      const artifact = await api.documents.pickReaderArtifact();
      if (!artifact) {
        setStatus("파일 선택이 취소됐거나 이 실행 환경에서는 파일 선택을 지원하지 않습니다.");
        return;
      }

      onOpenReaderArtifact(
        {
          ...artifact,
          sourceLabel: settings.learningProfile.targetLanguage.nameEn,
          translationLabel: settings.learningProfile.nativeLanguage.nameEn
        },
        "manual"
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문서를 추가하지 못했습니다.");
    } finally {
      setIsPickingFile(false);
    }
  }

  async function revealDocument(document: LibraryDocument) {
    setStatus("");
    setError("");
    setRevealingDocumentId(document.id);
    try {
      const revealed = await api.documents.revealPath(document.filePath);
      if (!revealed) {
        throw new Error("이 실행 환경에서는 파일 위치 열기를 지원하지 않습니다.");
      }
      setStatus(`파일 위치를 열었습니다: ${document.filePath}`);
    } catch (caught) {
      setError(formatDocumentActionError("파일 위치 열기", document, caught));
    } finally {
      setRevealingDocumentId("");
    }
  }

  function removeFromRecent(document: LibraryDocument) {
    setError("");
    onRecentDocumentsChange(
      recentDocuments.filter(
        (record) => !sameDocument(record.filePath, document.filePath, record.fileType, document.fileType)
      )
    );
    setStatus("최근 문서 기록에서 제거했습니다.");
  }

  function clearRecentDocuments() {
    setError("");
    onRecentDocumentsChange([]);
    setStatus("최근 문서 기록을 비웠습니다. 내보내기 기록은 유지됩니다.");
  }

  return (
    <div className="document-page library-page">
      <div className="document-library-layout">
        <aside className="document-filter-rail">
          <h2>최근 문서</h2>
          <button
            className={filter === "all" ? "active" : ""}
            type="button"
            onClick={() => setFilter("all")}
          >
            <FileText size={16} />
            전체 문서
            <span>{documents.length}</span>
          </button>
          <button
            className={filter === "recent" ? "active" : ""}
            type="button"
            onClick={() => setFilter("recent")}
          >
            <Clock size={16} />
            최근에 연 문서
            <span>{recentDocuments.length}</span>
          </button>
          <button
            className={filter === "exports" ? "active" : ""}
            type="button"
            onClick={() => setFilter("exports")}
          >
            <History size={16} />
            내보내기 결과
            <span>{exportRecords.length}</span>
          </button>
          {settings.debugMode && settings.debugPdfPath.trim() ? (
            <button
              className={filter === "debug" ? "active" : ""}
              type="button"
              onClick={() => setFilter("debug")}
            >
              <FileText size={16} />
              디버그 PDF
            </button>
          ) : null}

          <div className="document-filter-section">
            <span>작업</span>
            <button
              data-qa="document-library-add-file"
              type="button"
              onClick={() => void pickAndOpenDocument()}
            >
              {isPickingFile ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              파일 추가
            </button>
            <button
              data-qa="document-library-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              <Languages size={16} />
              이중언어 책 만들기
            </button>
            <button
              data-qa="document-library-open-export-history"
              type="button"
              onClick={() => onNavigate("exportHistory")}
            >
              <History size={16} />
              내보내기 기록
            </button>
            <button data-qa="document-library-refresh" type="button" onClick={() => void loadExportRecords()}>
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
        </aside>

        <section className="document-table-panel">
          <div className="document-table-toolbar">
            <label className="document-search">
              <Search size={15} />
              <input
                placeholder="문서명 또는 경로 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              className="button primary"
              data-qa="document-library-add-file-toolbar"
              disabled={isPickingFile}
              type="button"
              onClick={() => void pickAndOpenDocument()}
            >
              {isPickingFile ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              파일 추가
            </button>
          </div>

          {status ? <p className="success-text">{status}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="document-card-list" role="list" aria-label="최근 문서 목록">
            {isLoading ? (
              <div className="empty-document-state">
                <Loader2 className="spin" size={30} />
                <strong>최근 문서 불러오는 중</strong>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="empty-document-state">
                <FileText size={30} />
                <strong>표시할 문서가 없습니다</strong>
                <button
                  className="button secondary"
                  data-qa="document-library-add-file-empty"
                  type="button"
                  onClick={() => void pickAndOpenDocument()}
                >
                  파일 추가
                </button>
              </div>
            ) : (
              filteredDocuments.map((document) => (
                <button
                  aria-pressed={selectedDocument?.id === document.id}
                  className={`document-file-card${selectedDocument?.id === document.id ? " selected" : ""}`}
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedId(document.id)}
                  onDoubleClick={() => openDocumentInReader(document)}
                >
                  <span className="document-file-card-icon">
                    <FileText size={18} />
                  </span>
                  <span className="document-file-card-main">
                    <span className="document-file-card-title">{document.title}</span>
                    <span className="document-file-card-path" title={document.filePath}>
                      {document.filePath}
                    </span>
                    <span className="document-file-card-meta">
                      <span>{document.fileType.toUpperCase()}</span>
                      <span>{formatPageBadge(document.pageCount)}</span>
                      <span>{sourceLabel(document.source)}</span>
                      <span>최근 {formatDate(document.lastOpenedAt)}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="document-detail-panel">
          {selectedDocument ? (
            <>
              <div className="document-detail-title">
                <FileText size={34} />
                <strong>{selectedDocument.title}</strong>
                <span>{sourceLabel(selectedDocument.source)}</span>
              </div>
              <dl>
                <div>
                  <dt>경로</dt>
                  <dd title={selectedDocument.filePath}>{selectedDocument.filePath}</dd>
                </div>
                <div>
                  <dt>형식</dt>
                  <dd>{selectedDocument.fileType.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>페이지</dt>
                  <dd>{formatPageCount(selectedDocument.pageCount)}</dd>
                </div>
                <div>
                  <dt>언어</dt>
                  <dd>
                    {selectedDocument.sourceLabel} / {selectedDocument.translationLabel}
                  </dd>
                </div>
                <div>
                  <dt>최근 열기</dt>
                  <dd>{formatDateTime(selectedDocument.lastOpenedAt)}</dd>
                </div>
              </dl>
              <div className="document-detail-actions">
                <button
                  className="button primary reader-action"
                  data-qa="document-library-open-selected-reader"
                  type="button"
                  onClick={() => openDocumentInReader(selectedDocument)}
                >
                  <BookOpen size={17} />
                  리더에서 열기
                </button>
                <button
                  className="button primary maker-action"
                  data-qa="document-library-open-selected-book-maker"
                  type="button"
                  onClick={() => onNavigate("bookMaker")}
                >
                  <Languages size={17} />
                  이중언어 책 만들기
                </button>
                <button
                  className="button secondary"
                  disabled={revealingDocumentId === selectedDocument.id}
                  type="button"
                  onClick={() => void revealDocument(selectedDocument)}
                >
                  {revealingDocumentId === selectedDocument.id ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <FolderOpen size={17} />
                  )}
                  {revealingDocumentId === selectedDocument.id ? "여는 중" : "파일 위치 열기"}
                </button>
                <button className="button secondary" type="button" onClick={() => removeFromRecent(selectedDocument)}>
                  <Trash2 size={17} />
                  최근 기록에서 제거
                </button>
                <button className="button secondary" type="button" onClick={clearRecentDocuments}>
                  최근 기록 비우기
                </button>
              </div>
            </>
          ) : (
            <div className="empty-document-state">
              <FileText size={30} />
              <strong>문서를 선택하세요</strong>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function buildLibraryDocuments(
  recentDocuments: RecentDocumentRecord[],
  exportRecords: BilingualExportHistoryRecord[],
  settings: AppSettings
) {
  const documents = new Map<string, LibraryDocument>();

  for (const record of exportRecords) {
    addLibraryDocument(documents, exportRecordToDocument(record));
  }
  if (settings.debugMode && settings.debugPdfPath.trim()) {
    addLibraryDocument(documents, debugPathToDocument(settings));
  }
  for (const record of recentDocuments) {
    addLibraryDocument(documents, recentRecordToDocument(record));
  }

  return Array.from(documents.values()).sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  );
}

function addLibraryDocument(target: Map<string, LibraryDocument>, document: LibraryDocument) {
  const key = documentKey(document.filePath, document.fileType);
  const existing = target.get(key);
  if (!existing) {
    target.set(key, document);
    return;
  }

  target.set(key, {
    ...existing,
    ...document,
    id: existing.id || document.id,
    exportRecord: existing.exportRecord ?? document.exportRecord,
    isRecent: existing.isRecent || document.isRecent,
    lastOpenedAt:
      existing.lastOpenedAt.localeCompare(document.lastOpenedAt) > 0
        ? existing.lastOpenedAt
        : document.lastOpenedAt,
    createdAt:
      existing.createdAt.localeCompare(document.createdAt) < 0
        ? existing.createdAt
        : document.createdAt
  });
}

function filterLibraryDocuments(
  documents: LibraryDocument[],
  filter: DocumentFilter,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return documents.filter((document) => {
    if (filter === "recent" && !document.isRecent) {
      return false;
    }
    if (filter === "exports" && !document.exportRecord) {
      return false;
    }
    if (filter === "debug" && document.source !== "debug") {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return `${document.title} ${document.filePath}`.toLowerCase().includes(normalizedQuery);
  });
}

function exportRecordToDocument(record: BilingualExportHistoryRecord): LibraryDocument {
  return {
    id: `export-${record.id}`,
    title: record.title || basename(record.filePath),
    filePath: record.filePath,
    fileType: record.fileType,
    pageCount: record.pageCount,
    sourceLabel: record.sourceLanguageLabel,
    translationLabel: record.targetLanguageLabel,
    source: "export",
    isRecent: false,
    lastOpenedAt: record.createdAt,
    createdAt: record.createdAt,
    exportRecord: record
  };
}

function recentRecordToDocument(record: RecentDocumentRecord): LibraryDocument {
  return {
    id: `recent-${record.id}`,
    title: record.title || basename(record.filePath),
    filePath: record.filePath,
    fileType: record.fileType,
    pageCount: record.pageCount,
    sourceLabel: record.sourceLabel,
    translationLabel: record.translationLabel,
    source: record.source,
    isRecent: true,
    lastOpenedAt: record.lastOpenedAt,
    createdAt: record.createdAt
  };
}

function debugPathToDocument(settings: AppSettings): LibraryDocument {
  const now = new Date().toISOString();
  return {
    id: `debug-${settings.debugPdfPath}`,
    title: basename(settings.debugPdfPath),
    filePath: settings.debugPdfPath,
    fileType: "pdf",
    pageCount: 0,
    sourceLabel: settings.learningProfile.targetLanguage.nameEn,
    translationLabel: settings.learningProfile.nativeLanguage.nameEn,
    source: "debug",
    isRecent: false,
    lastOpenedAt: now,
    createdAt: now
  };
}

function libraryDocumentToArtifact(document: LibraryDocument): BilingualReaderArtifact {
  return {
    id: document.exportRecord?.id ?? document.id,
    title: document.title,
    filePath: document.filePath,
    fileType: document.fileType,
    sourceLabel: document.sourceLabel,
    translationLabel: document.translationLabel,
    pageCount: document.pageCount,
    createdAt: document.createdAt
  };
}

function sameDocument(
  leftPath: string,
  rightPath: string,
  leftFileType: "pdf" | "html",
  rightFileType: "pdf" | "html"
) {
  return documentKey(leftPath, leftFileType) === documentKey(rightPath, rightFileType);
}

function documentKey(filePath: string, fileType: "pdf" | "html") {
  return `${fileType}:${filePath.trim().toLowerCase()}`;
}

function basename(filePath: string) {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

function formatPageCount(pageCount: number) {
  return pageCount > 0 ? `${pageCount}` : "-";
}

function formatPageBadge(pageCount: number) {
  return pageCount > 0 ? `${pageCount}p` : "페이지 -";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function sourceLabel(source: RecentDocumentRecord["source"]) {
  if (source === "export") {
    return "내보내기 결과";
  }
  if (source === "manual") {
    return "직접 추가";
  }
  if (source === "debug") {
    return "디버그 문서";
  }
  return "최근 열기";
}

function formatDocumentActionError(
  actionLabel: string,
  document: LibraryDocument,
  error: unknown
) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "작업에 실패했습니다.";
  return `${actionLabel} 실패: ${document.title || document.filePath} (${document.filePath}) - ${message}`;
}
