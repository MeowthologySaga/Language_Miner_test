import { BookMarked, BookOpen, CreditCard, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { buildGlossaryEntries } from "../shared/glossary";
import type { StudyCard } from "../shared/types";

type GlossaryPageProps = {
  cards: StudyCard[];
  onNavigate: (route: "cards" | "pdfReader") => void;
};

export function GlossaryPage({ cards, onNavigate }: GlossaryPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const glossaryEntries = useMemo(() => buildGlossaryEntries(cards), [cards]);
  const filteredEntries = useMemo(
    () => buildGlossaryEntries(cards, searchQuery),
    [cards, searchQuery]
  );
  const hasGlossaryEntries = glossaryEntries.length > 0;

  return (
    <div className="document-page glossary-page">
      <section className="export-history-panel">
        <div className="document-section-heading glossary-heading">
          <div className="glossary-heading-copy">
            <h2>용어집</h2>
            <span>카드 용어 {glossaryEntries.length}개</span>
          </div>
          <div className="export-history-heading-actions">
            <button
              className="button secondary"
              data-qa="glossary-open-cards"
              type="button"
              onClick={() => onNavigate("cards")}
            >
              <CreditCard size={17} />
              카드 보기
            </button>
            <button
              className="button primary"
              data-qa="glossary-open-reader"
              type="button"
              onClick={() => onNavigate("pdfReader")}
            >
              <BookOpen size={17} />
              카드 만들기
            </button>
          </div>
        </div>

        <div className="glossary-toolbar">
          <label className="glossary-search">
            <Search size={16} />
            <input
              data-qa="glossary-search"
              type="search"
              placeholder="용어 검색"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <span className="glossary-count">표시 {filteredEntries.length}개</span>
        </div>

        <div className="glossary-table">
          <div className="document-row document-row-head glossary-row">
            <span>원문</span>
            <span>뜻</span>
            <span>정책</span>
            <span>출처</span>
          </div>
          {filteredEntries.map((entry) => (
            <div className="document-row glossary-row" key={entry.term}>
              <span className="glossary-term-cell">
                <strong>{entry.term}</strong>
                <small>{entry.partOfSpeech}</small>
              </span>
              <span className="glossary-meaning-cell">
                <strong>{entry.meaningKo}</strong>
                {entry.sourcePreview ? <small>{entry.sourcePreview}</small> : null}
              </span>
              <span>
                <span className="glossary-policy-pill">{entry.policyLabel}</span>
              </span>
              <span className="glossary-source-cell">
                카드 {entry.sourceCardCount}장
                {entry.exampleCount > 0 ? <small>예문 {entry.exampleCount}개</small> : null}
              </span>
            </div>
          ))}
          {filteredEntries.length === 0 ? (
            <div className="empty-document-state glossary-empty-state">
              <BookMarked size={32} />
              <strong>{hasGlossaryEntries ? "검색 결과 없음" : "카드 용어 없음"}</strong>
              <span>
                {hasGlossaryEntries
                  ? "다른 검색어로 다시 확인하세요."
                  : "저장된 카드의 용어가 여기에 표시됩니다."}
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
