import { languagePresets } from "../shared/languages";
import type { AppSettings } from "../shared/types";

type LanguageProfileEditorProps = {
  label: string;
  language: AppSettings["learningProfile"]["targetLanguage"];
  onChange: (language: AppSettings["learningProfile"]["targetLanguage"]) => void;
};

export function LanguageProfileEditor({
  label,
  language,
  onChange
}: LanguageProfileEditorProps) {
  return (
    <div className="language-profile-editor">
      <strong>{label}</strong>
      <div className="language-preset-row">
        {languagePresets.map((preset) => (
          <button
            key={`${label}-${preset.code}`}
            className={
              language.code === preset.code
                ? "language-preset-button active"
                : "language-preset-button"
            }
            type="button"
            onClick={() => onChange(preset)}
          >
            {preset.nameKo}
          </button>
        ))}
      </div>
      <div className="language-field-grid">
        <label className="field-label">
          code
          <input
            className="text-input"
            value={language.code}
            onChange={(event) => onChange({ ...language, code: event.target.value })}
          />
        </label>
        <label className="field-label">
          Korean label
          <input
            className="text-input"
            value={language.nameKo}
            onChange={(event) => onChange({ ...language, nameKo: event.target.value })}
          />
        </label>
        <label className="field-label">
          English label
          <input
            className="text-input"
            value={language.nameEn}
            onChange={(event) => onChange({ ...language, nameEn: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
