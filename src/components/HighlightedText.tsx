import type { HighlightColorKey, HighlightMapping } from "../shared/types";

type HighlightedTextProps = {
  text?: string;
  mappings: HighlightMapping[];
  target: "source" | "literal" | "natural";
  className?: string;
};

type Match = {
  start: number;
  end: number;
  colorKey: HighlightColorKey;
};

type Candidate = {
  value: string;
  colorKey: HighlightColorKey;
};

export function HighlightedText({
  text = "",
  mappings,
  target,
  className
}: HighlightedTextProps) {
  const matches = findMatches(text, mappings, target);

  if (matches.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }
    parts.push(
      <mark
        key={`${match.start}-${match.end}-${index}`}
        className={`highlight highlight-${match.colorKey}`}
      >
        {text.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <span className={className}>{parts}</span>;
}

function findMatches(
  text: string,
  mappings: HighlightMapping[],
  target: HighlightedTextProps["target"]
): Match[] {
  const candidates = mappings
    .map((mapping) => ({
      value: getMappingValue(mapping, target),
      colorKey: mapping.colorKey
    }))
    .filter((candidate) => candidate.value.trim().length > 0);

  const matches: Match[] = [];
  for (const candidate of candidates) {
    const exactMatches = findExactMatches(text, candidate, target);
    if (exactMatches.length > 0) {
      matches.push(...exactMatches);
      continue;
    }

    if (target !== "source") {
      matches.push(...findTranslationFallbackMatches(text, candidate));
    }
  }

  return matches
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<Match[]>((accepted, match) => {
      const overlaps = accepted.some(
        (existing) => match.start < existing.end && match.end > existing.start
      );
      return overlaps ? accepted : [...accepted, match];
    }, []);
}

function findExactMatches(
  text: string,
  candidate: Candidate,
  target: HighlightedTextProps["target"]
): Match[] {
  const escaped = escapeRegExp(candidate.value.trim());
  const regex = new RegExp(escaped, target === "source" ? "gi" : "g");
  const matches: Match[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      colorKey: candidate.colorKey
    });

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return matches;
}

function findTranslationFallbackMatches(text: string, candidate: Candidate): Match[] {
  const fallbackValues = getTranslationFallbackValues(candidate.value);
  for (const value of fallbackValues) {
    const index = text.indexOf(value);
    if (index >= 0) {
      return [
        {
          start: index,
          end: index + value.length,
          colorKey: candidate.colorKey
        }
      ];
    }
  }
  const koreanStemMatch = findKoreanStemFallbackMatch(text, candidate);
  if (koreanStemMatch) {
    return [koreanStemMatch];
  }
  return [];
}

function findKoreanStemFallbackMatch(text: string, candidate: Candidate): Match | null {
  for (const stem of getKoreanStemCandidates(candidate.value)) {
    const index = text.indexOf(stem);
    if (index >= 0) {
      return {
        start: index,
        end: index + stem.length,
        colorKey: candidate.colorKey
      };
    }
  }
  return null;
}

function getKoreanStemCandidates(value: string) {
  const tokens = value
    .replace(/[()[\]{}"'“”‘’.,!?;:·•]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{Script=Hangul}]/gu, "").trim())
    .filter((token) => token.length >= 2);
  const candidates: string[] = [];
  for (const token of tokens) {
    candidates.push(token.replace(/들$/u, ""));
    candidates.push(
      token.replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, "")
    );
    candidates.push(
      token
        .replace(/들$/u, "")
        .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, "")
    );
  }
  return Array.from(new Set(candidates))
    .filter((candidate) => candidate.length >= 2)
    .sort((left, right) => right.length - left.length);
}

function getTranslationFallbackValues(value: string) {
  const tokens = value
    .replace(/[()[\]{}"'“”‘’.,!?;:·•/]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const values: string[] = [];
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (isUsefulTranslationFallbackValue(phrase, size)) {
        values.push(phrase);
      }
    }
  }

  return Array.from(new Set(values)).sort((left, right) => right.length - left.length);
}

function isUsefulTranslationFallbackValue(value: string, tokenCount: number) {
  if (tokenCount === 1 && value.length < 2) {
    return false;
  }
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2) {
    return false;
  }
  return !/^(?:것|것도|수|때|듯|및|또는|그리고|하지만|정도|상태|현재|선택|기본|문맥|의미)$/.test(
    value
  );
}

function getMappingValue(
  mapping: HighlightMapping,
  target: HighlightedTextProps["target"]
) {
  if (target === "literal") {
    return mapping.literalKo ?? "";
  }
  if (target === "natural") {
    return mapping.naturalKo ?? "";
  }
  return mapping.sourceText;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
