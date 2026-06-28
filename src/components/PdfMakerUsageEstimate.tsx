import {
  formatCompactNumber,
  formatKrwRange,
  type TranslationUsageEstimate
} from "../shared/translationUsage";

type UsageMeterProps = {
  label: string;
  value: string;
  percent: number;
};

type PdfMakerUsageEstimateProps = {
  estimate: TranslationUsageEstimate | null;
  makerFreeTierLimitBlocked: boolean;
  makerMonthlyLimitBlocked: boolean;
  makerUsageStatus: string;
  providerLabel: string;
};

function UsageMeter({ label, value, percent }: UsageMeterProps) {
  return (
    <div className="usage-meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="usage-meter-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </span>
    </div>
  );
}

export function PdfMakerUsageEstimate({
  estimate,
  makerFreeTierLimitBlocked,
  makerMonthlyLimitBlocked,
  makerUsageStatus,
  providerLabel
}: PdfMakerUsageEstimateProps) {
  const totalTokens = estimate
    ? `${formatCompactNumber(estimate.totalTokens.min)} ~ ${formatCompactNumber(
        estimate.totalTokens.max
      )}`
    : "-";
  const inputTokens = estimate
    ? `${formatCompactNumber(estimate.inputTokens.min)} ~ ${formatCompactNumber(
        estimate.inputTokens.max
      )}`
    : "-";
  const outputTokens = estimate
    ? `${formatCompactNumber(estimate.outputTokens.min)} ~ ${formatCompactNumber(
        estimate.outputTokens.max
      )}`
    : "-";
  const dailyMax = estimate?.dailyLimitUsagePercent.max ?? 0;
  const retryReserve = estimate ? Math.min(100, Math.max(8, Math.round(dailyMax * 0.1))) : 0;

  return (
    <div className="pdf-maker-usage-card" data-qa="book-maker-usage-estimate">
      <div className="pdf-maker-usage-header">
        <div>
          <span>작업 전 예상</span>
          <strong>{estimate ? formatKrwRange(estimate.estimatedCostKrw) : "계산 중"}</strong>
        </div>
        <span className={estimate?.freeTier ? "usage-badge free" : "usage-badge"}>
          {estimate?.freeTier ? "무료등급" : providerLabel}
        </span>
      </div>
      <div className="pdf-maker-usage-grid">
        <div>
          <span>예상 토큰</span>
          <strong>{totalTokens}</strong>
        </div>
        <div>
          <span>무료/일일 한도 사용</span>
          <strong>
            {estimate
              ? `${estimate.dailyLimitUsagePercent.min}% ~ ${estimate.dailyLimitUsagePercent.max}%`
              : "-"}
          </strong>
        </div>
        <div>
          <span>캐시 절감 예상</span>
          <strong>{estimate ? `${estimate.cacheSavingsPercent}%` : "-"}</strong>
        </div>
      </div>
      <div className="usage-meter-list">
        <UsageMeter
          label="입력 토큰"
          value={inputTokens}
          percent={estimate?.dailyLimitUsagePercent.max ?? 0}
        />
        <UsageMeter
          label="출력 토큰"
          value={outputTokens}
          percent={estimate?.dailyLimitUsagePercent.max ?? 0}
        />
        <UsageMeter label="재시도 여유분" value={`+${retryReserve}%`} percent={retryReserve} />
      </div>
      {makerFreeTierLimitBlocked ? (
        <p className="selection-warning compact">무료 한도 초과가 예상되어 시작을 막았습니다.</p>
      ) : null}
      {makerMonthlyLimitBlocked ? (
        <p className="selection-warning compact">월 지출 한도 초과가 예상되어 시작을 막았습니다.</p>
      ) : null}
      <p className="muted compact">
        {makerUsageStatus || "예상 금액입니다. 실제 청구액과 다를 수 있습니다."}
      </p>
    </div>
  );
}
