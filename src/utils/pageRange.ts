export function parsePageRange(input: {
  value: string;
  pageCount: number;
  fallbackPage: number;
}) {
  const normalized = input.value.trim();
  if (!normalized) {
    return [clampPage(input.fallbackPage, input.pageCount)];
  }

  const pages = new Set<number>();
  normalized.split(",").forEach((part) => {
    const token = part.trim();
    if (!token) {
      return;
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = clampPage(Number(rangeMatch[1]), input.pageCount);
      const end = clampPage(Number(rangeMatch[2]), input.pageCount);
      const direction = start <= end ? 1 : -1;
      for (let page = start; direction > 0 ? page <= end : page >= end; page += direction) {
        pages.add(page);
      }
      return;
    }

    const singlePage = Number(token);
    if (Number.isInteger(singlePage)) {
      pages.add(clampPage(singlePage, input.pageCount));
    }
  });

  if (pages.size === 0) {
    return [clampPage(input.fallbackPage, input.pageCount)];
  }

  return [...pages].sort((left, right) => left - right);
}

function clampPage(page: number, pageCount: number) {
  return Math.max(1, Math.min(pageCount || 1, page));
}
