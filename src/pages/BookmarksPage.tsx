import { BookOpen, Bookmark, Files } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

type BookmarksPageProps = {
  onNavigate: (route: "documentLibrary" | "pdfReader") => void;
};

export function BookmarksPage({ onNavigate }: BookmarksPageProps) {
  return (
    <div className="document-page export-history-page">
      <section className="export-history-panel">
        <div className="document-section-heading">
          <h2>북마크</h2>
          <button
            className="button primary reader-action"
            data-qa="bookmarks-open-reader"
            type="button"
            onClick={() => onNavigate("pdfReader")}
          >
            리더기 열기
          </button>
        </div>
        <EmptyState
          className="document-empty-state"
          data-qa="bookmarks-empty-state"
          description="PDF를 읽다가 다시 볼 위치를 저장하면 여기에 모입니다."
          icon={<Bookmark size={24} />}
          title="저장된 북마크가 없습니다"
          actions={
            <>
              <button
                className="button primary reader-action"
                type="button"
                onClick={() => onNavigate("pdfReader")}
              >
                <BookOpen size={16} />
                리더기 열기
              </button>
              <button
                className="button secondary"
                data-qa="bookmarks-open-library"
                type="button"
                onClick={() => onNavigate("documentLibrary")}
              >
                <Files size={16} />
                문서 라이브러리
              </button>
            </>
          }
        />
      </section>
    </div>
  );
}
