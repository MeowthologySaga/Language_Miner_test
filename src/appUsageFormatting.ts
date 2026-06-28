export function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

export function formatUsageCost(value: number) {
  const rounded = Math.max(0, Math.round(value));
  if (rounded === 0) {
    return "₩0";
  }
  return `약 ₩${rounded.toLocaleString("ko-KR")}`;
}

export function formatElectricityCost(value: number) {
  if (value > 0 && value < 1) {
    return "₩1 미만";
  }
  return formatUsageCost(value);
}

export function formatLocalRuntime(minutes: number) {
  if (minutes <= 0) {
    return "0분";
  }
  if (minutes < 1) {
    return "1분 미만";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}분`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

export function formatUsageLimit(value: number) {
  const rounded = Math.max(0, Math.round(value));
  return rounded > 0 ? `₩${rounded.toLocaleString("ko-KR")}` : "한도 없음";
}

export function getUsageLimitChipClassName(percent: number) {
  if (percent >= 90) {
    return "sidebar-limit-chip danger";
  }
  if (percent >= 70) {
    return "sidebar-limit-chip warning";
  }
  return "sidebar-limit-chip";
}
