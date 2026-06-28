import { Info } from "lucide-react";
import type { CardGenerationUsageEstimate as CardGenerationUsageEstimateData } from "../shared/cardGenerationUsage";

type CardGenerationUsageEstimateProps = {
  estimate: CardGenerationUsageEstimateData | null;
  variant?: "grid" | "badge";
  align?: "start" | "end";
  className?: string;
};

export function CardGenerationUsageEstimate({
  align = "end",
  className = "",
  estimate,
  variant = "grid"
}: CardGenerationUsageEstimateProps) {
  if (!estimate) {
    return null;
  }

  const rows = [
    { label: "예상 비용", value: estimate.costLabel },
    { label: "전기세", value: estimate.electricityLabel },
    { label: "토큰", value: estimate.tokenLabel },
    { label: "요청", value: estimate.requestLabel }
  ];
  const note = [estimate.runtimeLabel, estimate.note].filter(Boolean).join(" · ");

  if (variant === "badge") {
    return (
      <span
        className={`card-generation-usage-inline tooltip-align-${align} ${className}`.trim()}
        data-qa="card-generation-usage-estimate"
      >
        <span
          aria-label={`생성 예상 비용 ${estimate.costLabel}`}
          className="card-generation-usage-badge"
          tabIndex={0}
        >
          예상 {estimate.costLabel}
          <Info aria-hidden="true" size={12} />
        </span>
        <span className="card-generation-usage-tooltip" role="tooltip">
          <span className="card-generation-usage-tooltip-title">생성 예상</span>
          {rows.map((row) => (
            <span className="card-generation-usage-tooltip-row" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </span>
          ))}
          {note ? <span className="card-generation-usage-tooltip-note">{note}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <div className="card-generation-usage-estimate" data-qa="card-generation-usage-estimate">
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {note ? <p>{note}</p> : null}
    </div>
  );
}
