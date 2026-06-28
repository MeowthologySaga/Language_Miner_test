export const WEB_READER_DEFAULT_URL = "https://en.wikipedia.org/wiki/English_language";

export function normalizeWebReaderAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return WEB_READER_DEFAULT_URL;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}
