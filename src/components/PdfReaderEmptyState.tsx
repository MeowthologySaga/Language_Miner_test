import { FileText } from "lucide-react";
import type { AppSettings } from "../shared/types";

type PdfReaderEmptyStateProps = {
  isMakerMode: boolean;
  selectedTranslationModel: string;
  settings: AppSettings;
  onFileSelected: (file: File | undefined) => void;
};

export function PdfReaderEmptyState({
  isMakerMode,
  selectedTranslationModel,
  settings,
  onFileSelected
}: PdfReaderEmptyStateProps) {
  return (
    <div className="pdf-empty-state pdf-babeldoc-empty">
      <div className="pdf-babeldoc-config">
        <div className="pdf-babeldoc-brand">
          <strong>{isMakerMode ? "이중언어 책 만들기" : "리더기"}</strong>
          <span>
            {isMakerMode ? "좌우 대조: 원문 | 번역문" : "원문 PDF와 번역본을 나란히 봅니다"}
          </span>
        </div>
        <div className="pdf-babeldoc-form">
          <div className="pdf-job-field">
            <span>대상 언어</span>
            <strong>
              {settings.learningProfile.targetLanguage.nameKo} →{" "}
              {settings.learningProfile.nativeLanguage.nameKo}
            </strong>
          </div>
          <div className="pdf-job-field">
            <span>번역 서비스</span>
            <strong>{selectedTranslationModel}</strong>
          </div>
          <div className="pdf-job-field">
            <span>{isMakerMode ? "페이지 범위" : "보기 방식"}</span>
            <strong>{isMakerMode ? "PDF를 열면 선택 가능" : "현재 페이지"}</strong>
          </div>
          <div className="pdf-job-field">
            <span>대조 표시</span>
            <strong>좌우 대조: 원문 | 번역문</strong>
          </div>
        </div>
      </div>
      <label className="pdf-babeldoc-dropzone">
        <FileText size={34} />
        <strong>PDF 파일 선택</strong>
        <span>
          {isMakerMode
            ? `${settings.learningProfile.nativeLanguage.nameKo} 번역본을 함께 생성합니다`
            : `${settings.learningProfile.nativeLanguage.nameKo} 번역본을 오른쪽에서 봅니다`}
        </span>
        <input
          accept="application/pdf"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            onFileSelected(file);
          }}
        />
      </label>
    </div>
  );
}
