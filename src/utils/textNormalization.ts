export function normalizeText(text: string): string {
  return text
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2")
    .replace(/\r?\n+/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
