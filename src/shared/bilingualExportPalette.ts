const segmentColors = [
  { border: "#ec4899", background: "rgba(236, 72, 153, 0.12)" },
  { border: "#0ea5e9", background: "rgba(14, 165, 233, 0.12)" },
  { border: "#22c55e", background: "rgba(34, 197, 94, 0.12)" },
  { border: "#f59e0b", background: "rgba(245, 158, 11, 0.14)" },
  { border: "#a855f7", background: "rgba(168, 85, 247, 0.12)" },
  { border: "#14b8a6", background: "rgba(20, 184, 166, 0.12)" },
  { border: "#6366f1", background: "rgba(99, 102, 241, 0.12)" },
  { border: "#f97316", background: "rgba(249, 115, 22, 0.13)" },
  { border: "#ef4444", background: "rgba(239, 68, 68, 0.11)" },
  { border: "#64748b", background: "rgba(100, 116, 139, 0.12)" }
];

export function getBilingualSegmentColor(index: number) {
  return segmentColors[getBilingualSegmentColorIndex(index)];
}

export function getBilingualSegmentColorIndex(index: number) {
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }

  return Math.floor(index) % segmentColors.length;
}

export function getBilingualSegmentColorIndexMap<T extends { id: string }>(segments: T[]) {
  return new Map(segments.map((segment, index) => [segment.id, index]));
}

export function renderBilingualSegmentColorStyle(index: number) {
  const color = getBilingualSegmentColor(index);
  return `--segment-color:${color.border};--segment-bg:${color.background}`;
}
