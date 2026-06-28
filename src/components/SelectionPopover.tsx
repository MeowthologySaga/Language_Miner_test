import { ListPlus, Loader2, Plus, X } from "lucide-react";
import { CardGenerationUsageEstimate } from "./CardGenerationUsageEstimate";
import type { CardGenerationUsageEstimate as CardGenerationUsageEstimateData } from "../shared/cardGenerationUsage";

type SelectionPopoverProps = {
  selectedText: string;
  position: {
    top: number;
    left: number;
  };
  loading: boolean;
  usageEstimate?: CardGenerationUsageEstimateData | null;
  warning?: string;
  onCreate: () => void;
  onStartSentenceTerms?: () => void;
  onDismiss: () => void;
};

export function SelectionPopover({
  selectedText,
  position,
  loading,
  warning,
  usageEstimate,
  onCreate,
  onStartSentenceTerms,
  onDismiss
}: SelectionPopoverProps) {
  return (
    <div
      className="selection-popover"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      <div className="selection-popover-text">{selectedText}</div>
      {warning ? <div className="selection-warning">{warning}</div> : null}
      <div className="selection-popover-actions">
        <div className="card-generation-action-row selection-card-generation-row">
          <CardGenerationUsageEstimate align="start" estimate={usageEstimate ?? null} variant="badge" />
          <button
            className="button primary selection-popover-button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCreate}
          >
            {loading ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
            문장카드
          </button>
        </div>
        {onStartSentenceTerms ? (
          <button
            className="button secondary selection-popover-button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onStartSentenceTerms}
          >
            <ListPlus size={14} />
            여러단어
          </button>
        ) : null}
        <button
          aria-label="닫기"
          className="icon-button selection-popover-close"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
